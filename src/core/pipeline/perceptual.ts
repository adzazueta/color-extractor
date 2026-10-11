import { srgbToOklabInto } from "@/core/color/oklab.js";

/** Constants of the perceptual score (section 4.1 of the specification). */
export interface PerceptualParameters {
  /** Weight of ΔL² in the contrast distance (0.25: lightness counts half). */
  readonly lightnessWeight: number;
  /** Oklab chroma at which colorfulness reaches 1. */
  readonly chromaCap: number;
  /** Full presence when `presenceDivisor · w ≥ W` (50: 2 %); linear below. */
  readonly presenceDivisor: number;
  /** Weight of the relative contrast in the score. */
  readonly contrastWeight: number;
  /** Weight of the colorfulness in the score. */
  readonly colorfulnessWeight: number;
}

/**
 * Raw perceptual score of every group, indexed by group. For a group `g` with weight `w_g`, visible
 * weight `W`, and the Oklab `(L, a, b)` of its representative color:
 *
 * - Contrast with the rest of the image: `K_g = Σ_{h ≠ g} w_h · d(g, h) / (W − w_g)`, the mean
 *   distance from `g` to the visible pixels of the other groups (0 when `W = w_g`), with
 *   `d(g, h) = sqrt(lightnessWeight · ΔL² + Δa² + Δb²)`. Every group, returned or not, is part of
 *   the rest. `K̂_g = K_g / max K` over the returned groups (those with
 *   `w · listedDivisor ≥ W`), and 0 when that maximum is 0.
 * - Colorfulness: `Ĉ_g = min(C_g, chromaCap) / chromaCap`, with `C_g = sqrt(a² + b²)`.
 * - Area, dampened, and minimum presence: `P_g = min(1, presenceDivisor · w_g / W)`.
 *
 * `raw_g = P_g · (contrastWeight · K̂_g + colorfulnessWeight · Ĉ_g)`, which is finite and ≥ 0. Sums
 * run in ascending group order, and only +, −, ×, ÷, and `Math.sqrt` are used, in a fixed order of
 * operations, so the result is the same in every engine.
 *
 * Preconditions: `weights.length === colors.length ≤ 254`, the weights are integer alpha sums (so
 * the presence comparisons are exact), and `totalWeight` is their sum and greater than 0. Inputs
 * are not mutated.
 *
 * @param weights - Per group: its weight.
 * @param colors - Per group: packed RGB of its representative color.
 * @param totalWeight - Sum of all visible weights.
 * @param listedDivisor - A group is returned when its weight times this reaches `totalWeight`.
 * @param parameters - The constants of the score.
 */
export function perceptualScores(
  weights: Float64Array,
  colors: Uint32Array,
  totalWeight: number,
  listedDivisor: number,
  parameters: PerceptualParameters,
): Float64Array {
  const count = weights.length;
  const lab = new Float64Array(3 * count);
  for (let g = 0; g < count; g++) {
    const rgb = colors[g]!;
    srgbToOklabInto(rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff, lab, 3 * g);
  }

  const contrast = new Float64Array(count);
  let maxContrast = 0;
  for (let g = 0; g < count; g++) {
    const L = lab[3 * g]!;
    const a = lab[3 * g + 1]!;
    const b = lab[3 * g + 2]!;
    let sum = 0;
    for (let h = 0; h < count; h++) {
      if (h === g) continue;
      const dL = L - lab[3 * h]!;
      const da = a - lab[3 * h + 1]!;
      const db = b - lab[3 * h + 2]!;
      sum += weights[h]! * Math.sqrt(parameters.lightnessWeight * dL * dL + da * da + db * db);
    }
    const rest = totalWeight - weights[g]!;
    const value = rest > 0 ? sum / rest : 0;
    contrast[g] = value;
    // Integer weights below 2^53: the product and the comparison are exact.
    if (weights[g]! * listedDivisor >= totalWeight && value > maxContrast) maxContrast = value;
  }

  const raw = new Float64Array(count);
  const cap = parameters.chromaCap;
  for (let g = 0; g < count; g++) {
    const a = lab[3 * g + 1]!;
    const b = lab[3 * g + 2]!;
    const chroma = Math.sqrt(a * a + b * b);
    const colorfulness = (chroma < cap ? chroma : cap) / cap;
    const relativeContrast = maxContrast > 0 ? contrast[g]! / maxContrast : 0;
    const scaled = weights[g]! * parameters.presenceDivisor;
    const presence = scaled >= totalWeight ? 1 : scaled / totalWeight;
    raw[g] =
      presence *
      (parameters.contrastWeight * relativeContrast + parameters.colorfulnessWeight * colorfulness);
  }
  return raw;
}
