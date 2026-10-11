import { srgbToOklabInto } from "@/core/color/oklab.js";
import { chainComparators, compareBy, reverseComparator } from "@/core/compare.js";

/** Constants of the perceptual variety rule (section 4.1 of the specification). */
export interface VarietyParameters {
  /** Weight of ΔL² in the variety distance (the contrast's 0.25: lightness counts half). */
  readonly lightnessWeight: number;
  /**
   * δ: a color closer than this to a color already placed is a shade of it, and its score is
   * multiplied by `d / δ`. 0 turns variety off (the plain order by score).
   */
  readonly distance: number;
}

/** Groups selected for the result, in rank order, with the score each had when it was placed. */
export interface VarietyRankResult {
  /** Returned groups in rank order (length ≤ count). */
  readonly groups: Uint8Array;
  /** Per slot: the adjusted score at selection time. Never increases along the list. */
  readonly scores: Float64Array;
}

/**
 * Perceptual order with variety. Keeps the groups whose weight passes the minimum presence (as
 * `rankGroups` does) and places them one at a time. A group not yet placed has the adjusted score
 * `scores[g] · f(d)`, where `d` is the distance from its representative color to the nearest color
 * already placed, `d(g, h) = sqrt(lightnessWeight · ΔL² + Δa² + Δb²)` in Oklab, and
 * `f(d) = d < distance ? d / distance : 1` (1 while nothing is placed). Each slot goes to the
 * group with the highest adjusted score, then the highest weight, then the lowest representative
 * packed RGB, then the lowest group index (a total order).
 *
 * - The first slot is the group with the highest score: the same as the plain order.
 * - Slot `k` does not depend on `count`, so a smaller `count` gives a prefix of a larger one.
 * - Adjusted scores never increase along the list: distances to the placed colors only shrink as
 *   colors are placed, `f` never decreases with `d`, and the slot-`k` group had the highest
 *   adjusted score at step `k`. Correctly rounded `÷` and `×` keep this exact in floating point.
 * - `distance = 0` gives the plain order by score (`d < 0` never holds).
 *
 * Only +, −, ×, ÷, and `Math.sqrt` are used, in a fixed order, so the result is the same in every
 * engine. The cost is O(count · G) distances with G ≤ 254 groups.
 *
 * Preconditions: `weights`, `colors`, and `scores` have the same length (≤ 254), `scores` are
 * finite and ≥ 0, `count ≥ 1`, `totalWeight` is the sum of all visible weights, and the weights
 * are integer alpha sums (so the presence comparison is exact). Inputs are not mutated.
 *
 * @param weights - Per group: its weight.
 * @param colors - Per group: packed RGB of its representative color.
 * @param totalWeight - Sum of all visible weights.
 * @param minPresenceDivisor - A group is returned when its weight times this reaches `totalWeight`.
 * @param count - Maximum number of groups to return.
 * @param scores - Per group: its perceptual score.
 * @param parameters - The constants of the variety rule.
 */
export function rankWithVariety(
  weights: Float64Array,
  colors: Uint32Array,
  totalWeight: number,
  minPresenceDivisor: number,
  count: number,
  scores: Float64Array,
  parameters: VarietyParameters,
): VarietyRankResult {
  const kept: number[] = [];
  for (let g = 0; g < weights.length; g++) {
    // Integer weights below 2^53: the product and the comparison are exact.
    if (weights[g]! * minPresenceDivisor >= totalWeight) {
      kept.push(g);
    }
  }
  const keptCount = kept.length;
  const lab = new Float64Array(3 * keptCount);
  for (let k = 0; k < keptCount; k++) {
    const rgb = colors[kept[k]!]!;
    srgbToOklabInto(rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff, lab, 3 * k);
  }

  const nearest = new Float64Array(keptCount).fill(Infinity);
  const placed = new Uint8Array(keptCount);
  const adjusted = new Float64Array(keptCount);
  const goesFirst = chainComparators<number>(
    reverseComparator(compareBy((k: number) => adjusted[k]!)),
    reverseComparator(compareBy((k: number) => weights[kept[k]!]!)),
    compareBy((k: number) => colors[kept[k]!]!),
    compareBy((k: number) => kept[k]!),
  );

  const { lightnessWeight, distance } = parameters;
  const resultCount = Math.min(count, keptCount);
  const groups = new Uint8Array(resultCount);
  const slotScores = new Float64Array(resultCount);
  for (let slot = 0; slot < resultCount; slot++) {
    let best = -1;
    for (let k = 0; k < keptCount; k++) {
      if (placed[k] === 1) continue;
      const d = nearest[k]!;
      adjusted[k] = scores[kept[k]!]! * (d < distance ? d / distance : 1);
      if (best < 0 || goesFirst(k, best) < 0) best = k;
    }
    placed[best] = 1;
    groups[slot] = kept[best]!;
    slotScores[slot] = adjusted[best]!;
    if (slot + 1 === resultCount) break;
    const L = lab[3 * best]!;
    const a = lab[3 * best + 1]!;
    const b = lab[3 * best + 2]!;
    for (let k = 0; k < keptCount; k++) {
      if (placed[k] === 1) continue;
      const dL = L - lab[3 * k]!;
      const da = a - lab[3 * k + 1]!;
      const db = b - lab[3 * k + 2]!;
      const d = Math.sqrt(lightnessWeight * dL * dL + da * da + db * db);
      if (d < nearest[k]!) nearest[k] = d;
    }
  }
  return { groups, scores: slotScores };
}
