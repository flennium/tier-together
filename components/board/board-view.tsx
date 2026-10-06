import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  rectIntersection,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, Check, Eye, LayoutTemplate, Lock, LockOpen, MoveRight, Play, RefreshCw, Settings2, WifiOff, X } from "lucide-react";
import { useDiscordUser } from "ludicord/discord";
import { useWS } from "ludicord/ws/client";
import type { BoardConfiguration, BoardItem, BoardState, MoveItemOperation, Tier } from "@/lib/board";
import { moveItem, TEMPLATE_CATALOG, UNRANKED_LANE_ID } from "@/lib/board";
import type { VoteResult } from "@/lib/voting";
import RecapPanel from "@/components/board/recap-panel";
import SortableItem from "@/components/board/sortable-item";
import DroppableLane from "@/components/board/droppable-lane";
import TemplateEditor from "@/components/board/template-editor";
import { useGamepadNavigation } from "@/components/use-gamepad-navigation";

interface Participant {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly role: "host" | "participant";
}

interface BoardSnapshot {
  readonly board: BoardState;
  readonly participants: readonly Participant[];
  readonly vote: {
    readonly itemId: string;
    readonly round: number;
    readonly deadlineAt: number | null;
    readonly received: number;
    readonly eligible: number;
  } | null;
  readonly voteResults: readonly VoteResult[];
}

type VoteProgress = NonNullable<BoardSnapshot["vote"]>;
const PRIMARY_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40";
const SUBTLE_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-raised px-4 text-sm font-bold text-strong ring-1 ring-inset ring-white/12 hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-40";

const pointerFirstCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return [...pointerCollisions].sort((a, b) => {
      const aLane = String(a.id).startsWith("lane:") ? 1 : 0;
      const bLane = String(b.id).startsWith("lane:") ? 1 : 0;
      return aLane - bLane;
    });
  }
  return rectIntersection(args);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoardSnapshot(value: unknown): value is BoardSnapshot {
  if (!isRecord(value) || !isRecord(value.board)) return false;
  const board = value.board;
  return Number.isSafeInteger(board.revision) &&
    (board.phase === "lobby" || board.phase === "live" || board.phase === "voting" || board.phase === "finished") &&
    (board.mode === "live" || board.mode === "vote") &&
    typeof board.locked === "boolean" &&
    typeof board.hostId === "string" &&
    typeof board.templateId === "string" &&
    typeof board.templateTitle === "string" &&
      typeof board.themeColor === "string" &&
    typeof board.templateCategory === "string" &&
    Array.isArray(board.tiers) &&
    Array.isArray(board.items) &&
    isRecord(board.lanes) &&
    Array.isArray(value.participants) &&
    (value.vote === null || isVoteProgress(value.vote)) &&
    Array.isArray(value.voteResults);
}

function isVoteProgress(value: unknown): value is VoteProgress {
  return isRecord(value) &&
    typeof value.itemId === "string" &&
    Number.isSafeInteger(value.round) &&
    (value.deadlineAt === null || Number.isSafeInteger(value.deadlineAt)) &&
    Number.isSafeInteger(value.received) &&
    Number.isSafeInteger(value.eligible);
  }

function createOperationId(): string {
  return globalThis.crypto.randomUUID();
}

function getLaneLabel(tierId: string, tiers: readonly Tier[]): string {
  if (tierId === UNRANKED_LANE_ID) return "Unranked";
  return tiers.find((tier) => tier.id === tierId)?.label ?? tierId;
}

function getItem(items: readonly BoardItem[], itemId: string): BoardItem | undefined {
  return items.find((item) => item.id === itemId) ?? undefined;
}

