/// <reference lib="dom" />
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { decodeImage } from "@/browser/decode.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS } from "@/core/defaults.js";
import { ColorExtractorError } from "@/core/errors.js";
import type { PixelInput } from "@/core/types.js";
import type { ResolvedLimits } from "@/core/validate.js";
import type { TestImageName } from "../../support/images.js";
import { blocks, rgbaSample } from "../../support/pixels.js";

const LIMITS: ResolvedLimits = { maxBytes: DEFAULT_MAX_BYTES, maxPixels: DEFAULT_MAX_PIXELS };

const DECODER_MISSING_MESSAGE =
  "This environment has no image decoder: createImageBitmap and OffscreenCanvas are required. Pass raw pixels instead.";

const ENGINE = navigator.userAgent.includes("Firefox")
  ? "firefox"
  : navigator.userAgent.includes("Chrome")
    ? "chromium"
    : "webkit";

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

// Captured before any spy replaces the global.
const realCreateImageBitmap: typeof createImageBitmap = createImageBitmap.bind(globalThis);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The fixture bytes, encoded by sharp and served by the test image plugin. */
async function fixture(name: TestImageName): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(`/__test-images__/${name}`);
  if (!response.ok) {
    throw new Error(`The test image server answered ${response.status} for ${name}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function at(pixels: PixelInput, x: number, y: number): number[] {
  const i = (y * pixels.width + x) * 4;
  return Array.from(pixels.data.subarray(i, i + 4));
}

function maxDifference(actual: ArrayLike<number>, expected: ArrayLike<number>): number {
  expect(actual.length).toBe(expected.length);
  let max = 0;
  for (let i = 0; i < actual.length; i++) {
    max = Math.max(max, Math.abs((actual[i] ?? 0) - (expected[i] ?? 0)));
  }
  return max;
}

function expectExact(pixels: PixelInput, expected: PixelInput): void {
  expect([pixels.width, pixels.height]).toEqual([expected.width, expected.height]);
  expect(new Uint8Array(pixels.data)).toEqual(new Uint8Array(expected.data));
}

function expectNear(actual: readonly number[], expected: readonly number[], tolerance: number) {
  expect(
    maxDifference(actual, expected),
    `${actual.join()} vs ${expected.join()}`,
  ).toBeLessThanOrEqual(tolerance);
}

/** Spies on createImageBitmap, calling through to the browser's implementation. */
function spyOnCreateImageBitmap() {
  return vi.spyOn(globalThis, "createImageBitmap");
}

/** A real bitmap of the given size, made without going through any spy. */
function realBitmap(width: number, height: number): Promise<ImageBitmap> {
  return realCreateImageBitmap(new ImageData(width, height));
}

async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

describe("inputs", () => {
  test("a Uint8Array, an offset view, an ArrayBuffer view, a Blob, and a File decode alike", async () => {
    const bytes = await fixture("blocks.png");
    const padded = new Uint8Array(bytes.length + 7);
    padded.set(bytes, 3);
    const inputs: (Uint8Array | Blob)[] = [
      bytes,
      padded.subarray(3, 3 + bytes.length),
      // What the entry point passes for an ArrayBuffer input: a view without a copy.
      new Uint8Array(bytes.slice().buffer),
      new Blob([bytes], { type: "image/png" }),
      new File([bytes], "cover.png", { type: "image/png" }),
    ];
    for (const input of inputs) {
      const pixels = await decodeImage(input, LIMITS, undefined);
      expect(pixels.data).toBeInstanceOf(Uint8ClampedArray);
      expectExact(pixels, blocks());
    }
  });

  test("the type of a Blob or File is ignored", async () => {
    const bytes = await fixture("blocks.png");
    expectExact(
      await decodeImage(new Blob([bytes], { type: "text/plain" }), LIMITS, undefined),
      blocks(),
    );
    expectExact(
      await decodeImage(new File([bytes], "cover.gif", { type: "image/gif" }), LIMITS, undefined),
      blocks(),
    );
  });

  // The Blob constructor throws a TypeError for such views in all three engines, so they are copied.
  test("a view on a resizable ArrayBuffer decodes", async () => {
    const bytes = await fixture("blocks.png");
    const buffer = new ArrayBuffer(bytes.length, { maxByteLength: bytes.length * 2 });
    const view = new Uint8Array(buffer);
    view.set(bytes);
    expectExact(await decodeImage(view, LIMITS, undefined), blocks());
  });

  test("the input bytes are not modified", async () => {
    const bytes = (await fixture("rgba.png")).slice();
    const copy = bytes.slice();
    await decodeImage(bytes, LIMITS, undefined);
    expect(bytes).toEqual(copy);
  });
});

describe("formats", () => {
  test("PNG and lossless WebP decode exactly", async () => {
    expectExact(await decodeImage(await fixture("blocks.png"), LIMITS, undefined), blocks());
    expectExact(await decodeImage(await fixture("blocks.webp"), LIMITS, undefined), blocks());
  });

  test("lossless AVIF decodes within ±2", async () => {
    const pixels = await decodeImage(await fixture("blocks.avif"), LIMITS, undefined);
    expect([pixels.width, pixels.height]).toEqual([64, 48]);
    expect(maxDifference(pixels.data, blocks().data)).toBeLessThanOrEqual(2);
  });

  test("JPEG decodes to the source colors within the lossy tolerance", async () => {
    const pixels = await decodeImage(await fixture("blocks.jpg"), LIMITS, undefined);
    expect([pixels.width, pixels.height]).toEqual([64, 48]);
    // Rows 0-27 are red and rows 29-42 blue; these 8×8 blocks hold a single color.
    expectNear(at(pixels, 20, 4), [220, 40, 40, 255], 8);
    expectNear(at(pixels, 20, 36), [30, 60, 200, 255], 8);
  });

  test("opaque pixels are exact, alpha is exact, and alpha 128 shifts RGB by at most 1", async () => {
    const pixels = await decodeImage(await fixture("rgba.png"), LIMITS, undefined);
    const source = rgbaSample();
    expect([pixels.width, pixels.height]).toEqual([4, 2]);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const actual = at(pixels, x, y);
        const expected = at(source, x, y);
        // Alpha is always exact, even for the alpha-1 pixels whose RGB is not reliable.
        expect(actual[3]).toBe(expected[3]);
        if (expected[3] === 255) {
          expect(actual).toEqual(expected);
        } else if (expected[3] === 128) {
          expectNear(actual, expected, 1);
        }
      }
    }
  });
});

describe("orientation", () => {
  test("EXIF orientation 6 is applied: 20×40 with red at the top", async () => {
    const pixels = await decodeImage(await fixture("orientation-6.jpg"), LIMITS, undefined);
    expect([pixels.width, pixels.height]).toEqual([20, 40]);
    expectNear(at(pixels, 10, 5), RED, 8);
    expectNear(at(pixels, 10, 34), BLUE, 8);
  });

  test("EXIF orientation 3 is applied: 40×20 rotated by 180°", async () => {
    const pixels = await decodeImage(await fixture("orientation-3.jpg"), LIMITS, undefined);
    expect([pixels.width, pixels.height]).toEqual([40, 20]);
    expectNear(at(pixels, 5, 10), BLUE, 8);
    expectNear(at(pixels, 34, 10), RED, 8);
  });
});

describe("animations", () => {
  test.each([
    ["animated.webp", 4, 2],
    ["animated.png", 2, 1],
  ] as const)("%s gives its red first frame", async (name, width, height) => {
    const pixels = await decodeImage(await fixture(name), LIMITS, undefined);
    expect([pixels.width, pixels.height]).toEqual([width, height]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(at(pixels, x, y)).toEqual(RED);
      }
    }
  });
});

describe("rejected inputs", () => {
  test.each([
    "animated.gif",
    "static.gif",
    "image.svg",
    "image.tiff",
    "heic-brand.bin",
    "garbage.bin",
  ] as const)("%s gives UNSUPPORTED_FORMAT without decoding", async (name) => {
    const bytes = await fixture(name);
    const create = spyOnCreateImageBitmap();
    const error = await rejection(decodeImage(new Blob([bytes]), LIMITS, undefined));
    expect(error.code).toBe("UNSUPPORTED_FORMAT");
    expect(error.message).toBe(
      "Unsupported image format. Supported formats are JPEG, PNG, WebP, and AVIF.",
    );
    expect(create).not.toHaveBeenCalled();
  });

  // Chromium rejects damaged data, as sharp does. Firefox and WebKit (measured on macOS) return what
  // they could decode instead: a truncated JPEG keeps its first rows and fills the rest (white in
  // Firefox, gray in WebKit), and a PNG whose compressed data does not inflate comes back fully
  // transparent. The decoder cannot tell those results from real images.
  test.each([
    ["truncated.jpg", 64, 48],
    ["corrupt.png", 8, 8],
  ] as const)(
    "%s gives DECODE_FAILED in Chromium, or a partial image of the header size",
    async (name, width, height) => {
      const outcome = await decodeImage(await fixture(name), LIMITS, undefined).then(
        (pixels) => pixels,
        (reason: unknown) => reason,
      );
      if (ENGINE === "chromium" || outcome instanceof ColorExtractorError) {
        expect(outcome).toBeInstanceOf(ColorExtractorError);
        const error = outcome as ColorExtractorError;
        expect(error.code).toBe("DECODE_FAILED");
        expect(error.message).toBe("The image could not be decoded.");
        expect(error.cause).toBeDefined();
      } else {
        const pixels = outcome as PixelInput;
        expect([pixels.width, pixels.height]).toEqual([width, height]);
      }
    },
  );

  // Empty input is INVALID_INPUT in the entry points; an empty file or download reaches the
  // decoder and is DECODE_FAILED.
  test("empty bytes or an empty Blob give DECODE_FAILED without decoding", async () => {
    const create = spyOnCreateImageBitmap();
    for (const input of [new Uint8Array(0), new Blob([])]) {
      const error = await rejection(decodeImage(input, LIMITS, undefined));
      expect(error.code).toBe("DECODE_FAILED");
      expect(error.message).toBe("The image data is empty.");
    }
    expect(create).not.toHaveBeenCalled();
  });

  test("an unreadable Blob gives READ_FAILED with the cause", async () => {
    const blob = new Blob([await fixture("blocks.png")]);
    const failure = new DOMException("The file changed.", "NotReadableError");
    vi.spyOn(blob, "arrayBuffer").mockRejectedValue(failure);
    const error = await rejection(decodeImage(blob, LIMITS, undefined));
    expect(error.code).toBe("READ_FAILED");
    expect(error.message).toBe("Could not read the Blob or File.");
    expect(error.cause).toBe(failure);
  });
});

describe("limits", () => {
  test("a header over the pixel limit gives INPUT_TOO_LARGE without decoding", async () => {
    const create = spyOnCreateImageBitmap();
    const error = await rejection(
      decodeImage(await fixture("large-header.png"), LIMITS, undefined),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(create).not.toHaveBeenCalled();
  });

  test("the pixel limit is inclusive", async () => {
    const bytes = await fixture("blocks.png");
    const create = spyOnCreateImageBitmap();
    const error = await rejection(
      decodeImage(bytes, { maxBytes: DEFAULT_MAX_BYTES, maxPixels: 64 * 48 - 1 }, undefined),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(create).not.toHaveBeenCalled();
    const pixels = await decodeImage(
      bytes,
      { maxBytes: DEFAULT_MAX_BYTES, maxPixels: 64 * 48 },
      undefined,
    );
    expectExact(pixels, blocks());
  });

  test("a bitmap over the pixel limit gives INPUT_TOO_LARGE before drawing and is closed", async () => {
    // The header says 64×48, which passes; the bitmap is bigger than the header claimed.
    const big = await realBitmap(100, 100);
    vi.spyOn(globalThis, "createImageBitmap").mockResolvedValue(big);
    const draw = vi.spyOn(OffscreenCanvasRenderingContext2D.prototype, "drawImage");
    const error = await rejection(
      decodeImage(
        await fixture("blocks.png"),
        { maxBytes: DEFAULT_MAX_BYTES, maxPixels: 64 * 48 },
        undefined,
      ),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(error.message).toBe("Image has 10000 pixels, which exceeds the limit of 3072.");
    expect(draw).not.toHaveBeenCalled();
    // A closed bitmap reports a size of 0.
    expect([big.width, big.height]).toEqual([0, 0]);
  });
});

describe("missing browser APIs", () => {
  test.each(["createImageBitmap", "OffscreenCanvas"])(
    "without %s the result is DECODER_MISSING",
    async (name) => {
      const bytes = await fixture("blocks.png");
      vi.stubGlobal(name, undefined);
      const error = await rejection(decodeImage(bytes, LIMITS, undefined));
      expect(error.code).toBe("DECODER_MISSING");
      expect(error.message).toBe(DECODER_MISSING_MESSAGE);
    },
  );

  test("header checks still run first", async () => {
    const gif = await fixture("static.gif");
    const large = await fixture("large-header.png");
    vi.stubGlobal("createImageBitmap", undefined);
    expect((await rejection(decodeImage(gif, LIMITS, undefined))).code).toBe("UNSUPPORTED_FORMAT");
    expect((await rejection(decodeImage(large, LIMITS, undefined))).code).toBe("INPUT_TOO_LARGE");
    expect((await rejection(decodeImage(new Uint8Array(0), LIMITS, undefined))).code).toBe(
      "DECODE_FAILED",
    );
  });
});

describe("cleanup", () => {
  test("the bitmap is closed and the canvas released after a success", async () => {
    const bytes = await fixture("blocks.png");
    const close = vi.spyOn(ImageBitmap.prototype, "close");
    const getContext = vi.spyOn(OffscreenCanvas.prototype, "getContext");
    expectExact(await decodeImage(bytes, LIMITS, undefined), blocks());
    expect(close).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
    const canvas = getContext.mock.contexts[0] as OffscreenCanvas;
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  test("a missing 2D context gives DECODE_FAILED and closes the bitmap", async () => {
    const bytes = await fixture("blocks.png");
    const close = vi.spyOn(ImageBitmap.prototype, "close");
    vi.spyOn(OffscreenCanvas.prototype, "getContext").mockReturnValue(null);
    const error = await rejection(decodeImage(bytes, LIMITS, undefined));
    expect(error.code).toBe("DECODE_FAILED");
    expect(error.message).toBe("The browser could not create a 64×48 canvas.");
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("a canvas that cannot be created gives DECODE_FAILED with the cause", async () => {
    const bytes = await fixture("blocks.png");
    const close = vi.spyOn(ImageBitmap.prototype, "close");
    const failure = new DOMException("Out of memory.", "InvalidStateError");
    vi.spyOn(OffscreenCanvas.prototype, "getContext").mockImplementation(() => {
      throw failure;
    });
    const error = await rejection(decodeImage(bytes, LIMITS, undefined));
    expect(error.code).toBe("DECODE_FAILED");
    expect(error.message).toBe("The browser could not create a 64×48 canvas.");
    expect(error.cause).toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("a failing pixel readback gives DECODE_FAILED, closes the bitmap, and releases the canvas", async () => {
    const bytes = await fixture("blocks.png");
    const close = vi.spyOn(ImageBitmap.prototype, "close");
    const getContext = vi.spyOn(OffscreenCanvas.prototype, "getContext");
    const failure = new DOMException("Readback failed.", "SecurityError");
    vi.spyOn(OffscreenCanvasRenderingContext2D.prototype, "getImageData").mockImplementation(() => {
      throw failure;
    });
    const error = await rejection(decodeImage(bytes, LIMITS, undefined));
    expect(error.code).toBe("DECODE_FAILED");
    expect(error.message).toBe("The browser could not read the pixels of the decoded image.");
    expect(error.cause).toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
    const canvas = getContext.mock.contexts[0] as OffscreenCanvas;
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});

describe("abort", () => {
  test("an aborted signal rejects before reading or decoding", async () => {
    const blob = new Blob([await fixture("blocks.png")]);
    const read = vi.spyOn(blob, "arrayBuffer");
    const create = spyOnCreateImageBitmap();
    const controller = new AbortController();
    controller.abort("stop");
    const error = await rejection(decodeImage(blob, LIMITS, controller.signal));
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("stop");
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    // The abort check comes first, even for data that would be rejected.
    const garbage = await fixture("garbage.bin");
    expect((await rejection(decodeImage(garbage, LIMITS, controller.signal))).code).toBe("ABORTED");
  });

  test("an abort while the Blob is read rejects at once", async () => {
    const blob = new Blob([await fixture("blocks.png")]);
    vi.spyOn(blob, "arrayBuffer").mockReturnValue(new Promise<ArrayBuffer>(() => {}));
    const create = spyOnCreateImageBitmap();
    const controller = new AbortController();
    const pending = decodeImage(blob, LIMITS, controller.signal);
    const reason = new Error("stop");
    controller.abort(reason);
    const error = await rejection(pending);
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe(reason);
    expect(create).not.toHaveBeenCalled();
  });

  test("an abort while decoding rejects at once and closes the late bitmap", async () => {
    const bytes = await fixture("blocks.png");
    const late = await realBitmap(2, 2);
    let deliver: ((bitmap: ImageBitmap) => void) | undefined;
    const create = vi
      .spyOn(globalThis, "createImageBitmap")
      .mockImplementation(() => new Promise<ImageBitmap>((resolve) => (deliver = resolve)));
    const close = vi.spyOn(ImageBitmap.prototype, "close");
    const controller = new AbortController();
    const pending = decodeImage(bytes, LIMITS, controller.signal);
    expect(create).toHaveBeenCalledTimes(1);
    const reason = new Error("stop");
    controller.abort(reason);
    const error = await rejection(pending);
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe(reason);
    expect(close).not.toHaveBeenCalled();
    deliver?.(late);
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(close.mock.contexts[0]).toBe(late);
    expect([late.width, late.height]).toEqual([0, 0]);
  });
});

describe("environment", () => {
  test("decodes in a dedicated worker", async () => {
    const bytes = await fixture("orientation-6.jpg");
    // The worker imports this module from the Vite server, as the test file does.
    const moduleUrl = new URL("../../../src/browser/decode.ts", import.meta.url).href;
    const source = `
      import { decodeImage } from ${JSON.stringify(moduleUrl)};
      self.onmessage = async (event) => {
        try {
          const pixels = await decodeImage(event.data, ${JSON.stringify(LIMITS)}, undefined);
          self.postMessage({ width: pixels.width, height: pixels.height, data: pixels.data });
        } catch (error) {
          self.postMessage({ error: String(error) });
        }
      };`;
    const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(workerUrl, { type: "module" });
    try {
      const result = await new Promise<PixelInput | { error: string }>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<PixelInput | { error: string }>) =>
          resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(new Blob([bytes]));
      });
      expect(result).not.toHaveProperty("error");
      const main = await decodeImage(bytes, LIMITS, undefined);
      expectExact(result as PixelInput, main);
    } finally {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    }
  });

  test("the bitmap gets the documented options", async () => {
    const create = spyOnCreateImageBitmap();
    await decodeImage(await fixture("blocks.png"), LIMITS, undefined);
    expect(create).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
    });
  });
});
