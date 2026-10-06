import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  BoardRuleError,
  TEMPLATE_CATALOG,
  configureBoard,
  createBoard,
  moveItem,
  placeVoteResult,
  setBoardTemplate,
  setBoardMode,
  setBoardLocked,
  startBoard,
} from "./board.ts";

test("catalog exposes three general ranking templates with thirty retrieved item images", async () => {
  assert.deepEqual(TEMPLATE_CATALOG.map((template) => template.id), ["games", "movies", "series"]);
  for (const template of TEMPLATE_CATALOG) {
    assert.equal(template.items.length, 30);
    assert.ok(template.items.every((item) => item.imageUrl?.startsWith(`/template-images/${template.id}/`)));
    for (const item of template.items) {
      const imagePath = new URL(`../public${item.imageUrl}`, import.meta.url);
      await access(imagePath);
      const signature = (await readFile(imagePath)).subarray(0, 3).toString("hex");
      assert.equal(signature, "ffd8ff", `${item.name} must have a valid JPEG image`);
    }
    assert.ok(template.tiers.length >= 3);
  }
});

function liveBoard() {
  return startBoard(createBoard("host"), "host");
}

test("moving an item between tiers preserves every item exactly once", () => {
  const board = liveBoard();
  const moved = moveItem(board, {
    itemId: "games-minecraft",
    tierId: "s",
    beforeItemId: null,
  });

  assert.equal(moved.revision, board.revision + 1);
  assert.deepEqual(moved.lanes.s, ["games-minecraft"]);
  assert.equal(moved.lanes.unranked?.includes("games-minecraft"), false);
  assert.equal(Object.values(moved.lanes).flat().length, board.items.length);
});

test("reordering within a tier uses the requested neighbor", () => {
  let board = moveItem(liveBoard(), { itemId: "games-minecraft", tierId: "s", beforeItemId: null });
  board = moveItem(board, { itemId: "games-portal-2", tierId: "s", beforeItemId: null });
  board = moveItem(board, { itemId: "games-minecraft", tierId: "s", beforeItemId: "games-portal-2" });

  assert.deepEqual(board.lanes.s, ["games-minecraft", "games-portal-2"]);
});

test("unknown tiers and stale neighbor positions are rejected without mutation", () => {
  const board = liveBoard();

  assert.throws(
    () => moveItem(board, { itemId: "games-minecraft", tierId: "missing", beforeItemId: null }),
    BoardRuleError,
  );
  assert.throws(
    () => moveItem(board, { itemId: "games-minecraft", tierId: "s", beforeItemId: "missing" }),
    BoardRuleError,
  );
  assert.equal(board.lanes.unranked?.[0], "games-minecraft");
});

test("a locked board rejects moves", () => {
  const board = setBoardLocked(liveBoard(), "host", true);

  assert.throws(
    () => moveItem(board, { itemId: "games-minecraft", tierId: "s", beforeItemId: null }),
    /locked the board/,
  );
});

test("only the host can start or lock the board", () => {
  assert.throws(() => startBoard(createBoard("host"), "guest"), /Only the host/);
  assert.throws(() => setBoardLocked(liveBoard(), "guest", true), /Only the host/);
});

test("the host can select Vote Together before starting", () => {
  const board = setBoardMode(createBoard("host"), "host", "vote");
  const started = startBoard(board, "host");

  assert.equal(started.mode, "vote");
  assert.equal(started.phase, "voting");
  assert.throws(() => setBoardMode(started, "host", "live"), /only change in the lobby/);
});

test("a revealed vote places the item while preserving the rest of the board", () => {
  const board = startBoard(setBoardMode(createBoard("host"), "host", "vote"), "host");
  const placed = placeVoteResult(board, "games-minecraft", "a");

  assert.equal(placed.phase, "voting");
  assert.deepEqual(placed.lanes.a, ["games-minecraft"]);
  assert.equal(Object.values(placed.lanes).flat().length, board.items.length);
});

test("the host can switch templates in the lobby without leaving stale items", () => {
  const board = setBoardTemplate(createBoard("host"), "host", "movies");

  assert.equal(board.templateTitle, "Movies");
  assert.ok(board.items.some((item) => item.id === "movies-the-godfather"));
  assert.equal(board.lanes.unranked?.length, board.items.length);
  assert.equal(board.lanes.unranked?.includes("games-minecraft"), false);
  assert.throws(() => setBoardTemplate(board, "guest", "series"), /Only the host/);
  assert.throws(() => setBoardTemplate(startBoard(board, "host"), "host", "series"), /only change in the lobby/);
});

test("custom board settings rename and recolor tiers and allow image-only items", () => {
  const board = configureBoard(createBoard("host"), "host", {
    title: "Our co-op ranking",
    themeColor: "#48a999",
    tiers: [
      { id: "s", label: "Top", color: "#e86f51" },
      { id: "a", label: "Great", color: "#e6a647" },
      { id: "b", label: "Okay", color: "#d7bf57" },
    ],
    items: [
      { id: "photo-only", name: "", icon: "", imageId: "photo-only", showName: false },
      { id: "text-only", name: "Best game night", icon: "", showName: true },
    ],
  });

  assert.equal(board.templateTitle, "Our co-op ranking");
  assert.equal(board.themeColor, "#48a999");
  assert.deepEqual(board.tiers.map((tier) => tier.label), ["Top", "Great", "Okay"]);
  assert.deepEqual(board.lanes.unranked, ["photo-only", "text-only"]);
  assert.equal(board.items[0].showName, false);
});

test("custom board settings enforce host, tier count, and image quota", () => {
  const base = createBoard("host");
  const validConfiguration = {
    title: "Custom list",
    themeColor: "#48a999",
    tiers: base.tiers,
    items: base.items,
  };

  assert.throws(() => configureBoard(base, "guest", validConfiguration), /Only the host/);
  assert.throws(() => configureBoard(base, "host", { ...validConfiguration, tiers: [] }), /between 3 and 10 tiers/);
  assert.throws(() => configureBoard(base, "host", {
    ...validConfiguration,
    items: Array.from({ length: 13 }, (_, index) => ({
      id: `image-${index}`,
      name: "",
      icon: "",
      imageId: `image-${index}`,
    })),
  }), /up to 12 item photos/);
});

test("switching from a custom list to a built-in template restores its tier defaults", () => {
  const custom = configureBoard(createBoard("host"), "host", {
    title: "Custom",
    themeColor: "#48a999",
    tiers: [
      { id: "top", label: "Top", color: "#e86f51" },
      { id: "mid", label: "Mid", color: "#d7bf57" },
      { id: "low", label: "Low", color: "#638da8" },
    ],
    items: [{ id: "custom-item", name: "Custom item", icon: "" }],
  });
  const reset = setBoardTemplate(custom, "host", "series");

  assert.deepEqual(reset.tiers.map((tier) => tier.label), ["Essential", "Binge", "Solid", "Uneven", "Drop"]);
  assert.equal(reset.items.some((item) => item.id === "custom-item"), false);
  assert.equal(reset.lanes.unranked?.length, reset.items.length);
});
