import { srgbToOklabInto } from "@/core/color/oklab.js";
import type { PixelInput } from "@/core/types.js";
import { GRID_BITS } from "./parameters.js";

/** Value of `pixelColorIndices` for a fully transparent pixel. It can never be a color index. */
const TRANSPARENT_PIXEL: number = 0xffffffff;

/** Words of the presence bitmap: one bit per packed RGB value (2^24 bits). */
const BITMAP_WORDS: number = 1 << 19;

export interface HistogramResult {
  /** Distinct RGB of the visible pixels (alpha ≥ 1), packed, strictly ascending. Length C. */
  readonly colors: Uint32Array;
  /** Per color: sum of the alpha of its visible pixels. Integer in [1, 255 · pixel count]. */
  readonly weights: Float64Array;
  /** Per pixel (row-major): index into `colors`, or 0xffffffff when alpha is 0. */
  readonly pixelColorIndices: Uint32Array;
  /** Sum of alpha over all pixels (= sum of `weights`). 0 for a fully transparent image. */
  readonly totalWeight: number;
}

/** Number of set bits of a 32-bit word (SWAR). */
function popcount(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

/**
 * Counts the distinct colors of the image, weighted by opacity. Pixels with alpha 0 are ignored.
 * Two pixels with the same RGB and different alpha share one color.
 *
 * Precondition: `pixels` passed validation (`data.length === width * height * 4`).
 */
export function buildHistogram(pixels: PixelInput): HistogramResult {
  const data = pixels.data;
  const pixelCount = pixels.width * pixels.height;
  const pixelColorIndices = new Uint32Array(pixelCount);

  // Pass 1: presence bitmap of the visible colors.
  const bitmap = new Uint32Array(BITMAP_WORDS);
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    if (data[i + 3]! === 0) continue;
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    bitmap[key >>> 5]! |= 1 << (key & 31);
  }

  // Per-word rank base, and the colors in ascending order.
  const base = new Uint32Array(BITMAP_WORDS);
  let colorCount = 0;
  for (let w = 0; w < BITMAP_WORDS; w++) {
    base[w] = colorCount;
    const bits = bitmap[w]!;
    if (bits !== 0) colorCount += popcount(bits);
  }
  const colors = new Uint32Array(colorCount);
  let next = 0;
  for (let w = 0; w < BITMAP_WORDS; w++) {
    let bits = bitmap[w]!;
    while (bits !== 0) {
      const low = bits & -bits;
      colors[next++] = (w << 5) | (31 - Math.clz32(low));
      bits ^= low;
    }
  }

  // Pass 2: color index and weight of every pixel.
  const weights = new Float64Array(colorCount);
  let totalWeight = 0;
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const alpha = data[i + 3]!;
    if (alpha === 0) {
      pixelColorIndices[p] = TRANSPARENT_PIXEL;
      continue;
    }
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    const word = key >>> 5;
    const index = base[word]! + popcount(bitmap[word]! & ~(-1 << (key & 31)));
    pixelColorIndices[p] = index;
    weights[index]! += alpha;
    totalWeight += alpha;
  }

  return { colors, weights, pixelColorIndices, totalWeight };
}

export interface CellsResult {
  /** Occupied cell keys (section 2), strictly ascending. Length K ≥ 1. */
  readonly keys: Uint32Array;
  /** Per cell: sum of the weights of its colors. */
  readonly weights: Float64Array;
  /** 4 per cell at 4j..4j+3: Σ w·r, Σ w·g, Σ w·b, Σ w·(r·r + g·g + b·b) over its colors. */
  readonly moments: Float64Array;
  /** 3 per cell at 3j..3j+2: Oklab L, a, b of the cell's rounded weighted mean color. */
  readonly points: Float64Array;
  /** Per color: index of its cell in `keys`. */
  readonly colorCells: Uint32Array;
}

/**
 * Groups the colors into the cells of the grid defined by the top `GRID_BITS` bits of each channel.
 *
 * Preconditions: `colors` is strictly ascending, `weights[i] ≥ 1`, and there is at least one color.
 */
export function buildCells(colors: Uint32Array, weights: Float64Array): CellsResult {
  const colorCount = colors.length;
  const shift = 8 - GRID_BITS;
  const gridBits2 = 2 * GRID_BITS;

  // Mark the occupied keys and count them.
  const cellMap = new Int32Array(1 << (3 * GRID_BITS));
  let cellCount = 0;
  for (let c = 0; c < colorCount; c++) {
    const rgb = colors[c]!;
    const key =
      ((rgb >>> (16 + shift)) << gridBits2) |
      ((((rgb >>> 8) & 0xff) >>> shift) << GRID_BITS) |
      ((rgb & 0xff) >>> shift);
    if (cellMap[key] === 0) {
      cellMap[key] = 1;
      cellCount++;
    }
  }

  // Number the occupied keys in ascending order.
  const keys = new Uint32Array(cellCount);
  let number = 0;
  for (let key = 0; key < cellMap.length; key++) {
    if (cellMap[key] !== 0) {
      keys[number] = key;
      cellMap[key] = number;
      number++;
    }
  }

  // Accumulate weights and moments in color order.
  const cellWeights = new Float64Array(cellCount);
  const moments = new Float64Array(4 * cellCount);
  const colorCells = new Uint32Array(colorCount);
  for (let c = 0; c < colorCount; c++) {
    const rgb = colors[c]!;
    const r = rgb >>> 16;
    const g = (rgb >>> 8) & 0xff;
    const b = rgb & 0xff;
    const key = ((r >>> shift) << gridBits2) | ((g >>> shift) << GRID_BITS) | (b >>> shift);
    const j = cellMap[key]!;
    const w = weights[c]!;
    colorCells[c] = j;
    cellWeights[j]! += w;
    const m = 4 * j;
    moments[m]! += w * r;
    moments[m + 1]! += w * g;
    moments[m + 2]! += w * b;
    moments[m + 3]! += w * (r * r + g * g + b * b);
  }

  // Oklab of the rounded weighted mean color of each cell (half up, exact).
  const points = new Float64Array(3 * cellCount);
  for (let j = 0; j < cellCount; j++) {
    const total = cellWeights[j]!;
    const denominator = 2 * total;
    const m = 4 * j;
    const rr = Math.floor((2 * moments[m]! + total) / denominator);
    const gg = Math.floor((2 * moments[m + 1]! + total) / denominator);
    const bb = Math.floor((2 * moments[m + 2]! + total) / denominator);
    srgbToOklabInto(rr, gg, bb, points, 3 * j);
  }

  return { keys, weights: cellWeights, moments, points, colorCells };
}
