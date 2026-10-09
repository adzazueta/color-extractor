import { describe, expect, test, vi } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { extractColors } from "@/core/async.js";
import { extractColorsFromPixels } from "@/core/extract.js";
import type { PixelInput } from "@/core/types.js";
import { blocks, rgbaSample } from "../../support/pixels.js";

const ONLY_PIXELS =
  'The /core entry only accepts pixels. Import "@adzazueta/color-extractor" (or /node, /browser) to load files, bytes, or URLs.';

async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

describe("the /core extractColors", () => {
  test("returns the same result as extractColorsFromPixels", async () => {
    for (const pixels of [blocks(), rgbaSample()]) {
      expect(await extractColors(pixels)).toEqual(extractColorsFromPixels(pixels));
    }
    const options = { count: 2, mode: "population" } as const;
    expect(await extractColors(blocks(), options)).toEqual(
      extractColorsFromPixels(blocks(), options),
    );
  });

  test("returns a promise and rejects instead of throwing", async () => {
    const promise = extractColors("photo.png" as unknown as PixelInput);
    expect(promise).toBeInstanceOf(Promise);
    await rejection(promise);
  });

  test.each([
    ["a string", "photo.png"],
    ["an http URL string", "https://example.com/a.png"],
    ["a URL object", new URL("https://example.com/a.png")],
    ["a Uint8Array", new Uint8Array([1, 2, 3])],
    ["a Buffer", Buffer.from([1, 2, 3])],
    ["an ArrayBuffer", new ArrayBuffer(3)],
    ["a Blob", new Blob([new Uint8Array([1, 2, 3])])],
    ["a File", new File([new Uint8Array([1, 2, 3])], "a.png")],
  ])("rejects %s with the exact message", async (_name, input) => {
    const error = await rejection(extractColors(input as unknown as PixelInput));
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe(ONLY_PIXELS);
  });

  test("other invalid inputs are reported by the pixel validation", async () => {
    for (const input of [
      null,
      undefined,
      42,
      {},
      { data: new Uint8Array(3), width: 1, height: 1 },
    ]) {
      const error = await rejection(extractColors(input as unknown as PixelInput));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.message).not.toBe(ONLY_PIXELS);
    }
  });

  test("validates the options and the pixel limit", async () => {
    expect((await rejection(extractColors(blocks(), { count: 0 }))).code).toBe("INVALID_OPTIONS");
    expect((await rejection(extractColors(blocks(), { bogus: 1 } as never))).code).toBe(
      "INVALID_OPTIONS",
    );
    expect((await rejection(extractColors(blocks(), { limits: { maxPixels: 10 } }))).code).toBe(
      "INPUT_TOO_LARGE",
    );
  });

  test("invalid options win over a non-pixel input", async () => {
    const error = await rejection(
      extractColors("photo.png" as unknown as PixelInput, { count: 0 }),
    );
    expect(error.code).toBe("INVALID_OPTIONS");
  });

  test("pixels ignore maxBytes", async () => {
    await expect(extractColors(blocks(), { limits: { maxBytes: 1 } })).resolves.toEqual(
      extractColorsFromPixels(blocks()),
    );
  });

  test("a pre-aborted signal rejects with ABORTED and the reason as cause", async () => {
    const reason = new Error("stop");
    const error = await rejection(extractColors(blocks(), { signal: AbortSignal.abort(reason) }));
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe(reason);
  });

  test("invalid input wins over a pre-aborted signal", async () => {
    const error = await rejection(
      extractColors("x" as unknown as PixelInput, { signal: AbortSignal.abort() }),
    );
    expect(error.code).toBe("INVALID_INPUT");
  });

  test("a signal that is not aborted, and fetch, are accepted and ignored", async () => {
    const fetch = vi.fn();
    const result = await extractColors(blocks(), {
      signal: new AbortController().signal,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(result).toEqual(extractColorsFromPixels(blocks()));
    expect(fetch).not.toHaveBeenCalled();
  });
});
