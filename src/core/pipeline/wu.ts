import { GRID_BITS } from "./parameters.js";

/** Initial clusters proposed by {@link proposeWuClusters}. */
export interface WuResult {
  /** Per cell, in the order of `keys`: index of its box, in [0, clusterCount). */
  readonly labels: Uint8Array;
  /** min(maxClusters, keys.length). Every value in [0, clusterCount) is used by some cell. */
  readonly clusterCount: number;
}

/** Cells per axis of the grid (64). */
const SIZE = 1 << GRID_BITS;
/** Extracts one cell coordinate from a cell key. */
const COORDINATE_MASK = SIZE - 1;
/** Entries per axis of a moment table: a zero plane at index 0, then the cells (65). */
const SIDE = SIZE + 1;
/** Entries per r plane of a moment table. */
const PLANE = SIDE * SIDE;
/** Entries of a moment table (65³). */
const VOLUME = PLANE * SIDE;
/** Offset of a box's highest coordinates in its six bounds. */
const HIGH = 3;

/**
 * Cumulative moment tables. The entry at `((r + 1) · SIDE + (g + 1)) · SIDE + (b + 1)` sums the
 * cells in `[0, r] × [0, g] × [0, b]`; entries with a 0 index on any axis are 0.
 */
interface MomentTables {
  /** Σ w. */
  readonly weight: Float64Array;
  /** Σ w·r. */
  readonly red: Float64Array;
  /** Σ w·g. */
  readonly green: Float64Array;
  /** Σ w·b. */
  readonly blue: Float64Array;
  /** Σ w·(r·r + g·g + b·b). */
  readonly square: Float64Array;
}

/** The boxes of the partition, by box index. */
interface Boxes {
  /** 6 per box at 6k..6k+5: the lowest r, g, b cell coordinates, then the highest (inclusive). */
  readonly bounds: Uint8Array;
  /** Per box: `q - (r * r + g * g + b * b) / w` from its sums. */
  readonly variances: Float64Array;
  /** Per box: axis of its best cut (0 r, 1 g, 2 b), or -1 when it has no valid cut. */
  readonly cutAxes: Int8Array;
  /** Per box: position of its best cut, the last coordinate of the lower half. */
  readonly cutPositions: Uint8Array;
}

/**
 * Proposes the initial clusters of the population pipeline with Xiaolin Wu's method: the grid of
 * cells is split into boxes by repeated cuts along r, g, or b that maximize the separation of the
 * two halves, splitting the box with the largest variance first.
 *
 * When there are at most `maxClusters` cells, each cell is its own cluster (`labels[j] = j`) and
 * no table is built. Otherwise the result has exactly `maxClusters` boxes. Ties are resolved by a
 * fixed order:
 *
 * - Within an axis, cut positions are scanned ascending and the first maximum wins.
 * - Across axes, r beats g and g beats b unless a later axis is strictly better.
 * - Across boxes, the lowest box index wins among equal variances.
 * - On a split, the lower half keeps the box index and the upper half is appended.
 *
 * Box sums are exact integers. Variances and cut objectives are computed with the fixed
 * expressions `q - (r * r + g * g + b * b) / w` and
 * `(rl * rl + gl * gl + bl * bl) / wl + (ru * ru + gu * gu + bu * bu) / wu`, evaluated left to
 * right; their rounding is therefore the same on every engine, and they only feed comparisons.
 *
 * Preconditions, not validated: the arrays come from `buildCells` (keys strictly ascending in
 * `[0, 2^(3 · GRID_BITS))`, integer weights ≥ 1, 4 moments per cell, every sum below 2^53), there
 * is at least one cell, and `maxClusters` is an integer in [1, 254].
 *
 * @param keys - Occupied cell keys, strictly ascending.
 * @param weights - Per cell: the sum of its colors' weights.
 * @param moments - 4 per cell at 4j..4j+3: Σ w·r, Σ w·g, Σ w·b, Σ w·(r·r + g·g + b·b).
 * @param maxClusters - Largest number of clusters to propose.
 */
