/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { extractColors, extractColorsFromPixels } from "@/browser/index.js";
import type { TestImageName } from "../../support/images.js";
import { blocks } from "../../support/pixels.js";
import { BASE, crossOriginBase, fixture, rejection } from "./helpers.js";

const expected = extractColorsFromPixels(blocks());

// Opaque lossless decoding is exact in every engine, so these equal the pixel result.
describe.each<TestImageName>(["blocks.png", "blocks.webp", "blocks.avif"])("%s", (name) => {
  test("Blob, File, Uint8Array, and ArrayBuffer", async () => {
    const bytes = await fixture(name);
    expect(await extractColors(new Blob([bytes]))).toEqual(expected);
    expect(await extractColors(new File([bytes], "cover"))).toEqual(expected);
    expect(await extractColors(bytes)).toEqual(expected);
    expect(await extractColors(bytes.buffer.slice(0))).toEqual(expected);
  });

  test("a Uint8Array view with an offset", async () => {
    const bytes = await fixture(name);
    const padded = new Uint8Array(bytes.length + 9);
    padded.set(bytes, 4);
    expect(await extractColors(padded.subarray(4, 4 + bytes.length))).toEqual(expected);
  });

  test("absolute path, relative path, absolute URL string, and URL object", async () => {
    expect(await extractColors(`${BASE}${name}`)).toEqual(expected);
    expect(await extractColors(`.${BASE}${name}`)).toEqual(expected);
    expect(await extractColors(`${location.origin}${BASE}${name}`)).toEqual(expected);
    expect(await extractColors(new URL(`${BASE}${name}`, document.baseURI))).toEqual(expected);
  });
});

describe("blocks.jpg (lossy)", () => {
  test("gives the same hues in the same order", async () => {
    const result = await extractColors(await fixture("blocks.jpg"));
    expect(result.meta.width).toBe(64);
    expect(result.meta.height).toBe(48);
    expect(result.colors.length).toBeGreaterThanOrEqual(3);
    for (const [index, want] of expected.colors.entries()) {
      const got = result.colors[index];
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs((got?.rgba[channel] ?? 999) - (want.rgba[channel] ?? 0)),
        ).toBeLessThanOrEqual(16);
      }
    }
    // The white block has no edge, so its coverage stays within 0.02; red and blue lose some coverage
    // to the intermediate shades JPEG creates at their boundary.
    expect(Math.abs((result.colors[2]?.coverage ?? 9) - 0.1)).toBeLessThanOrEqual(0.02);
  });
});

describe("pixel inputs", () => {
  test("ImageData from a canvas", async () => {
    const pixels = blocks();
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no 2d context");
    context.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0,
    );
    const imageData = context.getImageData(0, 0, pixels.width, pixels.height);
    expect(await extractColors(imageData)).toEqual(expected);
  });

  test("plain pixels", async () => {
    expect(await extractColors(blocks())).toEqual(expected);
  });
});

describe("cross-origin URLs", () => {
  test("with CORS, as a string and as a URL object", async () => {
    const base = await crossOriginBase();
    expect(await extractColors(`${base}blocks.png?cors=1`)).toEqual(expected);
    expect(await extractColors(new URL(`${base}blocks.png?cors=1`))).toEqual(expected);
  });

  test("without CORS is FETCH_FAILED and the message mentions CORS", async () => {
    const base = await crossOriginBase();
    const error = await rejection(extractColors(`${base}blocks.png`));
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.message).toContain("CORS");
  });
});
