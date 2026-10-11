import { describe, expect, it } from "vite-plus/test";
import { srgbToOklab } from "@/core/color/oklab.js";
import {
  PERCEPTUAL_LIGHTNESS_WEIGHT,
  PERCEPTUAL_VARIETY_DISTANCE,
  RANKING_MIN_PRESENCE_DIVISOR,
} from "@/core/pipeline/parameters.js";
import { rankGroups } from "@/core/pipeline/rank.js";
import { rankWithVariety, type VarietyParameters } from "@/core/pipeline/variety.js";

const DELTA = PERCEPTUAL_VARIETY_DISTANCE;
const DEFAULTS: VarietyParameters = {
  lightnessWeight: PERCEPTUAL_LIGHTNESS_WEIGHT,
  distance: DELTA,
};

const RED = 0x8d0303;
/** A shade of RED: the variety distance is about 0.031. */
const DARK_RED = 0x760202;
/** Far from both reds: about 0.32 from RED and 0.31 from DARK_RED. */
const BLUE = 0x1e50c8;
const GREEN = 0x40c080;

/** The variety distance, in the operation order of the module. */
function distance(first: number, second: number): number {
  const a = srgbToOklab(first >>> 16, (first >>> 8) & 0xff, first & 0xff);
  const b = srgbToOklab(second >>> 16, (second >>> 8) & 0xff, second & 0xff);
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(0.25 * dL * dL + da * da + db * db);
}

interface Ranked {
  groups: number[];
  scores: number[];
}

function rank(
  weights: number[],
  colors: number[],
  scores: number[],
  count = 16,
  parameters: VarietyParameters = DEFAULTS,
  total?: number,
): Ranked {
  const sum = weights.reduce((a, b) => a + b, 0);
  const result = rankWithVariety(
    Float64Array.from(weights),
    Uint32Array.from(colors),
    total ?? sum,
    RANKING_MIN_PRESENCE_DIVISOR,
    count,
    Float64Array.from(scores),
    parameters,
  );
  return { groups: Array.from(result.groups), scores: Array.from(result.scores) };
}

function plainOrder(
  weights: number[],
  colors: number[],
  scores: number[],
  count: number,
  total: number,
): number[] {
  return Array.from(
    rankGroups(
      Float64Array.from(weights),
      Uint32Array.from(colors),
      total,
      RANKING_MIN_PRESENCE_DIVISOR,
      count,
      Float64Array.from(scores),
    ).groups,
  );
}

/** A linear congruential generator (Numerical Recipes constants), deterministic. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

interface Batch {
  weights: number[];
  colors: number[];
  scores: number[];
  total: number;
}

/**
 * Random inputs with distinct colors, some tied scores, some zero scores, and some groups below
 * the minimum presence (a weight under 1 % of the total at the 10,000 divisor of the ranking).
 */
