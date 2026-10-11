import { describe, expect, it } from "vite-plus/test";
import { srgbToOklab } from "@/core/color/oklab.js";
import { perceptualScores, type PerceptualParameters } from "@/core/pipeline/perceptual.js";
import {
  PERCEPTUAL_CHROMA_CAP,
  PERCEPTUAL_COLORFULNESS_WEIGHT,
  PERCEPTUAL_CONTRAST_WEIGHT,
  PERCEPTUAL_LIGHTNESS_WEIGHT,
  PERCEPTUAL_PRESENCE_DIVISOR,
  RANKING_MIN_PRESENCE_DIVISOR,
} from "@/core/pipeline/parameters.js";
import { mulberry32, toHex } from "../helpers.js";

const DEFAULTS: PerceptualParameters = {
  lightnessWeight: PERCEPTUAL_LIGHTNESS_WEIGHT,
  chromaCap: PERCEPTUAL_CHROMA_CAP,
  presenceDivisor: PERCEPTUAL_PRESENCE_DIVISOR,
  contrastWeight: PERCEPTUAL_CONTRAST_WEIGHT,
  colorfulnessWeight: PERCEPTUAL_COLORFULNESS_WEIGHT,
};
/** Only the relative contrast counts. */
const CONTRAST_ONLY: PerceptualParameters = {
  ...DEFAULTS,
  contrastWeight: 1,
  colorfulnessWeight: 0,
};
/** Only the colorfulness counts. */
const COLORFULNESS_ONLY: PerceptualParameters = {
  ...DEFAULTS,
  contrastWeight: 0,
  colorfulnessWeight: 1,
};

const RED = 0xff0000;
const BLUE = 0x0000ff;
const GREEN = 0x00ff00;
const DARK_RED = 0xcc0000;

function scores(
  weights: number[],
  colors: number[],
  parameters: PerceptualParameters = DEFAULTS,
  listedDivisor: number = RANKING_MIN_PRESENCE_DIVISOR,
): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  return Array.from(
    perceptualScores(
      Float64Array.from(weights),
      Uint32Array.from(colors),
      total,
      listedDivisor,
      parameters,
    ),
  );
}

/** Contrast distance of section 3.1, written out independently. */
function distance(first: number, second: number, lightnessWeight: number): number {
  const p = srgbToOklab(first >>> 16, (first >>> 8) & 0xff, first & 0xff);
  const q = srgbToOklab(second >>> 16, (second >>> 8) & 0xff, second & 0xff);
  const dL = p.L - q.L;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return Math.sqrt(lightnessWeight * dL * dL + da * da + db * db);
}

function chroma(rgb: number): number {
  const { a, b } = srgbToOklab(rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff);
  return Math.sqrt(a * a + b * b);
}

describe("perceptualScores: contrast with the rest of the image", () => {
  it("is the same distance for both of two groups, so both normalize to 1", () => {
    // W = 3 and presence divisor 3: both groups have full presence. K_0 = 1·d / 1 and
    // K_1 = 2·d / 2 are both exactly d, the largest.
    expect(scores([2, 1], [RED, BLUE], { ...CONTRAST_ONLY, presenceDivisor: 3 })).toEqual([1, 1]);
    // With the default weights: 0.15 · 1 + 0.85 · 1 = 1 (both colors have chroma above the cap).
    expect(scores([2, 1], [RED, BLUE], { ...DEFAULTS, presenceDivisor: 3 })).toEqual([1, 1]);
  });

  it("is the weighted mean distance to the other groups, divided by the largest", () => {
    // W = 4 and presence divisor 4: every group has full presence.
    const parameters = { ...CONTRAST_ONLY, presenceDivisor: 4 };
    const raw = scores([1, 1, 2], [RED, BLUE, GREEN], parameters);
    const d01 = distance(RED, BLUE, 0.25);
    const d02 = distance(RED, GREEN, 0.25);
    const d12 = distance(BLUE, GREEN, 0.25);
    const contrast = [(1 * d01 + 2 * d02) / 3, (1 * d01 + 2 * d12) / 3, (1 * d02 + 1 * d12) / 2];
    const largest = Math.max(...contrast);
    contrast.forEach((value, g) => expect(raw[g]).toBeCloseTo(value / largest, 14));
    expect(Math.max(...raw)).toBe(1);
  });

  it("weights ΔL² by lightnessWeight", () => {
    const quarter = scores([1, 1, 2], [RED, BLUE, GREEN], { ...CONTRAST_ONLY, presenceDivisor: 4 });
    const full = scores([1, 1, 2], [RED, BLUE, GREEN], {
      ...CONTRAST_ONLY,
      presenceDivisor: 4,
      lightnessWeight: 1,
    });
    const d = (first: number, second: number) => distance(first, second, 1);
    const contrast = [
      (1 * d(RED, BLUE) + 2 * d(RED, GREEN)) / 3,
      (1 * d(RED, BLUE) + 2 * d(BLUE, GREEN)) / 3,
      (1 * d(RED, GREEN) + 1 * d(BLUE, GREEN)) / 2,
    ];
    const largest = Math.max(...contrast);
    contrast.forEach((value, g) => expect(full[g]).toBeCloseTo(value / largest, 14));
    expect(full).not.toEqual(quarter);
  });

  it("is 0 for a single group, which has no rest", () => {
    // K = 0 and K_max = 0, so only the colorfulness counts: 0.15 · 0 + 0.85 · 1.
    expect(scores([7], [RED])).toEqual([0.85]);
    // Black is exactly (0, 0, 0) in Oklab: no contrast and no colorfulness.
    expect(scores([7], [0x000000])).toEqual([0]);
  });

  it("counts an unlisted group in the rest but not in the largest contrast", () => {
    // Listed divisor 4 and W = 10: groups 0 and 1 are listed (24 and 12 ≥ 10), group 2 is not
    // (4 < 10). Presence divisor 10 gives every group full presence.
    const raw = scores(
      [6, 3, 1],
      [RED, DARK_RED, GREEN],
      { ...CONTRAST_ONLY, presenceDivisor: 10 },
      4,
    );
    const d01 = distance(RED, DARK_RED, 0.25);
    const d02 = distance(RED, GREEN, 0.25);
    const d12 = distance(DARK_RED, GREEN, 0.25);
    const contrast = [(3 * d01 + 1 * d02) / 4, (6 * d01 + 1 * d12) / 7, (6 * d02 + 3 * d12) / 9];
    const largestListed = Math.max(contrast[0]!, contrast[1]!);
    contrast.forEach((value, g) => expect(raw[g]).toBeCloseTo(value / largestListed, 14));
    expect(Math.max(raw[0]!, raw[1]!)).toBe(1);
    // The far unlisted group has the largest contrast of all, above the listed maximum.
    expect(raw[2]).toBeGreaterThan(1);
  });
});

