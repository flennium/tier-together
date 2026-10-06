import assert from "node:assert/strict";
import test from "node:test";
import { createBoard, moveItem, startBoard } from "./board.ts";
import { calculateRecap } from "./recap.ts";

test("recap reports ranked, unranked, tier and vote highlights", () => {
  let board = startBoard(createBoard("host"), "host");
  board = moveItem(board, { itemId: "games-minecraft", tierId: "s", beforeItemId: null });
  board = moveItem(board, { itemId: "games-portal-2", tierId: "a", beforeItemId: null });
  const agreed = { itemId: "games-minecraft", controversy: 0.1 };
  const controversial = { itemId: "games-portal-2", controversy: 0.5 };

  const recap = calculateRecap(board, [controversial, agreed]);

  assert.equal(recap.rankedCount, 2);
  assert.equal(recap.unrankedCount, 28);
  assert.equal(recap.tierCounts.s, 1);
  assert.equal(recap.mostAgreed, agreed);
  assert.equal(recap.mostControversial, controversial);
});

test("recap handles live-board sessions without vote results", () => {
  const recap = calculateRecap(startBoard(createBoard("host"), "host"), []);

  assert.equal(recap.rankedCount, 0);
  assert.equal(recap.unrankedCount, 30);
  assert.equal(recap.mostAgreed, null);
  assert.equal(recap.mostControversial, null);
});

test("recap does not invent a controversy highlight when every score is tied", () => {
  const board = startBoard(createBoard("host"), "host");
  const voteResults = [
    { itemId: "games-minecraft", controversy: 0 },
    { itemId: "games-portal-2", controversy: 0 },
  ];

  assert.equal(calculateRecap(board, voteResults).mostControversial, null);
});