export function proposeWuClusters(
  keys: Uint32Array,
  weights: Float64Array,
  moments: Float64Array,
  maxClusters: number,
): WuResult {
  const cellCount = keys.length;
  if (cellCount <= maxClusters) {
    const labels = new Uint8Array(cellCount);
    for (let j = 0; j < cellCount; j++) {
      labels[j] = j;
    }
    return { labels, clusterCount: cellCount };
  }

  const tables = buildMomentTables(keys, weights, moments);
  const boxes: Boxes = {
    bounds: new Uint8Array(6 * maxClusters),
    variances: new Float64Array(maxClusters),
    cutAxes: new Int8Array(maxClusters),
    cutPositions: new Uint8Array(maxClusters),
  };
  const { bounds, variances, cutAxes, cutPositions } = boxes;

  // Box 0 is the whole grid.
  bounds.fill(SIZE - 1, HIGH, 2 * HIGH);
  evaluateBox(tables, boxes, 0);

  let count = 1;
  while (count < maxClusters) {
    // The splittable box with the largest variance; the lowest index wins ties.
    let chosen = -1;
    for (let box = 0; box < count; box++) {
      if (cutAxes[box]! >= 0 && (chosen < 0 || variances[box]! > variances[chosen]!)) {
        chosen = box;
      }
    }
    if (chosen < 0) {
      // No box holds 2 cells. Unreachable while there are more cells than maxClusters.
      break;
    }

    // The upper half is appended as box `count`, and the lower half stays at `chosen`.
    const axis = cutAxes[chosen]!;
    const position = cutPositions[chosen]!;
    bounds.copyWithin(6 * count, 6 * chosen, 6 * chosen + 6);
    bounds[6 * count + axis] = position + 1;
    bounds[6 * chosen + HIGH + axis] = position;
    evaluateBox(tables, boxes, chosen);
    evaluateBox(tables, boxes, count);
    count++;
  }

  return { labels: paintLabels(keys, bounds, count), clusterCount: count };
}

/**
 * Builds the cumulative tables W, R, G, B, and Q: each cell's sums are placed at its entry, then
 * accumulated along b, then g, then r. The inputs are exact integers and every partial sum covers
 * a region of the grid, so every value is an exact integer below 2^53 under the preconditions.
 */
function buildMomentTables(
  keys: Uint32Array,
  weights: Float64Array,
  moments: Float64Array,
): MomentTables {
  const tables: MomentTables = {
    weight: new Float64Array(VOLUME),
    red: new Float64Array(VOLUME),
    green: new Float64Array(VOLUME),
    blue: new Float64Array(VOLUME),
    square: new Float64Array(VOLUME),
  };
  const { weight, red, green, blue, square } = tables;
  const cellCount = keys.length;
  for (let j = 0; j < cellCount; j++) {
    const key = keys[j]!;
    const r = key >>> (2 * GRID_BITS);
    const g = (key >>> GRID_BITS) & COORDINATE_MASK;
    const b = key & COORDINATE_MASK;
    const entry = ((r + 1) * SIDE + (g + 1)) * SIDE + (b + 1);
    weight[entry] = weights[j]!;
    red[entry] = moments[4 * j]!;
    green[entry] = moments[4 * j + 1]!;
    blue[entry] = moments[4 * j + 2]!;
    square[entry] = moments[4 * j + 3]!;
  }
  accumulate(weight);
  accumulate(red);
  accumulate(green);
  accumulate(blue);
  accumulate(square);
  return tables;
}

/** Turns a table of per-cell values into prefix sums along b, then g, then r, in place. */
function accumulate(table: Float64Array): void {
  // Along b, within each (r, g) row. Index 0 of each row is a zero plane and stays 0.
  for (let row = 0; row < VOLUME; row += SIDE) {
    for (let b = 1; b < SIDE; b++) {
      table[row + b] = table[row + b]! + table[row + b - 1]!;
    }
  }
  // Along g, within each r plane.
  for (let plane = 0; plane < VOLUME; plane += PLANE) {
    for (let row = plane + SIDE; row < plane + PLANE; row += SIDE) {
      for (let b = 0; b < SIDE; b++) {
        table[row + b] = table[row + b]! + table[row - SIDE + b]!;
      }
    }
  }
  // Along r: each plane after the first adds the previous one, already cumulative.
  for (let entry = PLANE; entry < VOLUME; entry++) {
    table[entry] = table[entry]! + table[entry - PLANE]!;
  }
}

/**
 * Sum of a cumulative table over the inclusive cell ranges `[r0, r1] × [g0, g1] × [b0, b1]`,
 * given as table offsets: `lowR = r0 · PLANE`, `highR = (r1 + 1) · PLANE`, `lowG = g0 · SIDE`,
 * `highG = (g1 + 1) · SIDE`, `lowB = b0`, and `highB = b1 + 1`.
 *
 * The 8-term inclusion–exclusion is grouped so that every intermediate value is itself the sum
 * of a region of the grid: it is never negative and never exceeds the total, so the result is
 * exact whenever the total is an integer below 2^53.
 */
function regionSum(
  table: Float64Array,
  lowR: number,
  highR: number,
  lowG: number,
  highG: number,
  lowB: number,
  highB: number,
): number {
  const throughR1 =
    table[highR + highG + highB]! -
    table[highR + highG + lowB]! -
    (table[highR + lowG + highB]! - table[highR + lowG + lowB]!);
  const beforeR0 =
    table[lowR + highG + highB]! -
    table[lowR + highG + lowB]! -
    (table[lowR + lowG + highB]! - table[lowR + lowG + lowB]!);
  return throughR1 - beforeR0;
}