describe("perceptualScores: colorfulness", () => {
  it("is the chroma divided by the cap, and 1 at or above it", () => {
    // A single group: no contrast, full presence, so the score is the colorfulness.
    const muted = 0xa08070;
    const mutedChroma = chroma(muted);
    expect(mutedChroma).toBeGreaterThan(0.04);
    expect(mutedChroma).toBeLessThan(0.05);
    expect(scores([5], [muted], COLORFULNESS_ONLY)).toEqual([mutedChroma / 0.1]);
    // A cap of twice the chroma gives exactly 0.5.
    expect(scores([5], [muted], { ...COLORFULNESS_ONLY, chromaCap: 2 * mutedChroma })).toEqual([
      0.5,
    ]);
    // Red (chroma 0.26), blue (0.31), and green (0.29) are all capped.
    expect(chroma(RED)).toBeGreaterThan(0.2);
    expect(scores([5], [RED], COLORFULNESS_ONLY)).toEqual([1]);
    expect(scores([5], [BLUE], COLORFULNESS_ONLY)).toEqual([1]);
    expect(scores([5], [GREEN], COLORFULNESS_ONLY)).toEqual([1]);
    expect(scores([5], [0x000000], COLORFULNESS_ONLY)).toEqual([0]);
  });
});

describe("perceptualScores: presence", () => {
  it("is 1 from 2 % of the visible weight and linear below", () => {
    // Exactly at 2 %: 50 · 1 = 50 ≥ W = 50.
    expect(scores([1, 49], [RED, BLUE], COLORFULNESS_ONLY)).toEqual([1, 1]);
    expect(scores([2, 98], [RED, BLUE], COLORFULNESS_ONLY)).toEqual([1, 1]);
    // Just below: 50 · 1 = 50 < W = 51.
    expect(scores([1, 50], [RED, BLUE], COLORFULNESS_ONLY)).toEqual([50 / 51, 1]);
    expect(scores([1, 99], [RED, BLUE], COLORFULNESS_ONLY)).toEqual([0.5, 1]);
    expect(scores([1, 199], [RED, BLUE], COLORFULNESS_ONLY)).toEqual([0.25, 1]);
  });

  it("multiplies the whole score", () => {
    // A tenth of the 2 % (0.2 %): a tenth of the score, contrast included.
    const raw = scores([1, 499], [RED, BLUE], { ...DEFAULTS, presenceDivisor: 50 });
    const presence = 50 / 500;
    expect(raw[0]).toBeCloseTo(presence * (0.15 * 1 + 0.85 * 1), 15);
    expect(raw[0]).toBeLessThanOrEqual(presence);
  });
});

describe("perceptualScores: contract", () => {
  it("does not mutate its inputs and returns a fresh array", () => {
    const weights = Float64Array.from([5, 3, 2]);
    const colors = Uint32Array.from([RED, BLUE, GREEN]);
    const weightsCopy = weights.slice();
    const colorsCopy = colors.slice();
    const parameters = { ...DEFAULTS };
    const raw = perceptualScores(weights, colors, 10, RANKING_MIN_PRESENCE_DIVISOR, parameters);
    expect(weights).toEqual(weightsCopy);
    expect(colors).toEqual(colorsCopy);
    expect(parameters).toEqual(DEFAULTS);
    expect(raw).toBeInstanceOf(Float64Array);
    expect(raw).toHaveLength(3);
    expect(raw.buffer).not.toBe(weights.buffer);
  });

  it("gives exact bit patterns for a fixed input", () => {
    // 12 groups from a fixed seed, plus an unlisted group of weight 1 (W = 26,756). The bit
    // patterns must be the same in every engine and on every platform.
    const random = mulberry32(46);
    const weights: number[] = [];
    const colors: number[] = [];
    for (let g = 0; g < 12; g++) {
      weights.push(1 + Math.floor(random() * 5000));
      colors.push(Math.floor(random() * 0x1000000));
    }
    weights.push(1);
    colors.push(0x123456);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(26_756);
    expect(scores(weights, colors).map(toHex)).toEqual([
      "3fe11680b2d72cfe",
      "3fee8a0a58215f57",
      "3ff0000000000000",
      "3fef57ba3c164e58",
      "3fee26d9ef7a0b28",
      "3feae6ef9874d148",
      "3fee6b56c3d8cb6f",
      "3fef0d73de50f513",
      "3fe060b080f21299",
      "3fd3702a8fdfaab4",
      "3fef127df96fac47",
      "3fef1d353902dbe2",
      "3f55f490052a20b9",
    ]);
  });
});
