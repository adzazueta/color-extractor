import { describe, expect, it } from "vite-plus/test";
import { rankGroups } from "@/core/pipeline/rank.js";
import { RANKING_MIN_PRESENCE_DIVISOR } from "@/core/pipeline/parameters.js";
import { mulberry32 } from "../helpers.js";

function rank(weights: number[], colors: number[], count: number, total?: number): number[] {
  const sum: number = weights.reduce((a, b) => a + b, 0);
  const result = rankGroups(
    Float64Array.from(weights),
    Uint32Array.from(colors),
    total ?? sum,
    RANKING_MIN_PRESENCE_DIVISOR,
    count,
  );
  return Array.from(result.groups);
}

describe("rankGroups", () => {
  it("orders by weight, descending", () => {
    // Total 90: every group passes the presence minimum.
    expect(rank([10, 50, 30], [1, 2, 3], 3)).toEqual([1, 2, 0]);
  });

  it("breaks weight ties by packed RGB ascending, then by group index", () => {
    // All weights tie at 40. Colors ascending: group 2 (0x100000), group 0 (0x300000), then
    // groups 1 and 3 (both 0x500000), where the group index decides: 1 before 3.
    const weights = [40, 40, 40, 40];
    expect(rank(weights, [0x300000, 0x500000, 0x100000, 0x500000], 4)).toEqual([2, 0, 1, 3]);
  });

  it("keeps a group whose weight is exactly at the presence minimum", () => {
    // Total 10,000 with divisor 10,000: a group of weight 1 gives 10,000 >= 10,000.
    const weights = [9_999, 1];
    expect(rank(weights, [1, 2], 5)).toEqual([0, 1]);
  });

  it("drops a group one below the presence minimum but keeps it in the denominator", () => {
    // Total 10,001 (the dropped group still counts): weight 1 gives 10,000 < 10,001, so it is dropped.
    expect(rank([10_000, 1], [1, 2], 5, 10_001)).toEqual([0]);
  });

  it("truncates to count 1, 5, and 16", () => {
    const random = mulberry32(7);
    const weights: number[] = [];
    const colors: number[] = [];
    for (let g = 0; g < 40; g++) {
      weights.push(1 + Math.floor(random() * 1000));
      colors.push(g * 4099);
    }
    const full = rank(weights, colors, 40);
    expect(full).toHaveLength(40);
    expect(rank(weights, colors, 1)).toEqual(full.slice(0, 1));
    expect(rank(weights, colors, 5)).toEqual(full.slice(0, 5));
    expect(rank(weights, colors, 16)).toEqual(full.slice(0, 16));
  });

  it("returns fewer groups than count without padding", () => {
    expect(rank([5, 3, 2], [7, 8, 9], 16)).toEqual([0, 1, 2]);
  });

  it("gives count 3 as a prefix of count 10", () => {
    const random = mulberry32(42);
    const weights: number[] = [];
    const colors: number[] = [];
    for (let g = 0; g < 20; g++) {
      weights.push(1 + Math.floor(random() * 50));
      colors.push(Math.floor(random() * 0xffffff));
    }
    const three = rank(weights, colors, 3);
    const ten = rank(weights, colors, 10);
    expect(ten.slice(0, 3)).toEqual(three);
    expect(three).toHaveLength(3);
  });

  it("returns no groups when there are none", () => {
    const result = rankGroups(
      new Float64Array(0),
      new Uint32Array(0),
      0,
      RANKING_MIN_PRESENCE_DIVISOR,
      5,
    );
    expect(result.groups).toBeInstanceOf(Uint8Array);
    expect(result.groups).toHaveLength(0);
  });

  it("handles a group of zero weight: it is dropped unless the total is zero too", () => {
    expect(rank([0, 10], [1, 2], 5)).toEqual([1]);
    expect(rank([0, 0], [1, 2], 5)).toEqual([0, 1]);
  });

  it("is deterministic", () => {
    const weights = [3, 7, 7, 1, 9, 9];
    const colors = [0x0a0b0c, 0x010203, 0x010203, 0xffffff, 0x000001, 0x000002];
    const first = rank(weights, colors, 6);
    for (let i = 0; i < 5; i++) {
      expect(rank(weights, colors, 6)).toEqual(first);
    }
  });

  it("does not mutate its inputs and returns a fresh array", () => {
    const weights = Float64Array.from([2, 9, 4]);
    const colors = Uint32Array.from([3, 2, 1]);
    const weightsCopy = weights.slice();
    const colorsCopy = colors.slice();
    const result = rankGroups(weights, colors, 15, RANKING_MIN_PRESENCE_DIVISOR, 3);
    expect(weights).toEqual(weightsCopy);
    expect(colors).toEqual(colorsCopy);
    expect(Array.from(result.groups)).toEqual([1, 2, 0]);
    expect(result.groups.buffer).not.toBe(weights.buffer);
    expect(result.groups.buffer).not.toBe(colors.buffer);
  });
});
