import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { extractColors, extractColorsFromPixels } from "@/node/index.js";
import { encodeTestImage, type TestImageName } from "../../support/images.js";
import { startTestImageServer, type TestImageServer } from "../../support/image-server.js";
import { blocks, rgbaSample } from "../../support/pixels.js";
import { expectSimilarColors, rejection } from "./helpers.js";

const LOSSLESS: readonly TestImageName[] = ["blocks.png", "blocks.webp", "blocks.avif"];

let directory: string;
let server: TestImageServer;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "color-extractor-adapters-"));
  server = await startTestImageServer({ cors: false });
  for (const name of [...LOSSLESS, "blocks.jpg"] as const) {
    await writeFile(join(directory, name), await encodeTestImage(name));
  }
});

afterAll(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

describe("pixel inputs", () => {
  test("plain pixels equal the sync core", async () => {
    expect(await extractColors(blocks())).toEqual(extractColorsFromPixels(blocks()));
    expect(await extractColors(rgbaSample())).toEqual(extractColorsFromPixels(rgbaSample()));
  });

  test("Uint8ClampedArray pixels equal the sync core", async () => {
    const pixels = blocks();
    const clamped = { ...pixels, data: new Uint8ClampedArray(pixels.data) };
    expect(await extractColors(clamped)).toEqual(extractColorsFromPixels(pixels));
  });
});

describe.each(LOSSLESS)("%s (lossless, opaque) equals the pixel result", (name) => {
  const expected = extractColorsFromPixels(blocks());

  test("path", async () => {
    expect(await extractColors(join(directory, name))).toEqual(expected);
  });

  test("Buffer", async () => {
    expect(await extractColors(Buffer.from(await encodeTestImage(name)))).toEqual(expected);
  });

  test("Uint8Array view with an offset", async () => {
    const bytes = await encodeTestImage(name);
    const padded = new Uint8Array(bytes.length + 11);
    padded.set(bytes, 5);
    expect(await extractColors(padded.subarray(5, 5 + bytes.length))).toEqual(expected);
  });

  test("ArrayBuffer", async () => {
    const bytes = await encodeTestImage(name);
    expect(await extractColors(bytes.slice().buffer)).toEqual(expected);
  });

  test("URL string", async () => {
    expect(await extractColors(`${server.origin}/__test-images__/${name}`)).toEqual(expected);
  });

  test("URL object", async () => {
    expect(await extractColors(new URL(`${server.origin}/__test-images__/${name}`))).toEqual(
      expected,
    );
  });
});

describe("blocks.jpg (lossy)", () => {
  const expected = extractColorsFromPixels(blocks());

  test("every input kind gives the same colors in the same order", async () => {
    const bytes = await encodeTestImage("blocks.jpg");
    const results = await Promise.all([
      extractColors(join(directory, "blocks.jpg")),
      extractColors(Buffer.from(bytes)),
      extractColors(bytes.slice().buffer),
      extractColors(`${server.origin}/__test-images__/blocks.jpg`),
      extractColors(new URL(`${server.origin}/__test-images__/blocks.jpg`)),
    ]);
    for (const result of results) {
      expect(result.meta.width).toBe(64);
      expect(result.meta.height).toBe(48);
      // JPEG blurs the red/blue boundary into intermediate shades that split off up to ~0.08 of the
      // red and blue coverage (measured: red -0.04, blue -0.08); the white block has no such edge and stays within the ±0.02 contract.
      expectSimilarColors(result.colors, expected.colors, 16, 0.08);
      expect(
        Math.abs((result.colors[2]?.coverage ?? 9) - (expected.colors[2]?.coverage ?? 0)),
      ).toBeLessThanOrEqual(0.02);
    }
  });
});

describe("Blob and File", () => {
  test("are INVALID_INPUT in Node", async () => {
    const bytes = new Uint8Array(await encodeTestImage("blocks.png"));
    for (const input of [new Blob([bytes]), new File([bytes], "a.png")]) {
      const error = await rejection(extractColors(input as never));
      expect(error.code).toBe("INVALID_INPUT");
    }
  });
});
