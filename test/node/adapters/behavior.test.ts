import { describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/node/index.js";
import { encodeTestImage } from "../../support/images.js";
import { halves } from "../../support/pixels.js";
import { rejection } from "./helpers.js";

/** Hue in degrees of an sRGB color. */
function hue([r, g, b]: readonly number[]): number {
  const max = Math.max(r ?? 0, g ?? 0, b ?? 0);
  const min = Math.min(r ?? 0, g ?? 0, b ?? 0);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = (((g ?? 0) - (b ?? 0)) / d) % 6;
  else if (max === g) h = ((b ?? 0) - (r ?? 0)) / d + 2;
  else h = ((r ?? 0) - (g ?? 0)) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("EXIF orientation", () => {
  test("orientation 6 rotates 40x20 to 20x40 with red on top", async () => {
    const result = await extractColors(await encodeTestImage("orientation-6.jpg"), { count: 2 });
    expect(result.meta.width).toBe(20);
    expect(result.meta.height).toBe(40);
    const red = result.colors.find((color) => color.rgba[0] > 200 && color.rgba[2] < 60);
    const blue = result.colors.find((color) => color.rgba[2] > 200 && color.rgba[0] < 60);
    expect(red?.position.y).toBeLessThan(20);
    expect(blue?.position.y).toBeGreaterThanOrEqual(20);
  });

  test("orientation 3 keeps the size and swaps the sides", async () => {
    const result = await extractColors(await encodeTestImage("orientation-3.jpg"), { count: 2 });
    expect(result.meta.width).toBe(halves().width);
    expect(result.meta.height).toBe(halves().height);
    const red = result.colors.find((color) => color.rgba[0] > 200 && color.rgba[2] < 60);
    expect(red?.position.x).toBeGreaterThanOrEqual(20);
  });
});

describe("color", () => {
  test("CMYK JPEG (with and without a profile) is red-dominant", async () => {
    for (const name of ["cmyk.jpg", "cmyk-no-profile.jpg"] as const) {
      const result = await extractColors(await encodeTestImage(name), { count: 1 });
      expect(result.meta.width).toBe(16);
      const [r, g, b] = result.colors[0]?.rgba ?? [0, 0, 0];
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
      expect(hueDistance(hue([r, g, b]), hue([200, 60, 30]))).toBeLessThan(25);
    }
  });

  test("a Display P3 PNG keeps the hue of its color", async () => {
    const result = await extractColors(await encodeTestImage("p3.png"), { count: 1 });
    const rgba = result.colors[0]?.rgba ?? [0, 0, 0, 0];
    expect(hueDistance(hue(rgba), hue([200, 60, 30]))).toBeLessThan(25);
  });

  test("gray, gray with alpha, 16-bit, and palette images decode", async () => {
    for (const name of ["gray.png", "gray-alpha.png", "rgb16.png", "palette.png"] as const) {
      const result = await extractColors(await encodeTestImage(name));
      expect(result.colors.length).toBeGreaterThan(0);
    }
    const gray = await extractColors(await encodeTestImage("gray.png"), { count: 1 });
    const [r, g, b] = gray.colors[0]?.rgba ?? [0, 1, 2];
    expect(r === g && g === b).toBe(true);
  });
});

describe("animations and formats", () => {
  test("animated WebP is rejected as UNSUPPORTED_FORMAT", async () => {
    for (const name of ["animated.webp", "animated.png", "animated.gif"] as const) {
      const error = await rejection(extractColors(await encodeTestImage(name)));
      expect(error.code).toBe("UNSUPPORTED_FORMAT");
    }
  });

  test("a still GIF, TIFF, SVG, and HEIC are UNSUPPORTED_FORMAT", async () => {
    for (const name of ["static.gif", "image.tiff", "image.svg", "heic-brand.bin"] as const) {
      const error = await rejection(extractColors(await encodeTestImage(name)));
      expect(error.code).toBe("UNSUPPORTED_FORMAT");
    }
  });
});
