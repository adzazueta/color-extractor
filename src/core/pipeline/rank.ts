import { chainComparators, compareBy, reverseComparator } from "@/core/compare.js";

/** Groups selected for the result, in rank order. */
export interface RankResult {
  /** Returned groups in rank order (length ≤ count). */
  readonly groups: Uint8Array;
}

/**
 * Keeps the groups whose weight passes the minimum presence and returns the first `count` of them,
 * ordered by weight (descending), then representative packed RGB (ascending), then group index.
 *
 * A group passes when `weights[g] * minPresenceDivisor >= totalWeight`. Groups that do not pass
 * still count in `totalWeight`. Fewer passing groups give fewer results, without padding.
 *
 * Preconditions: `weights.length === colors.length`, `count ≥ 1`, and `totalWeight` is the sum of
 * all visible weights. Inputs are not mutated.
 */
export function rankGroups(
  weights: Float64Array,
  colors: Uint32Array,
  totalWeight: number,
  minPresenceDivisor: number,
  count: number,
): RankResult {
  const groupCount: number = weights.length;
  const kept: number[] = [];
  for (let g = 0; g < groupCount; g++) {
    if (weights[g]! * minPresenceDivisor >= totalWeight) {
      kept.push(g);
    }
  }

  kept.sort(
    chainComparators<number>(
      reverseComparator(compareBy((g: number) => weights[g]!)),
      compareBy((g: number) => colors[g]!),
      compareBy((g: number) => g),
    ),
  );

  const resultCount: number = Math.min(count, kept.length);
  const groups: Uint8Array = new Uint8Array(resultCount);
  for (let s = 0; s < resultCount; s++) {
    groups[s] = kept[s]!;
  }
  return { groups };
}
