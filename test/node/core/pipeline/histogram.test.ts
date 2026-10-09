import { describe, expect, it } from "vite-plus/test";
import { srgbToOklab } from "@/core/color/oklab.js";
import { buildCells, buildHistogram } from "@/core/pipeline/histogram.js";
import type { PixelInput } from "@/core/types.js";
import { mulberry32 } from "../helpers.js";

const TRANSPARENT = 0xffffffff;

function image(width: number, height: number, rgba: number[]): PixelInput {
  return { data: new Uint8Array(rgba), width, height };
}

function pack(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function cellKey(rgb: number): number {
  return (((rgb >>> 16) >>> 2) << 12) | ((((rgb >>> 8) & 0xff) >>> 2) << 6) | ((rgb & 0xff) >>> 2);
}

describe("buildHistogram", () => {
  it("handles a hand-built 3x2 image", () => {
    // Row 0: red a=255, blue a=100, transparent. Row 1: red a=5, green a=255, blue a=0 (transparent).
    const pixels = image(
      3,
      2,
      [255, 0, 0, 255, 0, 0, 255, 100, 9, 9, 9, 0, 255, 0, 0, 5, 0, 255, 0, 255, 0, 0, 255, 0],
    );
    const h = buildHistogram(pixels);
    expect([...h.colors]).toEqual([pack(0, 0, 255), pack(0, 255, 0), pack(255, 0, 0)]);
    expect([...h.weights]).toEqual([100, 255, 260]);
    expect([...h.pixelColorIndices]).toEqual([2, 0, TRANSPARENT, 2, 1, TRANSPARENT]);
    expect(h.totalWeight).toBe(615);
  });

  it("merges the same RGB with different alpha into one color", () => {
    const h = buildHistogram(image(2, 1, [10, 20, 30, 255, 10, 20, 30, 1]));
    expect([...h.colors]).toEqual([pack(10, 20, 30)]);
    expect([...h.weights]).toEqual([256]);
    expect([...h.pixelColorIndices]).toEqual([0, 0]);
    expect(h.totalWeight).toBe(256);
  });

  it("keeps pure black and pure white", () => {
    const h = buildHistogram(image(2, 1, [255, 255, 255, 255, 0, 0, 0, 255]));
    expect([...h.colors]).toEqual([0, 0xffffff]);
    expect([...h.pixelColorIndices]).toEqual([1, 0]);
    expect([...h.weights]).toEqual([255, 255]);
  });

  it("returns empty colors for a fully transparent image", () => {
    const h = buildHistogram(image(2, 2, [1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 255, 255, 255, 0]));
    expect(h.colors.length).toBe(0);
    expect(h.weights.length).toBe(0);
    expect([...h.pixelColorIndices]).toEqual([TRANSPARENT, TRANSPARENT, TRANSPARENT, TRANSPARENT]);
    expect(h.totalWeight).toBe(0);
  });

  it("handles a 1x1 image", () => {
    const h = buildHistogram(image(1, 1, [12, 34, 56, 200]));
    expect([...h.colors]).toEqual([pack(12, 34, 56)]);
    expect([...h.weights]).toEqual([200]);
    expect([...h.pixelColorIndices]).toEqual([0]);
    expect(h.totalWeight).toBe(200);
  });

  it("matches a naive Map reference on a seeded random image", () => {
    const random = mulberry32(24);
    const width = 61;
    const height = 47;
    const data = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      // A small palette plus fully random colors, so that duplicates and unique colors both occur.
      const fromPalette = random() < 0.6;
      const palette = Math.floor(random() * 40);
      data[4 * p] = fromPalette ? palette * 6 : Math.floor(random() * 256);
      data[4 * p + 1] = fromPalette ? 255 - palette * 5 : Math.floor(random() * 256);
      data[4 * p + 2] = fromPalette ? palette : Math.floor(random() * 256);
      data[4 * p + 3] = random() < 0.1 ? 0 : 1 + Math.floor(random() * 255);
    }
    const h = buildHistogram({ data, width, height });

    const reference = new Map<number, number>();
    let total = 0;
    for (let p = 0; p < width * height; p++) {
      const alpha = data[4 * p + 3]!;
      if (alpha === 0) continue;
      const key = pack(data[4 * p]!, data[4 * p + 1]!, data[4 * p + 2]!);
      reference.set(key, (reference.get(key) ?? 0) + alpha);
      total += alpha;
    }
    const sorted = [...reference.keys()].sort((a, b) => a - b);
    expect([...h.colors]).toEqual(sorted);
    expect([...h.weights]).toEqual(sorted.map((key) => reference.get(key)!));
    expect(h.totalWeight).toBe(total);
    let sum = 0;
    for (const weight of h.weights) sum += weight;
    expect(sum).toBe(total);
    for (let p = 0; p < width * height; p++) {
      if (data[4 * p + 3] === 0) {
        expect(h.pixelColorIndices[p]).toBe(TRANSPARENT);
      } else {
        const key = pack(data[4 * p]!, data[4 * p + 1]!, data[4 * p + 2]!);
        expect(h.colors[h.pixelColorIndices[p]!]).toBe(key);
      }
    }
  });

  it("does not mutate the input", () => {
    const pixels = image(2, 2, [1, 2, 3, 255, 4, 5, 6, 0, 1, 2, 3, 10, 250, 251, 252, 255]);
    const copy = pixels.data.slice();
    buildHistogram(pixels);
    expect(pixels.data).toEqual(copy);
  });
});

