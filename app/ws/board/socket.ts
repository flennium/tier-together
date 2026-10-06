import { defineWS } from "ludicord/ws/server";
import type { LudicordWebSocketClient } from "ludicord/ws/server";
import {
  configureBoard,
  createBoard,
  finishBoard,
  MAX_IMAGE_ITEMS,
  MAX_ITEM_IMAGE_LENGTH,
  moveItem,
  placeVoteResult,
  setBoardLocked,
  setBoardMode,
  setBoardTemplate,
  startBoard,
} from "@/lib/board";
import type { BoardConfiguration, BoardItem, BoardState, MoveItemOperation, Tier } from "@/lib/board";
import { aggregateVotes } from "@/lib/voting";
import type { TierVote, VoteResult } from "@/lib/voting";
import { isProductionDeployment } from "@/server/runtime-env";

interface Participant {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly role: "host" | "participant";
}

interface ParticipantProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
}

interface Room {
  board: BoardState;
  readonly clients: Map<string, ParticipantProfile>;
  readonly firstJoinedAt: Map<string, number>;
  readonly completedOperations: Set<string>;
  readonly operationOrder: string[];
  readonly votes: Map<string, string>;
  readonly itemImages: Map<string, string>;
  readonly voteResults: VoteResult[];
  readonly skippedVoteItems: Set<string>;
  currentVoteItemId: string | null;
  voteRound: number;
  voteDeadlineAt: number | null;
  voteTimer: ReturnType<typeof setTimeout> | null;
  hostTimer: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

interface MutationEnvelope {
  readonly operationId: string;
  readonly revision: number;
}

const rooms = new Map<string, Room>();
const MAX_REMEMBERED_OPERATIONS = 1_000;
const HOST_GRACE_PERIOD_MS = 15_000;
const VOTE_ROUND_DURATION_MS = 45_000;
const EMPTY_ROOM_RETENTION_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMutation(value: unknown): MutationEnvelope | null {
  if (!isRecord(value)) return null;
  if (typeof value.operationId !== "string" || value.operationId.length < 1 || value.operationId.length > 96) {
    return null;
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return null;
  return { operationId: value.operationId, revision: value.revision as number };
}

function roomIdentity(client: LudicordWebSocketClient): { readonly applicationId: string; readonly instanceId: string } | null {
  const applicationId = client.ludicord.applicationId;
  const instanceId = client.ludicord.instanceId;
  if (!applicationId || !instanceId) return null;
  return { applicationId, instanceId };
}

function roomKey(client: LudicordWebSocketClient): string | null {
  const identity = roomIdentity(client);
  return identity === null ? null : `${identity.applicationId}:${identity.instanceId}`;
}

function getRoom(client: LudicordWebSocketClient): Room {
  const identity = roomIdentity(client);
  if (identity === null) throw new Error("Verified Activity instance is required.");
  const key = `${identity.applicationId}:${identity.instanceId}`;
  let room = rooms.get(key);
  if (room === undefined) {
    room = {
      board: createBoard(client.ludicord.user.id),
      clients: new Map(),
      firstJoinedAt: new Map([[client.ludicord.user.id, Date.now()]]),
      completedOperations: new Set(),
      operationOrder: [],
      votes: new Map(),
      itemImages: new Map(),
      voteResults: [],
      skippedVoteItems: new Set(),
      currentVoteItemId: null,
      voteRound: 0,
      voteDeadlineAt: null,
      voteTimer: null,
      hostTimer: null,
      idleTimer: null,
    };
    rooms.set(key, room);
  }
  return room;
}

async function readyRoom(client: LudicordWebSocketClient): Promise<Room> {
  if (roomIdentity(client) === null) throw new Error("Verified Activity instance is required.");
  return getRoom(client);
}

function participantsFor(room: Room): Participant[] {
  const participants = new Map<string, Participant>();
  for (const profile of room.clients.values()) {
    participants.set(profile.userId, {
      ...profile,
      role: profile.userId === room.board.hostId ? "host" : "participant",
    });
  }
  return [...participants.values()];
}

function snapshot(room: Room, client: LudicordWebSocketClient) {
  const eligibleVoters = new Set([...room.clients.values()].map((participant) => participant.userId));
  return {
    board: room.board,
    participants: participantsFor(room),
    vote: room.currentVoteItemId === null ? null : {
      itemId: room.currentVoteItemId,
      round: room.voteRound,
      deadlineAt: room.voteDeadlineAt,
      received: [...room.votes.keys()].filter((userId) => eligibleVoters.has(userId)).length,
      eligible: eligibleVoters.size,
    },
    voteResults: room.voteResults,
  };
}

async function broadcastSnapshot(room: Room, client: LudicordWebSocketClient): Promise<void> {
  client.activity.broadcast("board:snapshot", snapshot(room, client), { includeSelf: true });
}

function rememberOperation(room: Room, key: string): void {
  room.completedOperations.add(key);
  room.operationOrder.push(key);
  if (room.operationOrder.length > MAX_REMEMBERED_OPERATIONS) {
    const expired = room.operationOrder.shift();
    if (expired !== undefined) room.completedOperations.delete(expired);
  }
}

function reject(client: LudicordWebSocketClient, room: Room, operationId: string | null, message: string): void {
  client.emit("board:rejected", {
    operationId,
    message,
    snapshot: snapshot(room, client),
  });
}

function isDuplicate(room: Room, client: LudicordWebSocketClient, operationId: string): boolean {
  return room.completedOperations.has(`${client.ludicord.user.id}:${operationId}`);
}

function readMove(value: unknown): MoveItemOperation | null {
  if (!isRecord(value)) return null;
  if (typeof value.itemId !== "string" || value.itemId.length > 128) return null;
  if (typeof value.tierId !== "string" || value.tierId.length > 64) return null;
  if (value.beforeItemId !== null &&
    (typeof value.beforeItemId !== "string" || value.beforeItemId.length > 128)) return null;
  return {
    itemId: value.itemId,
    tierId: value.tierId,
    beforeItemId: value.beforeItemId as string | null,
  };
}

function readBoardConfiguration(value: unknown): BoardConfiguration | null {
  if (!isRecord(value) ||
    typeof value.title !== "string" ||
    typeof value.themeColor !== "string" ||
    !Array.isArray(value.tiers) ||
    !Array.isArray(value.items)) return null;

  const tiers: Tier[] = [];
  for (const tier of value.tiers) {
    if (!isRecord(tier) || typeof tier.id !== "string" || typeof tier.label !== "string" || typeof tier.color !== "string") {
      return null;
    }
    tiers.push({ id: tier.id, label: tier.label, color: tier.color });
  }

  const items: BoardItem[] = [];
  for (const item of value.items) {
    if (!isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.icon !== "string" ||
      (item.imageId !== undefined && typeof item.imageId !== "string") ||
      (item.imageUrl !== undefined && (typeof item.imageUrl !== "string" ||
        (!item.imageUrl.startsWith("data:image/svg+xml,") &&
          !/^\/template-images\/(games|movies|series)\/[a-z0-9-]+\.jpg$/.test(item.imageUrl)) ||
        item.imageUrl.length > 4_000)) ||
      (item.showName !== undefined && typeof item.showName !== "boolean")) return null;
    items.push({
      id: item.id,
      name: item.name,
      icon: item.icon,
      ...(typeof item.imageId === "string" ? { imageId: item.imageId } : {}),
      ...(typeof item.imageUrl === "string" ? { imageUrl: item.imageUrl } : {}),
      ...(typeof item.showName === "boolean" ? { showName: item.showName } : {}),
    });
  }

  return { title: value.title, themeColor: value.themeColor, tiers, items };
}

function readItemImage(value: unknown): { readonly itemId: string; readonly dataUrl: string } | null {
  if (!isRecord(value) ||
    typeof value.itemId !== "string" ||
    value.itemId.length > 128 ||
    typeof value.dataUrl !== "string" ||
    value.dataUrl.length > MAX_ITEM_IMAGE_LENGTH ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)) return null;
  return { itemId: value.itemId, dataUrl: value.dataUrl };
}

function readImageUploads(
  value: unknown,
  configuration: BoardConfiguration,
): readonly { readonly itemId: string; readonly dataUrl: string }[] | null {
  if (!Array.isArray(value) || value.length > MAX_IMAGE_ITEMS) return null;
  const configuredItems = new Set(configuration.items
    .filter((item) => item.imageId !== undefined)
    .map((item) => item.id));
  const uploads: { readonly itemId: string; readonly dataUrl: string }[] = [];
  const uploadedIds = new Set<string>();
  let totalLength = 0;

  for (const entry of value) {
    const image = readItemImage(entry);
    if (image === null || !configuredItems.has(image.itemId) || uploadedIds.has(image.itemId)) return null;
    totalLength += image.dataUrl.length;
    if (totalLength > MAX_IMAGE_ITEMS * MAX_ITEM_IMAGE_LENGTH) return null;
    uploadedIds.add(image.itemId);
    uploads.push(image);
  }
  return uploads;
}

async function transferHost(
  room: Room,
  departedHostId: string,
  client: LudicordWebSocketClient,
): Promise<void> {
  room.hostTimer = null;
  if (room.board.phase === "finished" || room.board.hostId !== departedHostId) return;

  const connectedUsers = new Set([...room.clients.values()].map((participant) => participant.userId));
  if (connectedUsers.has(room.board.hostId) || connectedUsers.size === 0) return;
  const nextHostId = [...connectedUsers].sort((left, right) =>
    (room.firstJoinedAt.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (room.firstJoinedAt.get(right) ?? Number.MAX_SAFE_INTEGER)
  )[0];
  if (nextHostId === undefined) return;

  room.board = { ...room.board, hostId: nextHostId, revision: room.board.revision + 1 };
  await broadcastSnapshot(room, client);
}

function scheduleHostTransfer(
  room: Room,
  departedHostId: string,
  client: LudicordWebSocketClient,
  delay: number,
): void {
  room.hostTimer = setTimeout(() => {
    void (async () => {
      await transferHost(room, departedHostId, client);
    })().catch(() => client.close(1011, "Room persistence failed."));
  }, delay);
}

function scheduleVoteReveal(room: Room, client: LudicordWebSocketClient, delay: number): void {
  room.voteTimer = setTimeout(() => {
    void (async () => {
      await revealVote(room, client);
    })().catch(() => client.close(1011, "Room persistence failed."));
  }, delay);
}

async function startNextVoteRound(room: Room, client: LudicordWebSocketClient): Promise<void> {
  const itemId = (room.board.lanes.unranked ?? []).find((candidate) => !room.skippedVoteItems.has(candidate));
  room.votes.clear();
  room.currentVoteItemId = itemId ?? null;
  room.voteDeadlineAt = itemId === undefined ? null : Date.now() + VOTE_ROUND_DURATION_MS;

  if (room.voteTimer !== null) clearTimeout(room.voteTimer);
  room.voteTimer = null;

  if (itemId === undefined) {
    room.board = finishBoard(room.board, room.board.hostId);
    await broadcastSnapshot(room, client);
    return;
  }

  room.voteRound += 1;
  scheduleVoteReveal(room, client, VOTE_ROUND_DURATION_MS);
  await broadcastSnapshot(room, client);
}

async function revealVote(room: Room, client: LudicordWebSocketClient): Promise<void> {
  const itemId = room.currentVoteItemId;
  if (itemId === null || room.board.phase !== "voting") return;

  const connectedUsers = new Set([...room.clients.values()].map((participant) => participant.userId));
  const votes: TierVote[] = [...room.votes.entries()]
    .filter(([userId]) => connectedUsers.has(userId))
    .map(([userId, tierId]) => ({ userId, tierId }));

  if (votes.length === 0) {
    const skippedRound = room.voteRound;
    room.skippedVoteItems.add(itemId);
    await startNextVoteRound(room, client);
    client.activity.broadcast("vote:skipped", { itemId, round: skippedRound }, { includeSelf: true });
    return;
  }

  const result = aggregateVotes(itemId, room.board.tiers, votes);
  room.board = placeVoteResult(room.board, itemId, result.winningTierId);
  room.voteResults.push(result);
  await startNextVoteRound(room, client);
  client.activity.broadcast("vote:result", result, { includeSelf: true });
}

async function publishVoteProgress(room: Room, client: LudicordWebSocketClient): Promise<void> {
  await broadcastSnapshot(room, client);
}

export default defineWS({
  async connect(client) {
    let room: Room;
    try {
      room = await readyRoom(client);
    } catch {
      client.close(isProductionDeployment ? 1011 : 4403, "Room is unavailable.");
      return;
    }
    if (room.hostTimer !== null && room.board.hostId === client.ludicord.user.id) {
      clearTimeout(room.hostTimer);
      room.hostTimer = null;
    }
    if (room.idleTimer !== null) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
    room.firstJoinedAt.set(client.ludicord.user.id, room.firstJoinedAt.get(client.ludicord.user.id) ?? Date.now());
    room.clients.set(client.id, {
      userId: client.ludicord.user.id,
      displayName: client.ludicord.user.displayName,
      avatar: client.ludicord.user.avatar ?? null,
    });
    client.activity.join();
    try {
      await broadcastSnapshot(room, client);
    } catch {
      client.close(1011, "Room persistence failed.");
      return;
    }
    client.emit("board:assets", [...room.itemImages.entries()].map(([itemId, dataUrl]) => ({ itemId, dataUrl })));
    if (room.board.hostId !== client.ludicord.user.id &&
      ![...room.clients.values()].some((participant) => participant.userId === room.board.hostId) &&
      room.hostTimer === null) {
      const offlineHostId = room.board.hostId;
      scheduleHostTransfer(room, offlineHostId, client, HOST_GRACE_PERIOD_MS);
    }
    const existingVote = room.votes.get(client.ludicord.user.id);
    if (existingVote !== undefined && room.currentVoteItemId !== null) {
      client.emit("vote:ack", {
        itemId: room.currentVoteItemId,
        round: room.voteRound,
        tierId: existingVote,
      });
    }
    if (room.board.phase === "voting" && room.voteTimer === null && room.currentVoteItemId !== null) {
      const remaining = Math.max(0, (room.voteDeadlineAt ?? Date.now()) - Date.now());
      scheduleVoteReveal(room, client, remaining);
    }
  },
  events: {
    async "board:sync"(client) {
      const room = await readyRoom(client);
      client.emit("board:snapshot", snapshot(room, client));
      client.emit("board:assets", [...room.itemImages.entries()].map(([itemId, dataUrl]) => ({ itemId, dataUrl })));
      const existingVote = room.votes.get(client.ludicord.user.id);
      if (existingVote !== undefined && room.currentVoteItemId !== null) {
        client.emit("vote:ack", {
          itemId: room.currentVoteItemId,
          round: room.voteRound,
          tierId: existingVote,
        });
      }
    },
    async "session:set-template"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      const templateId = isRecord(data) ? data.templateId : undefined;
      if (mutation === null || typeof templateId !== "string" || templateId.length > 64) {
        reject(client, room, mutation?.operationId ?? null, "Invalid template selection.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      try {
        room.board = setBoardTemplate(room.board, client.ludicord.user.id, templateId);
        room.itemImages.clear();
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        await broadcastSnapshot(room, client);
        client.activity.broadcast("board:assets", [], { includeSelf: true });
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "Template selection rejected.");
      }
    },
    async "session:configure"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      const configuration = isRecord(data) ? readBoardConfiguration(data.configuration) : null;
      const imageUploads = !isRecord(data) || configuration === null
        ? null
        : readImageUploads(data.images, configuration);
      if (mutation === null || configuration === null || imageUploads === null) {
        reject(client, room, mutation?.operationId ?? null, "Invalid list configuration.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The list changed. Review the latest state and try again.");
        return;
      }
      try {
        const nextBoard = configureBoard(room.board, client.ludicord.user.id, configuration);
        const imageIds = new Set(nextBoard.items.flatMap((item) => item.imageId ? [item.imageId] : []));
        for (const itemId of room.itemImages.keys()) {
          if (!imageIds.has(itemId)) room.itemImages.delete(itemId);
        }
        for (const upload of imageUploads) room.itemImages.set(upload.itemId, upload.dataUrl);
        room.board = nextBoard;
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        await broadcastSnapshot(room, client);
        client.activity.broadcast("board:assets", [...room.itemImages.entries()].map(([itemId, dataUrl]) => ({ itemId, dataUrl })), { includeSelf: true });
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "List configuration rejected.");
      }
    },
    async "session:set-mode"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      const mode = isRecord(data) ? data.mode : undefined;
      if (mutation === null || (mode !== "live" && mode !== "vote")) {
        reject(client, room, mutation?.operationId ?? null, "Invalid mode request.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      try {
        room.board = setBoardMode(room.board, client.ludicord.user.id, mode);
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        await broadcastSnapshot(room, client);
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "Mode change rejected.");
      }
    },
    async "board:move"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      const operation = isRecord(data) ? readMove(data.operation) : null;
      if (mutation === null || operation === null) {
        reject(client, room, mutation?.operationId ?? null, "Invalid move request.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision > room.board.revision) {
        reject(client, room, mutation.operationId, "The operation is ahead of the current board.");
        return;
      }

      try {
        room.board = moveItem(room.board, operation);
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        await broadcastSnapshot(room, client);
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "Move rejected.");
      }
    },
    async "session:start"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      if (mutation === null) {
        reject(client, room, null, "Invalid start request.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      try {
        room.board = startBoard(room.board, client.ludicord.user.id);
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        if (room.board.phase === "voting") await startNextVoteRound(room, client);
        else await broadcastSnapshot(room, client);
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "Start rejected.");
      }
    },
    async "session:lock"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      const locked = isRecord(data) ? data.locked : undefined;
      if (mutation === null || typeof locked !== "boolean") {
        reject(client, room, mutation?.operationId ?? null, "Invalid lock request.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      try {
        room.board = setBoardLocked(room.board, client.ludicord.user.id, locked);
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        await broadcastSnapshot(room, client);
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "Lock request rejected.");
      }
    },
    async "session:finish"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      if (mutation === null) {
        reject(client, room, null, "Invalid finish request.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      try {
        room.board = finishBoard(room.board, client.ludicord.user.id);
        if (room.voteTimer !== null) clearTimeout(room.voteTimer);
        room.voteTimer = null;
        room.currentVoteItemId = null;
        room.voteDeadlineAt = null;
        rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
        await broadcastSnapshot(room, client);
      } catch (error) {
        reject(client, room, mutation.operationId, error instanceof Error ? error.message : "Finish rejected.");
      }
    },
    async "vote:submit"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      const tierId = isRecord(data) ? data.tierId : undefined;
      if (mutation === null || typeof tierId !== "string" || tierId.length > 64) {
        reject(client, room, mutation?.operationId ?? null, "Invalid vote.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) {
        client.emit("board:snapshot", snapshot(room, client));
        return;
      }
      if (room.board.phase !== "voting" || room.currentVoteItemId === null) {
        reject(client, room, mutation.operationId, "There is no open voting round.");
        return;
      }
      if (mutation.revision > room.board.revision ||
        !room.board.tiers.some((tier) => tier.id === tierId)) {
        reject(client, room, mutation.operationId, "That vote is no longer valid.");
        return;
      }

      room.votes.set(client.ludicord.user.id, tierId);
      rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
      try {
        await publishVoteProgress(room, client);
      } catch {
        reject(client, room, mutation.operationId, "Your vote could not be saved. Try again.");
        return;
      }
      client.emit("vote:ack", {
        itemId: room.currentVoteItemId,
        round: room.voteRound,
        tierId,
      });

      const activeUsers = new Set([...room.clients.values()].map((participant) => participant.userId));
      const activeVotes = [...room.votes.keys()].filter((userId) => activeUsers.has(userId));
      if (activeVotes.length === activeUsers.size && activeUsers.size > 0) await revealVote(room, client);
    },
    async "vote:retract"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      if (mutation === null) {
        reject(client, room, null, "Invalid vote retraction.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) return;
      if (room.board.phase !== "voting" || room.currentVoteItemId === null) {
        reject(client, room, mutation.operationId, "There is no open voting round.");
        return;
      }
      if (mutation.revision > room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      room.votes.delete(client.ludicord.user.id);
      rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
      try {
        await publishVoteProgress(room, client);
      } catch {
        reject(client, room, mutation.operationId, "Your vote could not be updated. Try again.");
        return;
      }
      client.emit("vote:ack", { itemId: room.currentVoteItemId, round: room.voteRound, tierId: null });
    },
    async "vote:reveal"(client, data) {
      const room = await readyRoom(client);
      const mutation = readMutation(data);
      if (mutation === null) {
        reject(client, room, null, "Invalid reveal request.");
        return;
      }
      if (isDuplicate(room, client, mutation.operationId)) return;
      if (mutation.revision !== room.board.revision) {
        reject(client, room, mutation.operationId, "The board changed. Review the latest state and try again.");
        return;
      }
      if (room.board.hostId !== client.ludicord.user.id) {
        reject(client, room, mutation.operationId, "Only the host can reveal votes.");
        return;
      }
      if (room.board.phase !== "voting" || room.currentVoteItemId === null) {
        reject(client, room, mutation.operationId, "There is no open voting round.");
        return;
      }
      rememberOperation(room, `${client.ludicord.user.id}:${mutation.operationId}`);
      if (room.voteTimer !== null) clearTimeout(room.voteTimer);
      room.voteTimer = null;
      await revealVote(room, client);
    },
  },
  async disconnect(client) {
    const key = roomKey(client);
    if (key === null) return;
    const room = rooms.get(key);
    if (room === undefined) return;
    room.clients.delete(client.id);
    if (room.clients.size === 0) {
      if (room.voteTimer !== null) clearTimeout(room.voteTimer);
      if (room.hostTimer !== null) clearTimeout(room.hostTimer);
      if (room.idleTimer !== null) clearTimeout(room.idleTimer);
      room.voteTimer = null;
      room.hostTimer = null;
      room.idleTimer = setTimeout(() => {
        if (room.clients.size === 0) rooms.delete(key);
        room.idleTimer = null;
      }, EMPTY_ROOM_RETENTION_MS);
      return;
    }
    await broadcastSnapshot(room, client);
    if (room.board.hostId === client.ludicord.user.id &&
      ![...room.clients.values()].some((participant) => participant.userId === room.board.hostId)) {
      scheduleHostTransfer(room, client.ludicord.user.id, client, HOST_GRACE_PERIOD_MS);
    }
  },
});
