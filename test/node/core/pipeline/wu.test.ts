import { describe, expect, it } from "vite-plus/test";
import { GRID_BITS, WU_MAX_CLUSTERS } from "@/core/pipeline/parameters.js";
import { proposeWuClusters, type WuResult } from "@/core/pipeline/wu.js";
import { mulberry32 } from "../helpers.js";

/** A color with its weight: r, g, b from 0 to 255, then an integer weight ≥ 1. */
type Color = readonly [r: number, g: number, b: number, weight: number];

/** Cell arrays in the layout of `buildCells`. */
interface Cells {
  readonly keys: Uint32Array;
  readonly weights: Float64Array;
  readonly moments: Float64Array;
}

const SIZE = 1 << GRID_BITS;
const MASK = SIZE - 1;
const SHIFT = 8 - GRID_BITS;

function cellKey(r: number, g: number, b: number): number {
  return ((r >>> SHIFT) << (2 * GRID_BITS)) | ((g >>> SHIFT) << GRID_BITS) | (b >>> SHIFT);
}

function coordinates(key: number): [r: number, g: number, b: number] {
  return [key >>> (2 * GRID_BITS), (key >>> GRID_BITS) & MASK, key & MASK];
}

/** Builds the cell arrays of a list of colors, as `buildCells` defines them (section 3.1). */
function cellsFrom(colors: readonly Color[]): Cells {
  const keyList = [...new Set(colors.map(([r, g, b]) => cellKey(r, g, b)))].sort((a, b) => a - b);
  const cellOf = new Map(keyList.map((key, j) => [key, j]));
  const weights = new Float64Array(keyList.length);
  const moments = new Float64Array(4 * keyList.length);
  for (const [r, g, b, w] of colors) {
    const j = cellOf.get(cellKey(r, g, b))!;
    weights[j] = weights[j]! + w;
    moments[4 * j] = moments[4 * j]! + w * r;
    moments[4 * j + 1] = moments[4 * j + 1]! + w * g;
    moments[4 * j + 2] = moments[4 * j + 2]! + w * b;
    moments[4 * j + 3] = moments[4 * j + 3]! + w * (r * r + g * g + b * b);
  }
  return { keys: Uint32Array.from(keyList), weights, moments };
}

/**
 * Seeded colors. Lattice colors use the channel values 0, 84, 168, and 252 with equal weights,
 * which puts cells at symmetric positions and creates exact ties between cuts and boxes.
 */
function randomColors(seed: number, count: number, lattice: boolean): Color[] {
  const random = mulberry32(seed);
  const channel = (): number =>
    lattice ? 84 * Math.floor(random() * 4) : Math.floor(random() * 256);
  const colors: Color[] = [];
  for (let i = 0; i < count; i++) {
    const weight = lattice ? 10 : 1 + Math.floor(random() * 255 * 100);
    colors.push([channel(), channel(), channel(), weight]);
  }
  return colors;
}

function propose(cells: Cells, maxClusters: number): WuResult {
  return proposeWuClusters(cells.keys, cells.weights, cells.moments, maxClusters);
}

function labelsOf(cells: Cells, maxClusters: number): number[] {
  return Array.from(propose(cells, maxClusters).labels);
}

/**
 * Direct reading of section 3.2 without moment tables: every box sum is accumulated from the
 * cells inside the box, and cut sums come from running sums over the box's planes. Sums are
 * exact integers, so they equal the table sums; the expressions and tie rules are the contract's.
 */