function batch(seed: number): Batch {
  const next = lcg(seed);
  const size = 1 + Math.floor(next() * 24);
  const weights: number[] = [];
  const colors: number[] = [];
  const scores: number[] = [];
  const used = new Set<number>();
  for (let g = 0; g < size; g++) {
    weights.push(next() < 0.15 ? 1 + Math.floor(next() * 40) : 1 + Math.floor(next() * 4) * 5_000);
    let color = Math.floor(next() * 0x1000000);
    while (used.has(color)) color = (color + 1) & 0xffffff;
    used.add(color);
    colors.push(color);
    const roll = next();
    scores.push(roll < 0.15 ? 0 : roll < 0.35 ? 0.5 : next());
  }
  const total = weights.reduce((a, b) => a + b, 0) + Math.floor(next() * 3_000);
  return { weights, colors, scores, total };
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function run(input: Batch, count: number, parameters: VarietyParameters = DEFAULTS): Ranked {
  return rank(input.weights, input.colors, input.scores, count, parameters, input.total);
}

describe("rankWithVariety", () => {
  it("moves a shade of a placed color below a different color", () => {
    // RED 1.0, its shade 0.9, and BLUE 0.5. Plain order: RED, DARK_RED, BLUE.
    const result = rank([600, 300, 100], [RED, DARK_RED, BLUE], [1, 0.9, 0.5]);
    expect(result.groups).toEqual([0, 2, 1]);
    const d = distance(RED, DARK_RED);
    expect(d).toBeLessThan(DELTA);
    expect(distance(RED, BLUE)).toBeGreaterThan(DELTA);
    expect(distance(DARK_RED, BLUE)).toBeGreaterThan(DELTA);
    expect(result.scores[0]).toBe(1);
    expect(result.scores[1]).toBe(0.5 * 1);
    expect(result.scores[2]).toBe(0.9 * (d / DELTA));
  });

  it("gives the first slot to the highest score, as the plain order does", () => {
    for (const seed of SEEDS) {
      const input = batch(seed);
      const plain = plainOrder(input.weights, input.colors, input.scores, 1, input.total);
      for (const distance of [0, 0.05, DELTA, 1, 10]) {
        const result = run(input, 1, { ...DEFAULTS, distance });
        expect(result.groups).toEqual(plain);
        expect(result.scores).toEqual([input.scores[plain[0]!]!]);
      }
    }
  });

  it("gives the plain order by score when the distance is 0", () => {
    for (const seed of SEEDS) {
      const input = batch(seed);
      const result = run(input, 16, { ...DEFAULTS, distance: 0 });
      const plain = plainOrder(input.weights, input.colors, input.scores, 16, input.total);
      expect(result.groups).toEqual(plain);
      expect(result.scores).toEqual(plain.map((g) => input.scores[g]!));
    }
  });

  it("returns a prefix of the full order for every smaller count", () => {
    for (const seed of SEEDS) {
      const input = batch(seed);
      const full = run(input, 16);
      for (let count = 1; count <= full.groups.length + 1; count++) {
        const partial = run(input, count);
        const length = Math.min(count, full.groups.length);
        expect(partial.groups).toEqual(full.groups.slice(0, length));
        expect(partial.scores).toEqual(full.scores.slice(0, length));
      }
    }
  });

  it("never increases the slot scores along the list", () => {
    for (const seed of SEEDS) {
      const input = batch(seed);
      for (const distance of [0.05, DELTA, 0.6]) {
        const { scores } = run(input, 16, { ...DEFAULTS, distance });
        for (let k = 1; k < scores.length; k++) {
          expect(scores[k]!).toBeLessThanOrEqual(scores[k - 1]!);
        }
      }
    }
  });

  it("returns each group at most once and never an unlisted one", () => {
    for (const seed of SEEDS) {
      const input = batch(seed);
      const { groups } = run(input, 16);
      expect(new Set(groups).size).toBe(groups.length);
      for (const g of groups) {
        expect(input.weights[g]! * RANKING_MIN_PRESENCE_DIVISOR).toBeGreaterThanOrEqual(
          input.total,
        );
      }
    }
  });

  it("breaks equal adjusted scores by weight, then RGB, then group index", () => {
    // With distance 0 the adjusted scores are the scores. Groups 0 to 3 tie at 0.5 and weight 40
    // except group 3 (weight 60). Order: group 3 (weight), then RGB ascending: group 2, 1, and
    // groups 0 and 4 (same RGB): the index decides.
    const result = rank(
      [40, 40, 40, 60, 40],
      [0x300000, 0x200000, 0x100000, 0x900000, 0x300000],
      [0.5, 0.5, 0.5, 0.5, 0.5],
      16,
      { ...DEFAULTS, distance: 0 },
    );
    expect(result.groups).toEqual([3, 2, 1, 0, 4]);
    expect(result.scores).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
  });

  it("falls back to the population order when every score is 0", () => {
    const weights = [30, 50, 50, 20];
    const colors = [0x111111, 0x333333, 0x222222, 0x444444];
    const result = rank(weights, colors, [0, 0, 0, 0]);
    expect(result.groups).toEqual([2, 1, 0, 3]);
    expect(result.scores).toEqual([0, 0, 0, 0]);
  });

  it("ties on adjusted score go to the weight even when the factor differs", () => {
    // Group 1 is a shade of group 0: raw 1, adjusted 1 * (d / 0.25). Group 2 has that exact
    // adjusted score as its raw score and a lower weight, so the weight orders 1 before 2.
    const d = distance(RED, DARK_RED);
    const tie = 1 * (d / DELTA);
    const result = rank([500, 300, 200], [RED, DARK_RED, BLUE], [1, 1, tie]);
    expect(result.groups).toEqual([0, 1, 2]);
    expect(result.scores).toEqual([1, tie, tie]);
  });

  it("gives factor 1 at d === distance and d / distance just below it", () => {
    const d = distance(RED, DARK_RED);
    const input = [
      [600, 400],
      [RED, DARK_RED],
      [1, 1],
    ] as const;
    const at = rank([...input[0]], [...input[1]], [...input[2]], 16, { ...DEFAULTS, distance: d });
    expect(at.scores).toEqual([1, 1]);
    const below = d * (1 - 1e-9);
    expect(
      rank([...input[0]], [...input[1]], [...input[2]], 16, { ...DEFAULTS, distance: below })
        .scores,
    ).toEqual([1, 1]);
    const above = d * (1 + 1e-9);
    expect(
      rank([...input[0]], [...input[1]], [...input[2]], 16, { ...DEFAULTS, distance: above })
        .scores,
    ).toEqual([1, d / above]);
  });

  it("uses the nearest placed color, not only the last one", () => {
    // RED, then BLUE; DARK_RED is far from BLUE but close to RED, so RED decides.
    const result = rank([500, 300, 200], [RED, BLUE, DARK_RED], [1, 0.8, 0.7]);
    expect(result.groups).toEqual([0, 1, 2]);
    expect(result.scores[2]).toBe(0.7 * (distance(RED, DARK_RED) / DELTA));
  });

  it("ignores unlisted groups, which never move another group down", () => {
    // Group 1 is a shade of group 0 with a high score but a weight under the minimum presence.
    const weights = [100_000, 1, 50_000];
    const colors = [RED, DARK_RED, BLUE];
    const result = rank(weights, colors, [0.6, 1, 0.5]);
    expect(result.groups).toEqual([0, 2]);
    expect(result.scores).toEqual([0.6, 0.5]);
    // Without the unlisted group the result is the same.
    const without = rank([100_000, 50_000], [RED, BLUE], [0.6, 0.5], 16, DEFAULTS, 150_001);
    expect(without.groups).toEqual([0, 1]);
    expect(without.scores).toEqual(result.scores);
  });

  it("returns fewer groups than requested when fewer are listed, and none for none", () => {
    expect(rank([10], [RED], [0.3], 5).groups).toEqual([0]);
    const empty = rankWithVariety(
      new Float64Array(0),
      new Uint32Array(0),
      0,
      RANKING_MIN_PRESENCE_DIVISOR,
      3,
      new Float64Array(0),
      DEFAULTS,
    );
    expect(empty.groups).toHaveLength(0);
    expect(empty.scores).toHaveLength(0);
  });

  it("does not mutate its inputs", () => {
    const input = batch(9);
    const weights = Float64Array.from(input.weights);
    const colors = Uint32Array.from(input.colors);
    const scores = Float64Array.from(input.scores);
    const parameters = { ...DEFAULTS };
    rankWithVariety(
      weights,
      colors,
      input.total,
      RANKING_MIN_PRESENCE_DIVISOR,
      16,
      scores,
      parameters,
    );
    expect(Array.from(weights)).toEqual(input.weights);
    expect(Array.from(colors)).toEqual(input.colors);
    expect(Array.from(scores)).toEqual(input.scores);
    expect(parameters).toEqual(DEFAULTS);
  });

  it("gives exact slot scores for a fixed input", () => {
    const result = rank([400, 300, 200, 100], [RED, DARK_RED, BLUE, GREEN], [0.8, 0.75, 0.5, 0.25]);
    // The shade comes last: 0.75 * (0.03145769898375933 / 0.25). Every other color is at least
    // 0.29 from the placed ones, so its score is unchanged.
    expect(result.groups).toEqual([0, 2, 3, 1]);
    expect(result.scores[0]).toBe(0.8);
    expect(result.scores[1]).toBe(0.5);
    expect(result.scores[2]).toBe(0.25);
    expect(result.scores[3]).toBe(0.09437309695127799);
  });
});