export default function BoardView() {
  useGamepadNavigation();
  const user = useDiscordUser();
  const connection = useWS("/ws/board");
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [targetTierId, setTargetTierId] = useState(UNRANKED_LANE_ID);
  const [announcement, setAnnouncement] = useState("");
  const [rejection, setRejection] = useState("");
  const [itemImages, setItemImages] = useState<Record<string, string>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeDragItemId, setActiveDragItemId] = useState<string | null>(null);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [myVote, setMyVote] = useState<{ readonly itemId: string; readonly round: number; readonly tierId: string | null } | null>(null);

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => connection.on("board:snapshot", (data) => {
    if (!isBoardSnapshot(data)) return;
    setSnapshot({
      board: data.board,
      participants: data.participants.filter((entry): entry is Participant =>
        isRecord(entry) &&
        typeof entry.userId === "string" &&
        typeof entry.displayName === "string" &&
        (typeof entry.avatar === "string" || entry.avatar === null) &&
        (entry.role === "host" || entry.role === "participant")
      ),
      vote: data.vote,
      voteResults: data.voteResults as readonly VoteResult[],
    });
    setRejection("");
  }), [connection]);

  useEffect(() => connection.on("board:rejected", (data) => {
    if (!isRecord(data)) return;
    setRejection(typeof data.message === "string" ? data.message : "That move could not be applied.");
    if (isBoardSnapshot(data.snapshot)) setSnapshot(data.snapshot);
  }), [connection]);

  useEffect(() => connection.on("board:assets", (data) => {
    if (!Array.isArray(data)) return;
    const next: Record<string, string> = {};
    for (const entry of data) {
      if (isRecord(entry) && typeof entry.itemId === "string" && typeof entry.dataUrl === "string") {
        next[entry.itemId] = entry.dataUrl;
      }
    }
    setItemImages(next);
  }), [connection]);

  useEffect(() => connection.on("board:item-image", (data) => {
    if (!isRecord(data) || typeof data.itemId !== "string" || typeof data.dataUrl !== "string") return;
    setItemImages((current) => ({ ...current, [data.itemId as string]: data.dataUrl as string }));
  }), [connection]);

  useEffect(() => connection.on("vote:ack", (data) => {
    if (!isRecord(data) || typeof data.itemId !== "string" || !Number.isSafeInteger(data.round)) return;
    setMyVote({
      itemId: data.itemId,
      round: data.round as number,
      tierId: typeof data.tierId === "string" ? data.tierId : null,
    });
  }), [connection]);

  useEffect(() => {
    if (connection.status === "open") connection.emit("board:sync", {});
  }, [connection, connection.status]);

  useEffect(() => {
    if (snapshot !== null) {
      setSyncTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setSyncTimedOut(true), 8_000);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  const board = snapshot?.board ?? null;
  const vote = snapshot?.vote ?? null;
  const isHost = board !== null && user?.id === board.hostId;
  const canEdit = board?.phase === "live" && !board.locked && connection.status === "open";
  const itemById = new Map((board?.items ?? []).map((item) => [item.id, item]));
  const selectedItem = board === null || selectedItemId === null
    ? undefined
    : getItem(board.items, selectedItemId);
  const selectedLaneId = board === null || selectedItemId === null
    ? null
    : Object.keys(board.lanes).find((laneId) => board.lanes[laneId]?.includes(selectedItemId)) ?? null;

  useEffect(() => {
    if (selectedItemId !== null && board !== null && !board.items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [board, selectedItemId]);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedItemId(null);
      setEditorOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, []);

  function sendMove(operation: MoveItemOperation): void {
    if (board === null || !canEdit) return;
    const operationId = createOperationId();
    const revision = board.revision;
    setRejection("");
    setSnapshot((current) => {
      if (current === null) return current;
      try {
        return { ...current, board: moveItem(current.board, operation) };
      } catch {
        return current;
      }
    });
    connection.emit("board:move", { operationId, revision, operation });
    setAnnouncement(`${getItem(board.items, operation.itemId)?.name ?? "Item"} moved to ${getLaneLabel(operation.tierId, board.tiers)}.`);
  }

  function sendHostAction(
    event: "session:start" | "session:lock" | "session:finish" | "session:set-mode" | "session:set-template" | "session:configure" | "vote:reveal",
    extra: object = {},
  ): void {
    if (board === null || !isHost || connection.status !== "open") return;
    connection.emit(event, {
      operationId: createOperationId(),
      revision: board.revision,
      ...extra,
    });
    setRejection("");
  }

  function submitVote(tierId: string): void {
    if (board === null || board.phase !== "voting" || connection.status !== "open") return;
    connection.emit("vote:submit", {
      operationId: createOperationId(),
      revision: board.revision,
      tierId,
    });
    if (snapshot?.vote) {
      setMyVote({ itemId: snapshot.vote.itemId, round: snapshot.vote.round, tierId });
    }
  }

  function applyConfiguration(
    configuration: BoardConfiguration,
    images: readonly { readonly itemId: string; readonly dataUrl: string }[],
  ): void {
    if (board === null || !isHost || connection.status !== "open") return;
    connection.emit("session:configure", {
      operationId: createOperationId(),
      revision: board.revision,
      configuration,
      images,
    });
    setEditorOpen(false);
    setRejection("");
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveDragItemId(null);
    if (board === null || !canEdit || event.over === null) return;
    const itemId = String(event.active.id);
    const overId = String(event.over.id);
    if (itemId === overId) return;

    const targetTierId = overId.startsWith("lane:")
      ? overId.slice("lane:".length)
      : Object.keys(board.lanes).find((laneId) => board.lanes[laneId]?.includes(overId));
    if (targetTierId === undefined) return;
    const targetLane = (board.lanes[targetTierId] ?? []).filter((candidate) => candidate !== itemId);
    let beforeItemId: string | null = null;
    if (targetLane.includes(overId)) {
      const overIndex = targetLane.indexOf(overId);
      const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
      const activeCenter = activeRect === null
        ? event.over.rect.top
        : activeRect.top + activeRect.height / 2;
      const overCenter = event.over.rect.top + event.over.rect.height / 2;
      beforeItemId = targetLane[overIndex + (activeCenter > overCenter ? 1 : 0)] ?? null;
    }
    sendMove({ itemId, tierId: targetTierId, beforeItemId });
  }

  function moveSelectedToTarget(): void {
    if (selectedItemId === null) return;
    sendMove({ itemId: selectedItemId, tierId: targetTierId, beforeItemId: null });
  }

  function moveSelectedBy(direction: -1 | 1): void {
    if (board === null || selectedItemId === null || selectedLaneId === null) return;
    const lane = board.lanes[selectedLaneId] ?? [];
    const index = lane.indexOf(selectedItemId);
    if (index < 0) return;
    const beforeItemId = direction < 0
      ? lane[index - 1] ?? null
      : lane[index + 2] ?? null;
    if ((direction < 0 && index === 0) || (direction > 0 && index === lane.length - 1)) return;
    sendMove({ itemId: selectedItemId, tierId: selectedLaneId, beforeItemId });
  }

  function renderItem(itemId: string, laneId: string) {
    const item = itemById.get(itemId);
    if (item === undefined) return null;
    const selected = item.id === selectedItemId;
    const tierColor = board?.tiers.find((tier) => tier.id === laneId)?.color;

    return (
      <SortableItem
        key={item.id}
        item={item}
        laneLabel={getLaneLabel(laneId, board?.tiers ?? [])}
        imageUrl={(item.imageId ? itemImages[item.imageId] : undefined) ?? item.imageUrl}
        selected={selected}
        tierColor={tierColor}
        canDrag={Boolean(canEdit)}
        onSelect={() => {
          setSelectedItemId(selected ? null : item.id);
          setTargetTierId(laneId);
        }}
      />
    );
  }

  function renderTier(tier: Tier) {
    const lane = board?.lanes[tier.id] ?? [];
    return (
      <DroppableLane
        className="grid min-w-0 grid-cols-[3.75rem_minmax(0,1fr)] overflow-hidden rounded-xl bg-panel shadow-[0_8px_22px_rgba(0,0,0,.22)] sm:grid-cols-[4.75rem_minmax(0,1fr)]"
        key={tier.id}
        id={tier.id}
        label={`Tier ${tier.label}`}
      >
        <div className="grid min-h-20 place-content-center justify-items-center gap-1 px-2 text-center font-extrabold text-[#101218]" style={{ backgroundColor: tier.color }}>
          <span className="text-[clamp(1rem,4vw,1.35rem)]">{tier.label}</span>
          <small className="rounded-full bg-black/15 px-2 py-0.5 text-xs tabular-nums">{lane.length}</small>
        </div>
        <SortableContext items={[...lane]} strategy={horizontalListSortingStrategy}>
          <div className="flex min-h-20 min-w-0 items-stretch gap-2 overflow-x-auto p-2 [scrollbar-width:thin]">
            {lane.length > 0
              ? lane.map((itemId) => renderItem(itemId, tier.id))
              : <span className="grid min-h-16 place-items-center px-3 text-sm text-muted">Drop or place an item here</span>}
          </div>
        </SortableContext>
      </DroppableLane>
    );
  }

  function renderParticipants() {
    const participants = snapshot?.participants ?? [];
    return (
      <div className="flex min-h-11 items-center" aria-label={`${participants.length} participants in this Activity`}>
        {participants.slice(0, 5).map((participant) => (
          <span className="relative -ms-1 grid size-9 place-items-center overflow-visible rounded-full bg-raised text-sm font-bold ring-2 ring-canvas first:ms-0" key={participant.userId} title={`${participant.displayName}${participant.role === "host" ? " · Host" : ""}`}>
            {participant.avatar
              ? <img className="size-full rounded-full object-cover" src={participant.avatar} alt="" />
              : participant.displayName.trim().slice(0, 1).toUpperCase() || "?"}
            {participant.role === "host" && <span className="absolute -bottom-1 -end-1 grid size-4 place-items-center rounded-full bg-warning-dot text-[9px] font-extrabold text-black" aria-label="Host">H</span>}
          </span>
        ))}
        <span className="ms-2 whitespace-nowrap text-xs text-muted">{participants.length} here</span>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-[max(.75rem,var(--ludicord-safe-left))] pb-[max(6rem,var(--ludicord-safe-bottom))] pt-5 sm:px-[max(1.25rem,var(--ludicord-safe-left))] lg:pt-8" style={{ "--board-accent": board?.themeColor ?? "#4466ff" } as CSSProperties}>
      <a href="#shared-board" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-bold focus:text-black">Skip to shared board</a>
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-accent-soft"><LayoutTemplate size={15} aria-hidden="true" /> {board?.templateCategory ?? "Ranking"} <span aria-hidden="true">/</span> {board?.items.length ?? 0} items</p>
          <h1 className="mt-2 text-balance font-display text-[clamp(2rem,6vw,4.5rem)] font-bold leading-[.95] tracking-[-.03em]">{board?.templateTitle ?? "Choose a tier list"}</h1>
          <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-muted">{board?.phase === "lobby" ? "Pick a template, then rank it together in Discord." : "Rank the list together, one placement at a time."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {renderParticipants()}
          <span className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-panel px-3 text-xs font-bold ${syncTimedOut ? "text-danger" : connection.status === "open" ? "text-success" : "text-warning"}`}>
            <span className={`size-2 rounded-full ${syncTimedOut ? "bg-danger-dot" : connection.status === "open" ? "bg-success-dot" : "animate-pulse bg-warning-dot motion-reduce:animate-none"}`} aria-hidden="true" />
            {syncTimedOut ? "Unavailable" : connection.status === "open" ? "Synced" : connection.status === "reconnecting" ? "Reconnecting" : "Connecting"}
          </span>
        </div>
      </header>

      <section className="mb-5 flex flex-col gap-3 rounded-2xl bg-panel p-3 shadow-[0_10px_28px_rgba(0,0,0,.22)] xl:flex-row xl:items-center xl:justify-between" aria-label="Session controls">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-raised px-3 text-sm font-bold text-muted">
            <LayoutTemplate size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Template</span>
            <select
              className="min-h-11 min-w-0 flex-1 bg-transparent text-base font-bold text-ink outline-none md:max-w-64"
              value={board?.templateId ?? ""}
              disabled={!isHost || board?.phase !== "lobby"}
              onChange={(event) => sendHostAction("session:set-template", { templateId: event.target.value })}
              aria-label="Choose a tier list template"
            >
              {board?.templateId === "custom" && <option value="custom" disabled>Custom list</option>}
              {TEMPLATE_CATALOG.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1" role="group" aria-label="Ranking mode">
          <button
            type="button"
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-40 ${board?.mode === "live" ? "bg-[var(--board-accent)] text-white" : "text-muted hover:bg-white/6"}`}
            aria-pressed={board?.mode === "live"}
            disabled={!isHost || board?.phase !== "lobby"}
            onClick={() => sendHostAction("session:set-mode", { mode: "live" })}
          ><Check size={14} aria-hidden="true" /> Live Board</button>
          <button
            type="button"
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-40 ${board?.mode === "vote" ? "bg-[var(--board-accent)] text-white" : "text-muted hover:bg-white/6"}`}
            aria-pressed={board?.mode === "vote"}
            disabled={!isHost || board?.phase !== "lobby"}
            onClick={() => sendHostAction("session:set-mode", { mode: "vote" })}
          ><Eye size={14} aria-hidden="true" /> Vote Together</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          {board?.phase === "lobby" && isHost && (
            <button type="button" className={SUBTLE_BUTTON} onClick={() => setEditorOpen((open) => !open)} aria-expanded={editorOpen}>
              <Settings2 size={14} aria-hidden="true" /> {editorOpen ? "Close editor" : "Customize list"}
            </button>
          )}
          {board?.phase === "lobby" && isHost && (
            <button type="button" className={PRIMARY_BUTTON} disabled={connection.status !== "open"} onClick={() => sendHostAction("session:start")}>
              <Play size={14} aria-hidden="true" /> {board.mode === "vote" ? "Start voting" : "Start ranking"}
            </button>
          )}
          {board?.phase === "live" && isHost && (
            <>
              <button type="button" className={SUBTLE_BUTTON} onClick={() => sendHostAction("session:lock", { locked: !board.locked })}>
                {board.locked ? <LockOpen size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                {board.locked ? "Unlock board" : "Lock board"}
              </button>
              <button type="button" className={PRIMARY_BUTTON} onClick={() => sendHostAction("session:finish")}>
                <Check size={14} aria-hidden="true" /> Finish list
              </button>
            </>
          )}
          {board?.phase === "voting" && isHost && (
            <button type="button" className={SUBTLE_BUTTON} onClick={() => sendHostAction("session:finish")}>
              <Check size={14} aria-hidden="true" /> Finish list
            </button>
          )}
          {board?.phase === "finished" && <span className="inline-flex min-h-11 items-center rounded-lg bg-success-bg px-3 text-sm font-bold text-success">Session finished</span>}
        </div>
      </section>

      {rejection && <p className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger" role="alert">{rejection}</p>}
      {board !== null && board.phase === "lobby" && isHost && editorOpen && (
        <TemplateEditor
          board={board}
          images={itemImages}
          onApply={applyConfiguration}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {board === null ? (
        <section className="grid min-h-[45dvh] place-content-center justify-items-center gap-3 text-center" aria-live="polite">
          <span className="grid size-14 place-items-center rounded-2xl bg-raised" aria-hidden="true">
            {syncTimedOut ? <WifiOff size={24} /> : <img className="size-10 animate-pulse object-contain motion-reduce:animate-none" src="/brand/tier-together-mark.png" alt="" />}
          </span>
          <strong className="font-display text-2xl">{syncTimedOut ? "The room did not connect" : "Joining the room"}</strong>
          <span className="max-w-[46ch] text-muted">{syncTimedOut ? "Check your Discord Activity connection, then try again." : "Syncing the board with this Discord Activity."}</span>
          {syncTimedOut && (
            <button type="button" className={SUBTLE_BUTTON} onClick={() => window.location.reload()}>
              <RefreshCw size={14} aria-hidden="true" /> Retry connection
            </button>
          )}
        </section>
      ) : board.phase === "finished" ? (
        <RecapPanel board={board} voteResults={snapshot?.voteResults ?? []} images={itemImages} />
      ) : (
        <>
          {board.phase === "voting" && vote && (() => {
            const currentItem = getItem(board.items, vote.itemId);
            const currentVote = myVote?.itemId === vote.itemId && myVote.round === vote.round
              ? myVote.tierId
              : null;
            return (
              <section className="mb-5 rounded-2xl bg-panel p-4 shadow-[0_10px_28px_rgba(0,0,0,.22)] sm:p-5" aria-label="Vote Together round">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold tracking-[.08em] text-accent-soft">ROUND {vote.round} · PRIVATE VOTE</span>
                    <h2 className="mt-1 font-display text-2xl font-bold">{currentItem?.name || "Vote on this item"}</h2>
                    {((currentItem?.imageId && itemImages[currentItem.imageId]) || currentItem?.imageUrl) && (
                      <img className="mt-3 aspect-square w-28 rounded-xl object-cover shadow-[0_6px_18px_rgba(0,0,0,.28)] sm:w-36" src={(currentItem?.imageId && itemImages[currentItem.imageId]) || currentItem?.imageUrl} alt={currentItem?.name || "Current list item"} decoding="async" />
                    )}
                  </div>
                  <span className="rounded-lg bg-raised px-3 py-2 text-sm font-bold tabular-nums text-muted">{vote.received} / {vote.eligible} votes in</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Choose a tier">
                  {board.tiers.map((tier) => (
                    <button
                      type="button"
                      key={tier.id}
                      className={`grid min-h-16 place-content-center rounded-xl px-3 text-center ring-2 ring-inset transition-transform motion-reduce:transition-none ${currentVote === tier.id ? "scale-[1.02] bg-white/10 text-white ring-[var(--tier-color)]" : "bg-raised text-muted ring-transparent hover:bg-raised-hover"}`}
                      style={{ "--tier-color": tier.color } as CSSProperties}
                      aria-pressed={currentVote === tier.id}
                      disabled={connection.status !== "open"}
                      onClick={() => submitVote(tier.id)}
                    >
                      <span className="text-lg font-extrabold">{tier.label}</span>
                      <small className="text-xs">{currentVote === tier.id ? "Your vote" : "Choose"}</small>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
                  <span>{currentVote ? "Your vote is private until reveal." : "Choose a tier. You can change your vote before reveal."}</span>
                  {isHost && (
                    <button type="button" className={PRIMARY_BUTTON} disabled={vote.received === 0} onClick={() => sendHostAction("vote:reveal")}>
                      <Eye size={14} aria-hidden="true" /> Reveal votes
                    </button>
                  )}
                </div>
              </section>
            );
          })()}

          <DndContext
            sensors={dragSensors}
            collisionDetection={pointerFirstCollision}
            autoScroll={{ acceleration: 10, interval: 10, threshold: { x: 0.12, y: 0.12 } }}
            onDragStart={(event: DragStartEvent) => setActiveDragItemId(String(event.active.id))}
            onDragCancel={() => setActiveDragItemId(null)}
            onDragEnd={handleDragEnd}
          >
            <section id="shared-board" className="grid gap-2" aria-label="Shared tier board">
              {board.tiers.map(renderTier)}
            </section>

            <DroppableLane className="mt-5 rounded-2xl bg-panel p-3 shadow-[0_10px_28px_rgba(0,0,0,.22)] sm:p-4" id={UNRANKED_LANE_ID} label="Unranked items">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <span className="text-xs font-extrabold tracking-[.08em] text-accent-soft">UNRANKED ITEMS</span>
                  <h2 className="mt-1 font-display text-2xl font-bold">Items to place</h2>
                </div>
                <span className="rounded-lg bg-raised px-3 py-2 text-sm font-bold tabular-nums text-muted">{Math.max(0, (board.lanes[UNRANKED_LANE_ID] ?? []).length - (vote?.itemId ? 1 : 0))} items</span>
              </div>
              <SortableContext
                items={[...(board.lanes[UNRANKED_LANE_ID] ?? []).filter((itemId) => itemId !== vote?.itemId)]}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]">
                  {(board.lanes[UNRANKED_LANE_ID] ?? [])
                    .filter((itemId) => itemId !== vote?.itemId)
                    .map((itemId) => renderItem(itemId, UNRANKED_LANE_ID))}
                </div>
              </SortableContext>
            </DroppableLane>

            <DragOverlay dropAnimation={null}>
              {activeDragItemId && itemById.get(activeDragItemId) && (
                <div className="grid size-20 place-items-center overflow-hidden rounded-xl bg-raised text-center text-sm font-bold shadow-[0_18px_45px_rgba(0,0,0,.45)]" aria-hidden="true">
                  {(itemImages[activeDragItemId] ?? itemById.get(activeDragItemId)?.imageUrl)
                    ? <img className="size-full object-cover" src={itemImages[activeDragItemId] ?? itemById.get(activeDragItemId)?.imageUrl} alt="" decoding="async" />
                    : <span className="px-2 py-3">{itemById.get(activeDragItemId)?.name || "Unnamed item"}</span>}
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {selectedItem && selectedLaneId && (
            <section className="fixed inset-x-[max(.75rem,var(--ludicord-safe-left))] bottom-[max(.75rem,var(--ludicord-safe-bottom))] z-30 mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl bg-[#20232d] p-3 shadow-[0_18px_55px_rgba(0,0,0,.55)] ring-1 ring-inset ring-white/12 sm:flex-row sm:items-center" aria-label={`Move ${selectedItem.name || "image item"}`}>
              <div className="flex min-w-0 items-center gap-3 sm:max-w-52">
                {(selectedItem.imageId && itemImages[selectedItem.imageId]) || selectedItem.imageUrl
                  ? <img className="size-11 shrink-0 rounded-lg object-cover" src={(selectedItem.imageId && itemImages[selectedItem.imageId]) || selectedItem.imageUrl} alt="" />
                  : <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-canvas text-xs font-bold" aria-hidden="true">{selectedItem.name.slice(0, 2).toUpperCase()}</span>}
                <span className="truncate text-sm font-bold">{selectedItem.name || "Image item"}</span>
              </div>
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg bg-canvas px-3 text-sm text-muted">
                <span className="shrink-0">Place in</span>
                <select className="min-w-0 flex-1 bg-transparent font-bold text-ink outline-none" value={targetTierId} onChange={(event) => setTargetTierId(event.target.value)} disabled={!canEdit}>
                  <option value={UNRANKED_LANE_ID}>Unranked</option>
                  {board.tiers.map((tier) => <option key={tier.id} value={tier.id}>Tier {tier.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" className={SUBTLE_BUTTON} disabled={!canEdit || selectedLaneId !== targetTierId} onClick={() => moveSelectedBy(-1)}>
                  <ArrowUp size={14} aria-hidden="true" /> Move earlier
                </button>
                <button type="button" className={SUBTLE_BUTTON} disabled={!canEdit || selectedLaneId !== targetTierId} onClick={() => moveSelectedBy(1)}>
                  <ArrowDown size={14} aria-hidden="true" /> Move later
                </button>
                <button type="button" className={PRIMARY_BUTTON} disabled={!canEdit} onClick={moveSelectedToTarget}>
                  <MoveRight size={14} aria-hidden="true" /> Place item
                </button>
                <button type="button" className="grid size-11 place-items-center rounded-lg bg-canvas text-muted hover:text-white" onClick={() => setSelectedItemId(null)} aria-label="Close move controls"><X size={15} aria-hidden="true" /></button>
              </div>
            </section>
          )}

          {board.phase === "lobby" && (
            <p className="mt-4 text-center text-sm text-muted">{isHost ? "Start when everyone's in. The board is shared with this Activity." : "The host will start the ranking when the room is ready."}</p>
          )}
          {board.phase === "live" && board.locked && <p className="mt-4 text-center text-sm text-muted">The host paused edits. Your board is up to date.</p>}
        </>
      )}

      <div className="sr-only" aria-live="polite">{announcement}</div>
    </main>
  );
}