function referenceWu(
  cells: Cells,
  maxClusters: number,
): { labels: number[]; clusterCount: number } {
  const { keys, weights, moments } = cells;
  const cellCount = keys.length;
  if (cellCount <= maxClusters) {
    return { labels: Array.from({ length: cellCount }, (_, j) => j), clusterCount: cellCount };
  }
  const cellCoordinates = Array.from(keys, (key) => coordinates(key));
  const inside = (low: number[], high: number[], j: number): boolean =>
    [0, 1, 2].every((axis) => {
      const value = cellCoordinates[j]![axis]!;
      return value >= low[axis]! && value <= high[axis]!;
    });

  interface Box {
    low: number[];
    high: number[];
    variance: number;
    axis: number;
    position: number;
  }

  const evaluate = (low: number[], high: number[]): Box => {
    let w = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let q = 0;
    // Per axis and plane: weight and first moments of the box's cells in that plane.
    const planes = [0, 1, 2].map(() => Array.from({ length: SIZE }, () => [0, 0, 0, 0]));
    for (let j = 0; j < cellCount; j++) {
      if (!inside(low, high, j)) {
        continue;
      }
      const values = [weights[j]!, moments[4 * j]!, moments[4 * j + 1]!, moments[4 * j + 2]!];
      w += values[0]!;
      r += values[1]!;
      g += values[2]!;
      b += values[3]!;
      q += moments[4 * j + 3]!;
      for (let axis = 0; axis < 3; axis++) {
        const plane = planes[axis]![cellCoordinates[j]![axis]!]!;
        for (let m = 0; m < 4; m++) {
          plane[m] = plane[m]! + values[m]!;
        }
      }
    }
    const variance = q - (r * r + g * g + b * b) / w;
    let bestAxis = -1;
    let bestPosition = 0;
    let bestObjective = 0;
    for (let axis = 0; axis < 3; axis++) {
      let wl = 0;
      let rl = 0;
      let gl = 0;
      let bl = 0;
      let axisPosition = -1;
      let axisObjective = 0;
      for (let t = low[axis]!; t < high[axis]!; t++) {
        const plane = planes[axis]![t]!;
        wl += plane[0]!;
        rl += plane[1]!;
        gl += plane[2]!;
        bl += plane[3]!;
        const wu = w - wl;
        if (wl === 0 || wu === 0) {
          continue;
        }
        const ru = r - rl;
        const gu = g - gl;
        const bu = b - bl;
        const objective = (rl * rl + gl * gl + bl * bl) / wl + (ru * ru + gu * gu + bu * bu) / wu;
        if (axisPosition < 0 || objective > axisObjective) {
          axisPosition = t;
          axisObjective = objective;
        }
      }
      if (axisPosition >= 0 && (bestAxis < 0 || axisObjective > bestObjective)) {
        bestAxis = axis;
        bestPosition = axisPosition;
        bestObjective = axisObjective;
      }
    }
    return { low, high, variance, axis: bestAxis, position: bestPosition };
  };

  const boxes: Box[] = [evaluate([0, 0, 0], [MASK, MASK, MASK])];
  while (boxes.length < maxClusters) {
    let chosen = -1;
    for (let k = 0; k < boxes.length; k++) {
      if (boxes[k]!.axis >= 0 && (chosen < 0 || boxes[k]!.variance > boxes[chosen]!.variance)) {
        chosen = k;
      }
    }
    if (chosen < 0) {
      break;
    }
    const { low, high, axis, position } = boxes[chosen]!;
    const lowerHigh = [...high];
    lowerHigh[axis] = position;
    const upperLow = [...low];
    upperLow[axis] = position + 1;
    boxes[chosen] = evaluate(low, lowerHigh);
    boxes.push(evaluate(upperLow, high));
  }
  const labels = Array.from({ length: cellCount }, (_, j) =>
    boxes.findIndex((box) => inside(box.low, box.high, j)),
  );
  return { labels, clusterCount: boxes.length };
}

/** Checks the result's shape: one label per cell, in range, and every cluster used. */
function expectValidResult(result: WuResult, cellCount: number, maxClusters: number): void {
  expect(result.labels).toBeInstanceOf(Uint8Array);
  expect(result.labels.length).toBe(cellCount);
  expect(result.clusterCount).toBe(Math.min(maxClusters, cellCount));
  const used = Array.from({ length: result.clusterCount }, () => false);
  for (const label of result.labels) {
    expect(label).toBeLessThan(result.clusterCount);
    used[label] = true;
  }
  expect(used.every(Boolean)).toBe(true);
}

