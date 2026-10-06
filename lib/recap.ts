import type { BoardState } from "@/lib/board";
import type { VoteResult } from "@/lib/voting";

export interface RecapStats {
  readonly rankedCount: number;
  readonly unrankedCount: number;
  readonly tierCounts: Readonly<Record<string, number>>;
  readonly mostAgreed: VoteResult | null;
  readonly mostControversial: VoteResult | null;
}

export function calculateRecap(
  board: BoardState,
  voteResults: readonly VoteResult[],
): RecapStats {
  const tierCounts = Object.fromEntries(
    board.tiers.map((tier) => [tier.id, board.lanes[tier.id]?.length ?? 0]),
  );
  const rankedCount = Object.values(tierCounts).reduce((sum, count) => sum + count, 0);
  const orderedResults = [...voteResults].sort((left, right) => left.controversy - right.controversy);
  const firstResult = orderedResults[0] ?? null;
  const lastResult = orderedResults.at(-1) ?? null;

  return {
    rankedCount,
    unrankedCount: board.lanes.unranked?.length ?? 0,
    tierCounts,
    mostAgreed: firstResult,
    mostControversial: firstResult !== null && lastResult !== null &&
      lastResult.controversy > firstResult.controversy
      ? lastResult
      : null,
  };
}