/**
 * Computes the variance and the best cut of a box from its bounds. A cut of axis `a` at position
 * `t`, with `lo ≤ t < hi`, splits the box into `[lo, t]` and `[t + 1, hi]`; it is valid when both
 * halves have weight > 0, which is possible exactly when the box holds at least 2 cells.
 */
function evaluateBox(tables: MomentTables, boxes: Boxes, box: number): void {
  const { weight, red, green, blue, square } = tables;
  const bounds = boxes.bounds;
  const at = 6 * box;
  const lowR = bounds[at]! * PLANE;
  const lowG = bounds[at + 1]! * SIDE;
  const lowB = bounds[at + 2]!;
  const highR = (bounds[at + HIGH]! + 1) * PLANE;
  const highG = (bounds[at + HIGH + 1]! + 1) * SIDE;
  const highB = bounds[at + HIGH + 2]! + 1;

  const w = regionSum(weight, lowR, highR, lowG, highG, lowB, highB);
  const r = regionSum(red, lowR, highR, lowG, highG, lowB, highB);
  const g = regionSum(green, lowR, highR, lowG, highG, lowB, highB);
  const b = regionSum(blue, lowR, highR, lowG, highG, lowB, highB);
  const q = regionSum(square, lowR, highR, lowG, highG, lowB, highB);
  boxes.variances[box] = q - (r * r + g * g + b * b) / w;

  let bestAxis = -1;
  let bestPosition = 0;
  let bestObjective = 0;
  for (let axis = 0; axis < 3; axis++) {
    const stride = axis === 0 ? PLANE : axis === 1 ? SIDE : 1;
    const first = bounds[at + axis]!;
    const last = bounds[at + HIGH + axis]!;
    let axisPosition = -1;
    let axisObjective = 0;
    for (let t = first; t < last; t++) {
      // The lower half ends at t on this axis and keeps the box's other bounds.
      const end = (t + 1) * stride;
      const cutR = axis === 0 ? end : highR;
      const cutG = axis === 1 ? end : highG;
      const cutB = axis === 2 ? end : highB;
      const wl = regionSum(weight, lowR, cutR, lowG, cutG, lowB, cutB);
      const wu = w - wl;
      if (!(wl > 0 && wu > 0)) {
        continue;
      }
      const rl = regionSum(red, lowR, cutR, lowG, cutG, lowB, cutB);
      const gl = regionSum(green, lowR, cutR, lowG, cutG, lowB, cutB);
      const bl = regionSum(blue, lowR, cutR, lowG, cutG, lowB, cutB);
      const ru = r - rl;
      const gu = g - gl;
      const bu = b - bl;
      const objective = (rl * rl + gl * gl + bl * bl) / wl + (ru * ru + gu * gu + bu * bu) / wu;
      // The first maximum along the axis wins: only a strictly greater objective replaces it.
      if (axisPosition < 0 || objective > axisObjective) {
        axisPosition = t;
        axisObjective = objective;
      }
    }
    // Axes are visited r, g, b, and a later axis replaces only when strictly greater.
    if (axisPosition >= 0 && (bestAxis < 0 || axisObjective > bestObjective)) {
      bestAxis = axis;
      bestPosition = axisPosition;
      bestObjective = axisObjective;
    }
  }
  boxes.cutAxes[box] = bestAxis;
  boxes.cutPositions[box] = bestPosition;
}

/**
 * Paints each box index over the box's volume in a grid of cells (the boxes partition it), then
 * reads each cell's label from its key.
 */
function paintLabels(keys: Uint32Array, bounds: Uint8Array, count: number): Uint8Array {
  const grid = new Uint8Array(SIZE * SIZE * SIZE);
  for (let box = 0; box < count; box++) {
    const at = 6 * box;
    const r1 = bounds[at + HIGH]!;
    const g0 = bounds[at + 1]!;
    const g1 = bounds[at + HIGH + 1]!;
    const b0 = bounds[at + 2]!;
    const b1 = bounds[at + HIGH + 2]!;
    for (let r = bounds[at]!; r <= r1; r++) {
      for (let g = g0; g <= g1; g++) {
        const row = (r * SIZE + g) * SIZE;
        grid.fill(box, row + b0, row + b1 + 1);
      }
    }
  }
  const cellCount = keys.length;
  const labels = new Uint8Array(cellCount);
  for (let j = 0; j < cellCount; j++) {
    labels[j] = grid[keys[j]!]!;
  }
  return labels;
}