// Four colors at the corners of a square in the r-g plane, weight 10 each (section 3.2).
const SQUARE_RG: readonly Color[] = [
  [0, 0, 0, 10],
  [0, 252, 0, 10],
  [252, 0, 0, 10],
  [252, 252, 0, 10],
];

describe("proposeWuClusters: one cluster per cell", () => {
  it("returns the identity when there are at most maxClusters cells", () => {
    const cells = cellsFrom(SQUARE_RG.slice(0, 3));
    expect(Array.from(cells.keys)).toEqual([0, 4032, 258048]);
    const result = propose(cells, 3);
    expect(Array.from(result.labels)).toEqual([0, 1, 2]);
    expect(result.clusterCount).toBe(3);
    expect(labelsOf(cells, 64)).toEqual([0, 1, 2]);
  });

  it("returns the identity for exactly maxClusters cells", () => {
    const colors: Color[] = Array.from({ length: 64 }, (_, i) => [4 * i, 255 - 4 * i, 0, 1 + i]);
    const cells = cellsFrom(colors);
    expect(cells.keys.length).toBe(64);
    const result = propose(cells, WU_MAX_CLUSTERS);
    expect(Array.from(result.labels)).toEqual(Array.from({ length: 64 }, (_, j) => j));
    expect(result.clusterCount).toBe(64);
  });

  it("handles a single cell", () => {
    const cells = cellsFrom([[200, 100, 50, 7]]);
    for (const maxClusters of [1, 2, WU_MAX_CLUSTERS]) {
      const result = propose(cells, maxClusters);
      expect(Array.from(result.labels)).toEqual([0]);
      expect(result.clusterCount).toBe(1);
    }
  });

  it("handles all the weight in one cell", () => {
    // Several colors that share one cell give a single cell.
    const cells = cellsFrom([
      [8, 8, 8, 255],
      [9, 10, 11, 3],
      [11, 11, 11, 1000],
    ]);
    expect(cells.keys.length).toBe(1);
    expect(Array.from(cells.weights)).toEqual([1258]);
    const result = propose(cells, WU_MAX_CLUSTERS);
    expect(Array.from(result.labels)).toEqual([0]);
    expect(result.clusterCount).toBe(1);
  });
});

