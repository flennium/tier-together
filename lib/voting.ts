import type { Tier } from "@/lib/board";

export interface TierVote {
  readonly userId: string;
  readonly tierId: string;
}

export interface VoteResult {
  readonly itemId: string;
  readonly winningTierId: string;
  readonly distribution: Readonly<Record<string, number>>;
  readonly controversy: number;
  readonly controversyLabel: "Unanimous" | "Mostly agreed" | "Divisive" | "Chaos";
  readonly voteCount: number;
}

export class VoteRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoteRuleError";
  }
}

export function aggregateVotes(
  itemId: string,
  tiers: readonly Tier[],
  votes: readonly TierVote[],
): VoteResult {
  if (tiers.length < 2) throw new VoteRuleError("At least two tiers are required to vote.");
  if (votes.length === 0) throw new VoteRuleError("At least one vote is required to reveal a result.");

  const tierIndexes = new Map(tiers.map((tier, index) => [tier.id, index]));
  const userIds = new Set<string>();
  const indexes: number[] = [];
  const distribution: Record<string, number> = Object.fromEntries(tiers.map((tier) => [tier.id, 0]));

  for (const vote of votes) {
    const index = tierIndexes.get(vote.tierId);
    if (index === undefined) throw new VoteRuleError("A vote references an unknown tier.");
    if (userIds.has(vote.userId)) throw new VoteRuleError("A participant can submit only one vote per round.");
    userIds.add(vote.userId);
    indexes.push(index);
    distribution[vote.tierId] += 1;
  }

  indexes.sort((left, right) => left - right);
  const winningIndex = indexes[Math.floor(indexes.length / 2)];
  const winningTier = tiers[winningIndex];
  if (winningTier === undefined) throw new VoteRuleError("Could not resolve the winning tier.");

  const controversy = tiers.length === 1
    ? 0
    : indexes.reduce((sum, index) => sum + Math.abs(index - winningIndex), 0) /
      (indexes.length * (tiers.length - 1));

  return {
    itemId,
    winningTierId: winningTier.id,
    distribution,
    controversy,
    controversyLabel: labelControversy(controversy),
    voteCount: votes.length,
  };
}

function labelControversy(score: number): VoteResult["controversyLabel"] {
  if (score <= 0.14) return "Unanimous";
  if (score <= 0.34) return "Mostly agreed";
  if (score <= 0.59) return "Divisive";
  return "Chaos";
}