import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TIERS } from "./board.ts";
import { aggregateVotes, VoteRuleError } from "./voting.ts";

function vote(userId, tierId) {
  return { userId, tierId };
}

test("a unanimous ballot resolves to its tier", () => {
  const result = aggregateVotes("item", DEFAULT_TIERS, [
    vote("one", "a"),
    vote("two", "a"),
  ]);

  assert.equal(result.winningTierId, "a");
  assert.equal(result.controversy, 0);
  assert.equal(result.controversyLabel, "Unanimous");
  assert.deepEqual(result.distribution, { s: 0, a: 2, b: 0, c: 0, d: 0 });
});

test("even vote splits bias toward the lower tier", () => {
  const result = aggregateVotes("item", DEFAULT_TIERS, [
    vote("one", "s"),
    vote("two", "a"),
  ]);

  assert.equal(result.winningTierId, "a");
  assert.equal(result.controversy, 0.125);
  assert.equal(result.controversyLabel, "Unanimous");
});

test("the median controversy score stays within its reachable range", () => {
  const result = aggregateVotes("item", DEFAULT_TIERS, [
    vote("one", "s"),
    vote("two", "d"),
  ]);

  assert.equal(result.winningTierId, "d");
  assert.equal(result.controversy, 0.5);
  assert.equal(result.controversyLabel, "Divisive");
});

test("duplicate voters and invalid tiers are rejected", () => {
  assert.throws(
    () => aggregateVotes("item", DEFAULT_TIERS, [vote("one", "a"), vote("one", "b")]),
    VoteRuleError,
  );
  assert.throws(
    () => aggregateVotes("item", DEFAULT_TIERS, [vote("one", "missing")]),
    VoteRuleError,
  );
});