describe("proposeWuClusters: more cells than maxClusters", () => {
  it("proposes exactly WU_MAX_CLUSTERS clusters", () => {
    for (const [seed, count] of [
      [1, 65],
      [2, 300],
      [3, 5000],
    ] as const) {
      const cells = cellsFrom(randomColors(seed, count, false));
      expect(cells.keys.length).toBeGreaterThan(WU_MAX_CLUSTERS);
      expectValidResult(propose(cells, WU_MAX_CLUSTERS), cells.keys.length, WU_MAX_CLUSTERS);
    }
  });

  it("proposes exactly maxClusters clusters for one cell more than maxClusters", () => {
    const colors: Color[] = Array.from({ length: 65 }, (_, i) => [4 * (i % 64), 4 * i, 0, 1]);
    const cells = cellsFrom(colors);
    expect(cells.keys.length).toBe(65);
    expectValidResult(propose(cells, WU_MAX_CLUSTERS), 65, WU_MAX_CLUSTERS);
  });

  it("labels every cell with a used label in range for any maxClusters", () => {
    const cells = cellsFrom(randomColors(4, 2000, false));
    for (const maxClusters of [1, 2, 3, 7, 32, 64, 128, 254]) {
      expectValidResult(propose(cells, maxClusters), cells.keys.length, maxClusters);
    }
  });

  it("puts every cell in one cluster when maxClusters is 1", () => {
    const cells = cellsFrom(randomColors(5, 50, false));
    const result = propose(cells, 1);
    expect(result.clusterCount).toBe(1);
    expect(Array.from(result.labels)).toEqual(Array.from(cells.keys, () => 0));
  });

  it("handles every cell of the grid occupied", () => {
    const cellCount = SIZE * SIZE * SIZE;
    const keys = new Uint32Array(cellCount);
    const weights = new Float64Array(cellCount);
    const moments = new Float64Array(4 * cellCount);
    for (let key = 0; key < cellCount; key++) {
      const [cr, cg, cb] = coordinates(key);
      const r = (cr << SHIFT) + (key % 4);
      const g = (cg << SHIFT) + ((key >>> 2) % 4);
      const b = (cb << SHIFT) + ((key >>> 4) % 4);
      const w = 1 + (key % 255);
      keys[key] = key;
      weights[key] = w;
      moments.set([w * r, w * g, w * b, w * (r * r + g * g + b * b)], 4 * key);
    }
    expectValidResult(
      proposeWuClusters(keys, weights, moments, WU_MAX_CLUSTERS),
      cellCount,
      WU_MAX_CLUSTERS,
    );
  });

  it("handles one cell holding almost all the weight", () => {
    const colors = randomColors(6, 400, false).map(([r, g, b]): Color => [r, g, b, 1]);
    colors.push([128, 64, 32, 255 * 16_777_216]);
    const cells = cellsFrom(colors);
    const result = propose(cells, WU_MAX_CLUSTERS);
    expectValidResult(result, cells.keys.length, WU_MAX_CLUSTERS);
    expect(Array.from(result.labels)).toEqual(referenceWu(cells, WU_MAX_CLUSTERS).labels);
  });

  it("partitions the cells into boxes that do not overlap", () => {
    const cells = cellsFrom(randomColors(7, 3000, false));
    const result = propose(cells, WU_MAX_CLUSTERS);
    const low = Array.from({ length: result.clusterCount }, () => [SIZE, SIZE, SIZE]);
    const high = Array.from({ length: result.clusterCount }, () => [-1, -1, -1]);
    result.labels.forEach((label, j) => {
      const position = coordinates(cells.keys[j]!);
      for (let axis = 0; axis < 3; axis++) {
        low[label]![axis] = Math.min(low[label]![axis]!, position[axis]!);
        high[label]![axis] = Math.max(high[label]![axis]!, position[axis]!);
      }
    });
    for (let i = 0; i < result.clusterCount; i++) {
      for (let k = i + 1; k < result.clusterCount; k++) {
        // Two boxes are disjoint when they are separated along at least one axis.
        const separated = [0, 1, 2].some(
          (axis) => high[i]![axis]! < low[k]![axis]! || high[k]![axis]! < low[i]![axis]!,
        );
        expect(separated).toBe(true);
      }
    }
  });
});

describe("proposeWuClusters: tie rules", () => {
  it("prefers r to an equal g cut, at the lowest position", () => {
    const cells = cellsFrom(SQUARE_RG);
    expect(Array.from(cells.keys)).toEqual([0, 4032, 258048, 262080]);
    expect(labelsOf(cells, 2)).toEqual([0, 0, 1, 1]);
  });

  it("splits the lowest box index among equal variances, and appends the upper half", () => {
    const cells = cellsFrom(SQUARE_RG);
    // Boxes 0 and 1 have equal variance: box 0 splits along g, its lower half keeps index 0, and
    // its upper half is appended as box 2.
    expect(labelsOf(cells, 3)).toEqual([0, 2, 1, 1]);
  });

  it("prefers g to an equal b cut", () => {
    const cells = cellsFrom([
      [0, 0, 0, 10],
      [0, 0, 252, 10],
      [0, 252, 0, 10],
      [0, 252, 252, 10],
    ]);
    expect(Array.from(cells.keys)).toEqual([0, 63, 4032, 4095]);
    // A b cut would give [0, 1, 0, 1].
    expect(labelsOf(cells, 2)).toEqual([0, 0, 1, 1]);
  });

  it("prefers r to an equal b cut", () => {
    const cells = cellsFrom([
      [0, 0, 0, 10],
      [0, 0, 252, 10],
      [252, 0, 0, 10],
      [252, 0, 252, 10],
    ]);
    expect(Array.from(cells.keys)).toEqual([0, 63, 258048, 258111]);
    // A b cut would give [0, 1, 0, 1].
    expect(labelsOf(cells, 2)).toEqual([0, 0, 1, 1]);
  });

  it("keeps the lowest of two equal cut positions along an axis", () => {
    // Cells at r coordinates 0, 1, and 2 with equal weights: cutting after 0 or after 1 gives the
    // same objective (720 with weight 10), and the cut after 0 wins.
    const cells = cellsFrom([
      [0, 0, 0, 10],
      [4, 0, 0, 10],
      [8, 0, 0, 10],
    ]);
    expect(labelsOf(cells, 2)).toEqual([0, 1, 1]);
  });

  it("splits the box with the largest variance first, whatever its index", () => {
    // The first cut separates r = 0 from r = 252. Box 0 then holds a close pair, box 1 a far one.
    const cells = cellsFrom([
      [0, 0, 0, 10],
      [0, 8, 0, 10],
      [252, 0, 0, 10],
      [252, 252, 0, 10],
    ]);
    expect(labelsOf(cells, 2)).toEqual([0, 0, 1, 1]);
    expect(labelsOf(cells, 3)).toEqual([0, 0, 1, 2]);
  });
});

