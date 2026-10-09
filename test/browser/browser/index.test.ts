/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/browser/index.js";
import { decodeImage } from "@/browser/decode.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS } from "@/core/defaults.js";
import { ColorExtractorError } from "@/core/errors.js";
import { extractColorsFromPixels } from "@/core/extract.js";
import type { TestImageName } from "../../support/images.js";
import { blocks } from "../../support/pixels.js";

const BASE = "/__test-images__/";
const LIMITS = { maxBytes: DEFAULT_MAX_BYTES, maxPixels: DEFAULT_MAX_PIXELS };

async function fixture(name: TestImageName): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(`${BASE}${name}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

async function expectedFor(bytes: Uint8Array) {
  return extractColorsFromPixels(await decodeImage(bytes, LIMITS, undefined));
}

describe("extractColors in the browser", () => {
  test("Blob, File, Uint8Array, and ArrayBuffer match the sync core on the decoded pixels", async () => {
    const bytes = await fixture("blocks.png");
    const expected = await expectedFor(bytes);
    expect(expected.colors.length).toBeGreaterThan(0);
    expect(await extractColors(new Blob([bytes], { type: "image/png" }))).toEqual(expected);
    expect(await extractColors(new Blob([bytes]))).toEqual(expected);
    expect(await extractColors(new File([bytes], "cover.png"))).toEqual(expected);
    expect(await extractColors(bytes)).toEqual(expected);
    expect(await extractColors(bytes.buffer.slice(0))).toEqual(expected);
    // Opaque lossless decoding is exact, so it also equals the pixel result.
    expect(expected).toEqual(extractColorsFromPixels(blocks()));
  });

  test("ImageData and plain pixels", async () => {
    const pixels = blocks();
    const imageData = new ImageData(
      new Uint8ClampedArray(pixels.data),
      pixels.width,
      pixels.height,
    );
    const expected = extractColorsFromPixels(pixels);
    expect(await extractColors(imageData)).toEqual(expected);
    expect(await extractColors(pixels)).toEqual(expected);
  });

  test("relative strings resolve against document.baseURI", async () => {
    const expected = await expectedFor(await fixture("blocks.png"));
    expect(await extractColors(`${BASE}blocks.png`)).toEqual(expected);
    expect(await extractColors(`.${BASE}blocks.png`)).toEqual(expected);
    expect(await extractColors(new URL(`${BASE}blocks.png`, document.baseURI))).toEqual(expected);
    expect(await extractColors(`${location.origin}${BASE}blocks.png`)).toEqual(expected);
  });

  test("blob:, data:, and blank strings are INVALID_INPUT", async () => {
    const blobUrl = URL.createObjectURL(new Blob([new Uint8Array([1])]));
    try {
      for (const input of [blobUrl, "data:image/png;base64,AAAA", " ", "", "\n\t"]) {
        const error = await rejection(extractColors(input));
        expect(error.code).toBe("INVALID_INPUT");
        expect(error.message).not.toContain("AAAA");
      }
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  });

  test("empty Blob and bytes, and elements, are INVALID_INPUT", async () => {
    for (const input of [new Blob([]), new Uint8Array(0), new ArrayBuffer(0)]) {
      const error = await rejection(extractColors(input));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.message).toBe("Input data is empty.");
    }
    for (const input of [
      document.createElement("canvas"),
      document.createElement("img"),
      42,
      null,
    ]) {
      expect((await rejection(extractColors(input as never))).code).toBe("INVALID_INPUT");
    }
  });

  test("precedence: options, input, then limits, then abort", async () => {
    expect((await rejection(extractColors(42 as never, { count: 0 }))).code).toBe(
      "INVALID_OPTIONS",
    );
    expect(
      (await rejection(extractColors(42 as never, { signal: AbortSignal.abort() }))).code,
    ).toBe("INVALID_INPUT");
    const bytes = await fixture("blocks.png");
    expect(
      (
        await rejection(
          extractColors(new Blob([bytes]), {
            signal: AbortSignal.abort(),
            limits: { maxBytes: 5 },
          }),
        )
      ).code,
    ).toBe("INPUT_TOO_LARGE");
    expect((await rejection(extractColors(blocks(), { signal: AbortSignal.abort() }))).code).toBe(
      "ABORTED",
    );
  });

  test("a cross-origin URL without CORS is FETCH_FAILED with the CORS hint", async () => {
    const response = await fetch(`${BASE}cross-origin`);
    const { origin } = (await response.json()) as { origin: string };
    const error = await rejection(extractColors(`${origin}${BASE}blocks.png`));
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.message).toContain("CORS");
    expect(error.message).not.toContain("blocks.png");
  });

  test("a cross-origin URL with CORS works", async () => {
    const response = await fetch(`${BASE}cross-origin`);
    const { origin } = (await response.json()) as { origin: string };
    const expected = await expectedFor(await fixture("blocks.png"));
    expect(await extractColors(`${origin}${BASE}blocks.png?cors=1`)).toEqual(expected);
  });

  test("a custom fetch is used", async () => {
    const bytes = await fixture("blocks.png");
    const calls: string[] = [];
    const result = await extractColors("https://example.test/a.png", {
      fetch: async (url) => {
        calls.push(url instanceof Request ? url.url : String(url));
        return new Response(new Blob([bytes]));
      },
    });
    expect(calls).toEqual(["https://example.test/a.png"]);
    expect(result).toEqual(await expectedFor(bytes));
  });
});
