import type { PixelInput } from "@/core/types.js";

type Rgba = readonly [number, number, number, number];

function fill(width: number, height: number, colorAt: (x: number, y: number, i: number) => Rgba) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      data.set(colorAt(x, y, i), i * 4);
    }
  }
  return { data, width, height };
}

/** 4×2: opaque (220,40,40) on the left half, alpha-128 (40,160,60) and alpha-1 (30,60,200) on the right. */
export function rgbaSample(): PixelInput {
  return fill(4, 2, (x, y) =>
    x < 2 ? [220, 40, 40, 255] : y === 0 ? [40, 160, 60, 128] : [30, 60, 200, 1],
  );
}

/**
 * 64×48 opaque, in reading order: the first 1843 pixels (60 %) are (220,40,40), the next 921 (30 %)
 * are (30,60,200), and the last 308 (10 %) are (245,245,245).
 */
export function blocks(): PixelInput {
  return fill(64, 48, (_x, _y, i) =>
    i < 1843 ? [220, 40, 40, 255] : i < 2764 ? [30, 60, 200, 255] : [245, 245, 245, 255],
  );
}

/** 40×20 opaque: left half (255,0,0), right half (0,0,255). */
export function halves(): PixelInput {
  return fill(40, 20, (x) => (x < 20 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
}