describe("proposeWuClusters: weights", () => {
  it("lets a heavy cell move the cut", () => {
    const line = (weights: readonly [number, number, number]): Cells =>
      cellsFrom([
        [0, 0, 0, weights[0]],
        [4, 0, 0, weights[1]],
        [8, 0, 0, weights[2]],
      ]);
    // Equal weights tie, and the first position wins.
    expect(labelsOf(line([10, 10, 10]), 2)).toEqual([0, 1, 1]);
    // A heavy last cell is cut off on its own.
    expect(labelsOf(line([1, 1, 100]), 2)).toEqual([0, 0, 1]);
    // A heavy first cell is cut off on its own.
    expect(labelsOf(line([100, 1, 1]), 2)).toEqual([0, 1, 1]);
  });

  it("uses the moments of the colors, not the cell centers", () => {
    // The same three cells along r with the same weights; only the colors inside them differ.
    const middleNearFirst = cellsFrom([
      [3, 0, 0, 10],
      [4, 0, 0, 10],
      [11, 0, 0, 10],
    ]);
    const middleNearLast = cellsFrom([
      [0, 0, 0, 10],
      [7, 0, 0, 10],
      [8, 0, 0, 10],
    ]);
    expect(Array.from(middleNearFirst.keys)).toEqual([0, 4096, 8192]);
    expect(Array.from(middleNearLast.keys)).toEqual([0, 4096, 8192]);
    expect(labelsOf(middleNearFirst, 2)).toEqual([0, 0, 1]);
    expect(labelsOf(middleNearLast, 2)).toEqual([0, 1, 1]);
  });
});

describe("proposeWuClusters: contract", () => {
  it("matches a direct reading of the contract on seeded inputs", () => {
    for (let seed = 100; seed < 140; seed++) {
      const lattice = seed % 2 === 0;
      const cells = cellsFrom(randomColors(seed, 20 + ((seed * 37) % 400), lattice));
      for (const maxClusters of [1, 2, 5, 17, WU_MAX_CLUSTERS]) {
        const result = propose(cells, maxClusters);
        const expected = referenceWu(cells, maxClusters);
        expect(result.clusterCount).toBe(expected.clusterCount);
        expect(Array.from(result.labels)).toEqual(expected.labels);
      }
    }
  });

  it("is deterministic and does not mutate its inputs", () => {
    const cells = cellsFrom(randomColors(8, 4000, false));
    const keys = cells.keys.slice();
    const weights = cells.weights.slice();
    const moments = cells.moments.slice();
    const first = propose(cells, WU_MAX_CLUSTERS);
    const second = propose(cells, WU_MAX_CLUSTERS);
    expect(second.labels).not.toBe(first.labels);
    expect(Array.from(second.labels)).toEqual(Array.from(first.labels));
    expect(second.clusterCount).toBe(first.clusterCount);
    expect(cells.keys).toEqual(keys);
    expect(cells.weights).toEqual(weights);
    expect(cells.moments).toEqual(moments);
  });
});
