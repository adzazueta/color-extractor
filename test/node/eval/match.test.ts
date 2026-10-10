import { describe, expect, test } from "vite-plus/test";
import type { ImageAnnotation } from "../../../eval/lib/annotation-schema.js";
import { oklabDistance, parseHex } from "../../../eval/lib/color.js";
import {
  darkDiagnostic,
  evaluateMode,
  hitsAtThresholds,
  nearestSample,
  round4,
} from "../../../eval/lib/match.js";

function annotation(...colors: string[][]): ImageAnnotation {
  return {
    id: "dev-001",
    sha256: "a".repeat(64),
    category: "general",
    width: 100,
    height: 100,
    acceptable: colors.map((hexes, c) => ({
      samples: hexes.map((hex, s) => ({ x: c, y: s, hex })),
    })),
  };
}

const colors = (...hexes: string[]) => hexes.map((hex) => ({ hex, coverage: 0.1 }));

describe("nearestSample", () => {
  test("picks the closest sample over every color", () => {
    const result = nearestSample("#d9822b", annotation(["#2aa8b2"], ["#000000", "#da822b"]));
    expect(result).toMatchObject({ hex: "#da822b", color: 1, sample: 1 });
    expect(result.distance).toBe(oklabDistance(parseHex("#d9822b"), parseHex("#da822b")));
  });

  test("ties go to the lower color index, then the lower sample index", () => {
    const same = annotation(["#808080", "#808080"], ["#808080"]);
    expect(nearestSample("#101010", same)).toMatchObject({ color: 0, sample: 0 });
    const later = annotation(["#ffffff"], ["#808080", "#808080"], ["#808080"]);
    expect(nearestSample("#808080", later)).toMatchObject({ color: 1, sample: 0, distance: 0 });
  });

  test("an annotation without samples throws", () => {
    const empty: ImageAnnotation = { ...annotation(["#000000"]), acceptable: [] };
    expect(() => nearestSample("#000000", empty)).toThrow(RangeError);
  });
});

describe("evaluateMode", () => {
  const target = annotation(["#d9822b"]);

  test("a distance exactly equal to the threshold is a hit", () => {
    const hex = "#e08a33";
    const distance = oklabDistance(parseHex(hex), parseHex("#d9822b"));
    expect(distance).toBeGreaterThan(0);
    expect(evaluateMode(colors(hex), target, distance).firstHit).toBe(true);
    expect(evaluateMode(colors(hex), target, distance * (1 - 1e-12)).firstHit).toBe(false);
    expect(evaluateMode(colors(hex), target, distance).nearest?.distance).toBe(distance);
  });

  test("the threshold is compared against the unrounded distance", () => {
    const hex = "#e08a33";
    const distance = oklabDistance(parseHex(hex), parseHex("#d9822b"));
    const rounded = round4(distance);
    expect(rounded === distance).toBe(false);
    // Whichever way the rounding went, the hit follows the unrounded value.
    expect(evaluateMode(colors(hex), target, rounded).firstHit).toBe(distance <= rounded);
  });

  test("an empty color list gives no nearest and misses", () => {
    expect(evaluateMode([], target, 0.1)).toEqual({
      colors: [],
      nearest: null,
      firstHit: false,
      top3Hit: false,
    });
  });

  test("a threshold of null gives nulls but keeps colors and nearest", () => {
    const outcome = evaluateMode(colors("#d9822b", "#000000"), target, null);
    expect(outcome.firstHit).toBeNull();
    expect(outcome.top3Hit).toBeNull();
    expect(outcome.colors).toEqual(["#d9822b", "#000000"]);
    expect(outcome.nearest).toMatchObject({ hex: "#d9822b", distance: 0 });
    expect(evaluateMode([], target, null)).toMatchObject({ firstHit: null, top3Hit: null });
  });

  test("the first color is not a hit but another of the first 3 is", () => {
    const outcome = evaluateMode(colors("#000000", "#ffffff", "#d9822b"), target, 0.01);
    expect(outcome.firstHit).toBe(false);
    expect(outcome.top3Hit).toBe(true);
    expect(outcome.nearest?.hex).toBe("#d9822b");
    expect(outcome.nearest?.distance).toBeGreaterThan(0.5);
  });

  test("the top 3 does not look at rank 4", () => {
    const outcome = evaluateMode(colors("#000000", "#ffffff", "#0000ff", "#d9822b"), target, 0.01);
    expect(outcome.top3Hit).toBe(false);
    expect(outcome.colors).toHaveLength(4);
  });

  test("a hit in the first color is also a top-3 hit", () => {
    const outcome = evaluateMode(colors("#d9822b"), target, 0.01);
    expect(outcome).toMatchObject({ firstHit: true, top3Hit: true });
  });
});

describe("darkDiagnostic", () => {
  const withCoverage = (...pairs: [string, number][]) =>
    pairs.map(([hex, coverage]) => ({ hex, coverage }));

  test("no near-black colors", () => {
    expect(darkDiagnostic(colors("#d9822b", "#ffffff"))).toEqual({
      nearBlack: 0,
      coverage: 0,
      closestPair: null,
    });
    expect(darkDiagnostic([])).toEqual({ nearBlack: 0, coverage: 0, closestPair: null });
  });

  test("one near-black color has no pair", () => {
    expect(darkDiagnostic(withCoverage(["#000000", 0.5], ["#d9822b", 0.3]))).toEqual({
      nearBlack: 1,
      coverage: 0.5,
      closestPair: null,
    });
  });

  test("three near-blacks: coverage is summed and rounded, and the closest pair is found", () => {
    const result = darkDiagnostic(
      withCoverage(["#000000", 0.1], ["#0a0a0a", 0.2], ["#141414", 0.3], ["#ffffff", 0.4]),
    );
    expect(result.nearBlack).toBe(3);
    expect(result.coverage).toBe(0.6);
    // The closest pair is #0a0a0a and #141414 (0.046), not black and #0a0a0a (0.145).
    expect(result.closestPair).toBe(
      round4(oklabDistance(parseHex("#0a0a0a"), parseHex("#141414"))),
    );
    expect(result.closestPair).toBe(0.0465);
  });

  test("coverage addition noise is rounded away", () => {
    expect(darkDiagnostic(withCoverage(["#000000", 0.1], ["#101010", 0.2])).coverage).toBe(0.3);
  });

  test("only the first 5 colors count", () => {
    const six = colors("#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#000000");
    expect(darkDiagnostic(six).nearBlack).toBe(0);
  });
});

test("hitsAtThresholds counts distances at or under each threshold and ignores nulls", () => {
  expect(hitsAtThresholds([0, 0.02, 0.05, null, 0.3], [0.02, 0.05, 0.1, 0.2])).toEqual([
    2, 3, 3, 3,
  ]);
  expect(hitsAtThresholds([], [0.02])).toEqual([0]);
  expect(hitsAtThresholds([null], [0.02, 0.1])).toEqual([0, 0]);
  expect(hitsAtThresholds([0.1], [])).toEqual([]);
});

test("round4 rounds to four decimals", () => {
  expect(round4(0.1 + 0.2)).toBe(0.3);
  expect(round4(0.123456)).toBe(0.1235);
  expect(round4(0)).toBe(0);
  expect(round4(12)).toBe(12);
});
