import { describe, expect, it } from "vite-plus/test";
import { chainComparators, compareBy, compareNumbers, reverseComparator } from "@/core/compare.js";

// Listed in the order the total order must produce.
const ORDERED: number[] = [
  Number.NEGATIVE_INFINITY,
  -1e300,
  -2.5,
  -1,
  -Number.MIN_VALUE,
  -0,
  0,
  Number.MIN_VALUE,
  0.5,
  1,
  3,
  1e300,
  Number.POSITIVE_INFINITY,
  Number.NaN,
];

describe("compareNumbers", () => {
  it("orders the fixed list as expected", () => {
    for (let i = 0; i < ORDERED.length; i++) {
      for (let j = 0; j < ORDERED.length; j++) {
        expect(compareNumbers(ORDERED[i]!, ORDERED[j]!)).toBe(Math.sign(i - j));
      }
    }
  });

  it("puts -0 before +0 and treats equal values as equal", () => {
    expect(compareNumbers(-0, 0)).toBe(-1);
    expect(compareNumbers(0, -0)).toBe(1);
    expect(compareNumbers(0, 0)).toBe(0);
    expect(compareNumbers(-0, -0)).toBe(0);
    expect(compareNumbers(7, 7)).toBe(0);
  });

  it("puts NaN last and equal to itself", () => {
    expect(compareNumbers(Number.NaN, Number.NaN)).toBe(0);
    expect(compareNumbers(Number.NaN, Number.POSITIVE_INFINITY)).toBe(1);
    expect(compareNumbers(Number.POSITIVE_INFINITY, Number.NaN)).toBe(-1);
  });

  it("never returns NaN and is antisymmetric", () => {
    for (const a of ORDERED) {
      for (const b of ORDERED) {
        const ab = compareNumbers(a, b);
        expect(Number.isNaN(ab)).toBe(false);
        expect(ab).toBe(-compareNumbers(b, a) || 0);
      }
    }
  });

  it("is transitive", () => {
    for (const a of ORDERED) {
      for (const b of ORDERED) {
        for (const c of ORDERED) {
          if (compareNumbers(a, b) <= 0 && compareNumbers(b, c) <= 0) {
            expect(compareNumbers(a, c)).toBeLessThanOrEqual(0);
          }
        }
      }
    }
  });

  it("sorts the same way from any initial order", () => {
    const expected = ORDERED.map((value) => Object.is(value, -0));
    const reversed = [...ORDERED].reverse().sort(compareNumbers);
    const rotated = [...ORDERED.slice(5), ...ORDERED.slice(0, 5)].sort(compareNumbers);
    for (const sorted of [reversed, rotated]) {
      expect(sorted).toHaveLength(ORDERED.length);
      expect(sorted.map((value) => Object.is(value, -0))).toEqual(expected);
      sorted.forEach((value, index) => expect(Object.is(value, ORDERED[index]!)).toBe(true));
    }
  });
});

interface Item {
  id: number;
  score: number;
}

describe("comparator helpers", () => {
  const byScore = compareBy<Item>((item) => item.score);

  it("compareBy orders by the key", () => {
    expect(byScore({ id: 1, score: 1 }, { id: 2, score: 2 })).toBe(-1);
    expect(byScore({ id: 1, score: 2 }, { id: 2, score: 1 })).toBe(1);
    expect(byScore({ id: 1, score: 2 }, { id: 2, score: 2 })).toBe(0);
    expect(byScore({ id: 1, score: Number.NaN }, { id: 2, score: 5 })).toBe(1);
  });

  it("reverseComparator sorts descending", () => {
    const items: Item[] = [
      { id: 1, score: 2 },
      { id: 2, score: 9 },
      { id: 3, score: 5 },
    ];
    expect(items.sort(reverseComparator(byScore)).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("chainComparators uses the first nonzero result and breaks ties by the last", () => {
    const items: Item[] = [
      { id: 4, score: 1 },
      { id: 2, score: 2 },
      { id: 3, score: 2 },
      { id: 1, score: 1 },
    ];
    const comparator = chainComparators(
      reverseComparator(byScore),
      compareBy<Item>((item) => item.id),
    );
    expect(items.sort(comparator).map((item) => item.id)).toEqual([2, 3, 1, 4]);
  });

  it("chainComparators returns 0 with no comparators or only ties", () => {
    expect(chainComparators<Item>()({ id: 1, score: 1 }, { id: 2, score: 2 })).toBe(0);
    expect(chainComparators(byScore)({ id: 1, score: 1 }, { id: 2, score: 1 })).toBe(0);
  });
});