describe("buildCells", () => {
  it("groups colors by the top 6 bits and accumulates weights and moments", () => {
    // Cell A (key 0): (0,0,0) w2, (3,3,3) w1. Cell B: (4,0,0) w5. Cell C: (255,255,255) w3.
    const colors = new Uint32Array([
      pack(0, 0, 0),
      pack(3, 3, 3),
      pack(4, 0, 0),
      pack(255, 255, 255),
    ]);
    const weights = new Float64Array([2, 1, 5, 3]);
    const cells = buildCells(colors, weights);
    expect([...cells.keys]).toEqual([0, 1 << 12, (63 << 12) | (63 << 6) | 63]);
    expect([...cells.colorCells]).toEqual([0, 0, 1, 2]);
    expect([...cells.weights]).toEqual([3, 5, 3]);
    expect([...cells.moments]).toEqual([3, 3, 3, 27, 20, 0, 0, 80, 765, 765, 765, 3 * 65025 * 3]);
    expect(cells.points.length).toBe(9);
  });

  it("orders keys strictly ascending and maps each color to its cell", () => {
    const random = mulberry32(7);
    const set = new Set<number>();
    while (set.size < 500) set.add(Math.floor(random() * 0x1000000));
    const colors = Uint32Array.from([...set].sort((a, b) => a - b));
    const weights = new Float64Array(colors.length);
    for (let c = 0; c < colors.length; c++) weights[c] = 1 + Math.floor(random() * 1000);
    const cells = buildCells(colors, weights);
    for (let j = 1; j < cells.keys.length; j++) {
      expect(cells.keys[j]!).toBeGreaterThan(cells.keys[j - 1]!);
    }
    for (let c = 0; c < colors.length; c++) {
      expect(cells.keys[cells.colorCells[c]!]).toBe(cellKey(colors[c]!));
    }
    // Weights add up, and the rounded mean stays inside its cell.
    let total = 0;
    for (const w of weights) total += w;
    let cellTotal = 0;
    for (const w of cells.weights) cellTotal += w;
    expect(cellTotal).toBe(total);
    for (let j = 0; j < cells.keys.length; j++) {
      const W = cells.weights[j]!;
      const key = cells.keys[j]!;
      const channels = [key >>> 12, (key >>> 6) & 63, key & 63];
      for (let k = 0; k < 3; k++) {
        const mean = Math.floor((2 * cells.moments[4 * j + k]! + W) / (2 * W));
        expect(mean).toBeGreaterThanOrEqual(4 * channels[k]!);
        expect(mean).toBeLessThanOrEqual(4 * channels[k]! + 3);
      }
    }
  });

  it("rounds the mean half up and converts it to Oklab", () => {
    const cells = buildCells(
      new Uint32Array([pack(0, 0, 0), pack(1, 0, 0)]),
      new Float64Array([4, 4]),
    );
    expect(cells.keys.length).toBe(1);
    const expected = srgbToOklab(1, 0, 0);
    expect(Object.is(cells.points[0], expected.L)).toBe(true);
    expect(Object.is(cells.points[1], expected.a)).toBe(true);
    expect(Object.is(cells.points[2], expected.b)).toBe(true);
  });

  it("uses the weighted mean for the cell point", () => {
    // (0,0,0) w1 and (3,3,3) w3: mean 2.25 rounds to 2.
    const cells = buildCells(
      new Uint32Array([pack(0, 0, 0), pack(3, 3, 3)]),
      new Float64Array([1, 3]),
    );
    const expected = srgbToOklab(2, 2, 2);
    expect(Object.is(cells.points[0], expected.L)).toBe(true);
    expect(Object.is(cells.points[1], expected.a)).toBe(true);
    expect(Object.is(cells.points[2], expected.b)).toBe(true);
  });

  it("does not mutate its inputs", () => {
    const colors = new Uint32Array([5, 900, 70000]);
    const weights = new Float64Array([1, 2, 3]);
    const colorsCopy = colors.slice();
    const weightsCopy = weights.slice();
    buildCells(colors, weights);
    expect(colors).toEqual(colorsCopy);
    expect(weights).toEqual(weightsCopy);
  });
});
