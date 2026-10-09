import type { PixelInput } from "@/core/types.js";
import { mulberry32 } from "./helpers.js";

/** Synthetic RGBA images generated in code. Every random choice uses a fixed-seed generator. */

export type Rgba = readonly [number, number, number, number];

export function createImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgba,
): PixelInput {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

export function solidImage(width: number, height: number, rgba: Rgba): PixelInput {
  return createImage(width, height, () => rgba);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Horizontal gradient between two opaque colors. */
export function linearGradient(
  width: number,
  height: number,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): PixelInput {
  return createImage(width, height, (x) => {
    const t = width > 1 ? x / (width - 1) : 0;
    return [
      clamp(from[0] + (to[0] - from[0]) * t),
      clamp(from[1] + (to[1] - from[1]) * t),
      clamp(from[2] + (to[2] - from[2]) * t),
      255,
    ];
  });
}

/** Horizontal gradient from black to white. */
export function grayGradient(width: number, height: number): PixelInput {
  return linearGradient(width, height, [0, 0, 0], [255, 255, 255]);
}

/** Opaque gray noise (r = g = b) from a fixed seed. */
export function grayNoise(width: number, height: number, seed: number): PixelInput {
  const next = mulberry32(seed);
  return createImage(width, height, () => {
    const v = Math.floor(next() * 256);
    return [v, v, v, 255];
  });
}

/** Opaque RGB noise from a fixed seed. */
export function colorNoise(width: number, height: number, seed: number): PixelInput {
  const next = mulberry32(seed);
  return createImage(width, height, () => [
    Math.floor(next() * 256),
    Math.floor(next() * 256),
    Math.floor(next() * 256),
    255,
  ]);
}

const BLOCK_PALETTE: readonly Rgba[] = [
  [220, 40, 40, 255],
  [40, 160, 60, 255],
  [30, 60, 200, 255],
  [240, 220, 40, 255],
  [20, 20, 20, 255],
  [245, 245, 245, 255],
];

/** A grid of flat color blocks, `columns` by `rows`, cycling through a fixed palette. */
export function colorBlocks(width: number, height: number, columns: number, rows: number) {
  return createImage(width, height, (x, y) => {
    const column = Math.min(columns - 1, Math.floor((x * columns) / width));
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    return BLOCK_PALETTE[(row * columns + column) % BLOCK_PALETTE.length]!;
  });
}

/** A cover-like image: color blocks in the top part and a vertical gradient with grain below. */
export function coverImage(width: number, height: number, seed: number): PixelInput {
  const next = mulberry32(seed);
  const split = Math.floor(height * 0.6);
  return createImage(width, height, (x, y) => {
    if (y < split) {
      const column = Math.floor((x * 4) / width);
      const row = Math.floor((y * 3) / split);
      return BLOCK_PALETTE[(row * 4 + column) % BLOCK_PALETTE.length]!;
    }
    const t = (y - split) / Math.max(1, height - split - 1);
    const grain = (next() - 0.5) * 12;
    return [clamp(250 - 200 * t + grain), clamp(120 + 60 * t + grain), clamp(40 + 180 * t), 255];
  });
}

/** Gradient with a semi-transparent band and a fully transparent region with hidden colors. */
export function transparencyMix(width: number, height: number, seed: number): PixelInput {
  const next = mulberry32(seed);
  return createImage(width, height, (x, y) => {
    const hidden: Rgba = [Math.floor(next() * 256), Math.floor(next() * 256), 7, 0];
    if (x >= width / 2 && y >= height / 2) return hidden;
    const t = x / (width - 1);
    const base = [clamp(255 * t), clamp(80 + 100 * (1 - t)), clamp(200 - 150 * t)] as const;
    if (y < height / 4) return [base[0], base[1], base[2], 128];
    if (y < height / 3) return [base[0], base[1], base[2], 40];
    return [base[0], base[1], base[2], 255];
  });
}

/**
 * Many distinct histogram cells: a 12 x 12 grid of smooth-but-different tiles with grain, so well
 * over 64 cells exist and Wu, k-means, and merging all have work to do.
 */
export function manyCells(width: number, height: number, seed: number): PixelInput {
  const next = mulberry32(seed);
  return createImage(width, height, (x, y) => {
    const column = Math.floor((x * 12) / width);
    const row = Math.floor((y * 12) / height);
    const grain = (next() - 0.5) * 10;
    return [
      clamp(column * 21 + grain),
      clamp(row * 21 + grain),
      clamp(((column * 7 + row * 13) % 12) * 21 + grain),
      255,
    ];
  });
}
