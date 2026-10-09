import sharp, { type Metadata, type OutputInfo, type Sharp, type SharpOptions } from "sharp";
import { describe, expect, test, vi } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import type { PixelInput } from "@/core/types.js";
import { validatePixels, type ResolvedLimits } from "@/core/validate.js";
import { decodeImage } from "@/node/decode.js";
import { createSharpLoader, type SharpFunction } from "@/node/sharp.js";
import { encodeTestImage, type TestImageName } from "../../support/images.js";
import { blocks, rgbaSample } from "../../support/pixels.js";

const LIMITS: ResolvedLimits = { maxBytes: 33_554_432, maxPixels: 16_777_216 };
const UNSUPPORTED = "Unsupported image format. Supported formats are JPEG, PNG, WebP, and AVIF.";
const ANIMATED = "Animated images are not supported in Node.js. Provide a still image instead.";
const SOURCE = [200, 60, 30] as const; // The color of the CMYK, P3, and 16-bit fixtures.

type Rgba = readonly [number, number, number, number];
type Decoded = { data: Buffer; info: OutputInfo };

function pixelAt(pixels: PixelInput, x: number, y: number): Rgba {
  const i = (y * pixels.width + x) * 4;
  const { data } = pixels;
  return [data[i] ?? -1, data[i + 1] ?? -1, data[i + 2] ?? -1, data[i + 3] ?? -1];
}

function expectClose(actual: readonly number[], expected: readonly number[], tolerance: number) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    const target = expected[i] ?? Number.NaN;
    expect(Math.abs(value - target), `channel ${i}: ${value} vs ${target}`).toBeLessThanOrEqual(
      tolerance,
    );
  });
}

async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

async function decodeFixture(name: TestImageName): Promise<PixelInput> {
  return decodeImage(await encodeTestImage(name), LIMITS, undefined);
}

/** A loader that fails the test if decodeImage ever calls it. */
function unusedLoader() {
  return vi.fn(() => Promise.reject(new Error("The loader must not be called.")));
}

interface Overrides {
  metadata?: (real: () => Promise<Metadata>) => Promise<Metadata>;
  toBuffer?: (real: () => Promise<Decoded>) => Promise<Decoded>;
}

/** The real sharp, with `metadata()` or `toBuffer()` replaced, recording every call's options. */
function wrappedSharp(overrides: Overrides = {}) {
  const calls: (SharpOptions | undefined)[] = [];
  const wrapped = (input?: Uint8Array, options?: SharpOptions): Sharp => {
    calls.push(options);
    const instance = sharp(input, options);
    const { metadata, toBuffer } = overrides;
    if (metadata !== undefined) {
      const real = instance.metadata.bind(instance);
      instance.metadata = (() => metadata(real)) as unknown as Sharp["metadata"];
    }
    if (toBuffer !== undefined) {
      const original = instance.toBuffer.bind(instance);
      instance.toBuffer = (() =>
        toBuffer(() => original({ resolveWithObject: true }))) as unknown as Sharp["toBuffer"];
    }
    return instance;
  };
  return { calls, load: () => Promise.resolve(wrapped as SharpFunction) };
}

/** Inserts bytes before the first DHT marker (after SOF): libjpeg warns about extraneous data. */
function withExtraneousBytes(jpeg: Uint8Array): Uint8Array {
  const at = jpeg.findIndex((value, i) => value === 0xff && jpeg[i + 1] === 0xc4);
  expect(at).toBeGreaterThan(2);
  const out = new Uint8Array(jpeg.length + 3);
  out.set(jpeg.subarray(0, at), 0);
  out.set([1, 2, 3], at);
  out.set(jpeg.subarray(at), at + 3);
  return out;
}

// Sample points inside each region of blocks(): red rows 0-27, blue rows 29-42, white rows 44-47.
const BLOCK_SAMPLES: readonly (readonly [number, number, Rgba])[] = [
  [32, 10, [220, 40, 40, 255]],
  [32, 36, [30, 60, 200, 255]],
  [32, 46, [245, 245, 245, 255]],
];

describe("supported formats", () => {
  test.each(["blocks.png", "blocks.webp", "blocks.avif"] as const)(
    "%s (lossless) is exact",
    async (name) => {
      const pixels = await decodeFixture(name);
      expect(pixels.width).toBe(64);
      expect(pixels.height).toBe(48);
      expect([...pixels.data]).toEqual([...blocks().data]);
    },
  );

  test("blocks.jpg decodes to the source colors", async () => {
    const pixels = await decodeFixture("blocks.jpg");
    expect([pixels.width, pixels.height]).toEqual([64, 48]);
    for (const [x, y, color] of BLOCK_SAMPLES) {
      expectClose(pixelAt(pixels, x, y), color, 4);
    }
  });

  test.each([
    ["lossy WebP", (image: Sharp) => image.webp({ quality: 90 })],
    ["lossy AVIF", (image: Sharp) => image.avif({ quality: 90 })],
  ] as const)("%s decodes to the source colors", async (_label, encode) => {
    const source = blocks();
    const raw = sharp(source.data, { raw: { width: 64, height: 48, channels: 4 } });
    const bytes = new Uint8Array(await encode(raw).toBuffer());
    const pixels = await decodeImage(bytes, LIMITS, undefined);
    expect([pixels.width, pixels.height]).toEqual([64, 48]);
    for (const [x, y, color] of BLOCK_SAMPLES) {
      expectClose(pixelAt(pixels, x, y), color, 6);
    }
  });

  test("the result is valid pixel input of 8-bit RGBA", async () => {
    const pixels = await decodeFixture("blocks.jpg");
    expect(validatePixels(pixels)).toEqual(pixels);
    expect(pixels.data).toBeInstanceOf(Uint8Array);
    expect(pixels.data.length).toBe(64 * 48 * 4);
  });
});

describe("alpha", () => {
  test("rgba.png is exact, with alpha 1 and 128 kept and not premultiplied", async () => {
    const pixels = await decodeFixture("rgba.png");
    expect([pixels.width, pixels.height]).toEqual([4, 2]);
    expect([...pixels.data]).toEqual([...rgbaSample().data]);
    expect(pixelAt(pixels, 2, 0)).toEqual([40, 160, 60, 128]);
    expect(pixelAt(pixels, 2, 1)).toEqual([30, 60, 200, 1]);
  });

  test.each([
    ["lossless WebP", (image: Sharp) => image.webp({ lossless: true })],
    ["lossless AVIF", (image: Sharp) => image.avif({ lossless: true })],
  ] as const)("%s with alpha is exact", async (_label, encode) => {
    const source = rgbaSample();
    const raw = sharp(source.data, { raw: { width: 4, height: 2, channels: 4 } });
    const pixels = await decodeImage(
      new Uint8Array(await encode(raw).toBuffer()),
      LIMITS,
      undefined,
    );
    expect([...pixels.data]).toEqual([...source.data]);
  });

  test("opaque images get alpha 255", async () => {
    const pixels = await decodeFixture("blocks.jpg");
    for (let i = 3; i < pixels.data.length; i += 4) {
      expect(pixels.data[i]).toBe(255);
    }
  });
});

/** Where a stored pixel (x, y) of a w×h image appears after applying EXIF orientation 1-8. */
function oriented(orientation: number, x: number, y: number, w: number, h: number) {
  switch (orientation) {
    case 2:
      return [w - 1 - x, y];
    case 3:
      return [w - 1 - x, h - 1 - y];
    case 4:
      return [x, h - 1 - y];
    case 5:
      return [y, x];
    case 6:
      return [h - 1 - y, x];
    case 7:
      return [h - 1 - y, w - 1 - x];
    case 8:
      return [y, w - 1 - x];
    default:
      return [x, y];
  }
}

describe("EXIF orientation", () => {
  test("orientation-6.jpg is 20×40 with red at the top", async () => {
    const pixels = await decodeFixture("orientation-6.jpg");
    expect([pixels.width, pixels.height]).toEqual([20, 40]);
    expectClose(pixelAt(pixels, 10, 5), [255, 0, 0, 255], 2);
    expectClose(pixelAt(pixels, 10, 34), [0, 0, 255, 255], 2);
  });

  test("orientation-3.jpg is flipped: blue on the left, red on the right", async () => {
    const pixels = await decodeFixture("orientation-3.jpg");
    expect([pixels.width, pixels.height]).toEqual([40, 20]);
    expectClose(pixelAt(pixels, 5, 10), [0, 0, 255, 255], 2);
    expectClose(pixelAt(pixels, 34, 10), [255, 0, 0, 255], 2);
  });

  // A 48×24 blue image with a red 16×8 mark in its stored top-left corner.
  const W = 48;
  const H = 24;
  const marked = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      marked.set(x < 16 && y < 8 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * W + x) * 4);
    }
  }

  test.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "orientation %i moves the mark where the oriented image puts it",
    async (orientation) => {
      const jpeg = await sharp(marked, { raw: { width: W, height: H, channels: 4 } })
        .removeAlpha()
        .jpeg({ quality: 95 })
        .withMetadata({ orientation })
        .toBuffer();
      const pixels = await decodeImage(new Uint8Array(jpeg), LIMITS, undefined);
      const turned = orientation >= 5;
      expect([pixels.width, pixels.height]).toEqual(turned ? [H, W] : [W, H]);
      const [markX = -1, markY = -1] = oriented(orientation, 4, 2, W, H);
      const [farX = -1, farY = -1] = oriented(orientation, W - 5, H - 3, W, H);
      expectClose(pixelAt(pixels, markX, markY), [255, 0, 0, 255], 8);
      expectClose(pixelAt(pixels, farX, farY), [0, 0, 255, 255], 8);
    },
  );
});

describe("color conversion to sRGB", () => {
  test("a CMYK JPEG with a profile is converted to sRGB", async () => {
    const pixels = await decodeFixture("cmyk.jpg");
    expect([pixels.width, pixels.height]).toEqual([16, 16]);
    expectClose(pixelAt(pixels, 8, 8), [...SOURCE, 255], 12);
  });

  test("a CMYK JPEG without a profile goes through sharp's built-in CMYK profile", async () => {
    const pixels = await decodeFixture("cmyk-no-profile.jpg");
    // Measured (201, 49, 0) with sharp 0.35.5: the round trip through the built-in profile moves the
    // darkest channel by 30, so the tolerance is wider than with an embedded profile (197, 54, 21).
    expectClose(pixelAt(pixels, 8, 8), [...SOURCE, 255], 40);
  });

  test("an embedded Display P3 profile is applied", async () => {
    const bytes = await encodeTestImage("p3.png");
    const pixels = await decodeImage(bytes, LIMITS, undefined);
    expectClose(pixelAt(pixels, 8, 8), [...SOURCE, 255], 1);
    const ignored = await sharp(bytes, { ignoreIcc: true })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer();
    // Measured (185, 71, 43) with sharp 0.35.5.
    const decoded = pixelAt(pixels, 8, 8);
    const differences = [...ignored.subarray(0, 3)].map((value, i) =>
      Math.abs(value - (decoded[i] ?? 0)),
    );
    expect(Math.max(...differences)).toBeGreaterThan(5);
  });

  test("gray PNG becomes 8-bit RGBA", async () => {
    const pixels = await decodeFixture("gray.png");
    expect(pixels.data.length).toBe(16 * 16 * 4);
    const [r, g, b, a] = pixelAt(pixels, 3, 3);
    expect(g).toBe(r);
    expect(b).toBe(r);
    expect(a).toBe(255);
  });

  test("gray PNG with alpha becomes 8-bit RGBA and keeps alpha", async () => {
    const pixels = await decodeFixture("gray-alpha.png");
    expect(pixels.data.length).toBe(4 * 2 * 4);
    const alphas = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => pixels.data[i * 4 + 3]);
    expect(alphas).toEqual([255, 255, 128, 128, 255, 255, 1, 1]);
    for (let i = 0; i < pixels.data.length; i += 4) {
      expect(pixels.data[i + 1]).toBe(pixels.data[i]);
      expect(pixels.data[i + 2]).toBe(pixels.data[i]);
    }
  });

  test("16-bit PNG becomes 8-bit RGBA", async () => {
    const pixels = await decodeFixture("rgb16.png");
    expect(pixels.data.length).toBe(16 * 16 * 4);
    expectClose(pixelAt(pixels, 8, 8), [...SOURCE, 255], 1);
  });

  test("palette PNG becomes 8-bit RGBA", async () => {
    const pixels = await decodeFixture("palette.png");
    expect(pixels.data.length).toBe(4 * 2 * 4);
    expectClose(pixelAt(pixels, 0, 0), [220, 40, 40, 255], 8);
    expect(pixelAt(pixels, 2, 0)[3]).toBe(128);
  });
});

describe("rejected inputs", () => {
  /** blocks.avif with its major brand changed to "avis", the brand of AVIF image sequences. */
  async function avifSequence(): Promise<Uint8Array> {
    const bytes = (await encodeTestImage("blocks.avif")).slice();
    bytes.set([0x61, 0x76, 0x69, 0x73], 8);
    return bytes;
  }

  test.each([
    ["animated.webp", () => encodeTestImage("animated.webp")],
    ["animated.png (APNG)", () => encodeTestImage("animated.png")],
    ["an AVIF with the sequence brand (avis)", avifSequence],
  ] as const)("%s is UNSUPPORTED_FORMAT before sharp loads", async (_label, bytes) => {
    const load = unusedLoader();
    const error = await rejection(decodeImage(await bytes(), LIMITS, undefined, load));
    expect(error).toMatchObject({ code: "UNSUPPORTED_FORMAT", message: ANIMATED });
    expect(load).not.toHaveBeenCalled();
  });

  test.each([
    "animated.gif",
    "static.gif",
    "image.tiff",
    "image.svg",
    "heic-brand.bin",
    "garbage.bin",
  ] as const)("%s is UNSUPPORTED_FORMAT before sharp loads", async (name) => {
    const load = unusedLoader();
    const error = await rejection(
      decodeImage(await encodeTestImage(name), LIMITS, undefined, load),
    );
    expect(error).toMatchObject({ code: "UNSUPPORTED_FORMAT", message: UNSUPPORTED });
    expect(load).not.toHaveBeenCalled();
  });

  test("empty.bin is DECODE_FAILED before sharp loads", async () => {
    const load = unusedLoader();
    const error = await rejection(
      decodeImage(await encodeTestImage("empty.bin"), LIMITS, undefined, load),
    );
    expect(error).toMatchObject({ code: "DECODE_FAILED", message: "The image data is empty." });
    expect(load).not.toHaveBeenCalled();
  });

  test.each(["truncated.jpg", "corrupt.png"] as const)(
    "%s is DECODE_FAILED with the cause",
    async (name) => {
      const error = await rejection(decodeFixture(name));
      expect(error).toMatchObject({
        code: "DECODE_FAILED",
        message: "The image could not be decoded.",
      });
      expect(error.cause).toBeInstanceOf(Error);
    },
  );

  test.each([
    [
      "an animated WebP without its animation flag",
      async () => {
        const bytes = (await encodeTestImage("animated.webp")).slice();
        bytes[20] = (bytes[20] ?? 0) & ~0x02;
        return bytes;
      },
    ],
    [
      "a JPEG that ends after its header",
      async () => (await encodeTestImage("blocks.jpg")).subarray(0, 20),
    ],
  ] as const)("%s passes the header check and is DECODE_FAILED", async (_label, bytes) => {
    const error = await rejection(decodeImage(await bytes(), LIMITS, undefined));
    expect(error).toMatchObject({
      code: "DECODE_FAILED",
      message: "The image could not be decoded.",
    });
    expect(error.cause).toBeInstanceOf(Error);
  });

  test("a JPEG with a decoder warning still decodes (failOn: error)", async () => {
    const bytes = withExtraneousBytes(await encodeTestImage("blocks.jpg"));
    await expect(sharp(bytes).raw().toBuffer()).rejects.toThrow(/extraneous bytes/);
    const pixels = await decodeImage(bytes, LIMITS, undefined);
    expectClose(pixelAt(pixels, 32, 10), [220, 40, 40, 255], 4);
  });

  test.each([
    ["HEIC", { format: "heif", compression: "hevc" }],
    ["GIF", { format: "gif" }],
    ["TIFF", { format: "tiff" }],
    ["SVG", { format: "svg" }],
  ] as const)("a format sharp reports as %s is UNSUPPORTED_FORMAT", async (_label, patch) => {
    const { load } = wrappedSharp({
      metadata: async (real) => ({ ...(await real()), ...patch }) as Metadata,
    });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.avif"), LIMITS, undefined, load),
    );
    expect(error).toMatchObject({ code: "UNSUPPORTED_FORMAT", message: UNSUPPORTED });
  });

  test("AVIF is accepted as HEIF compressed with AV1", async () => {
    const { load } = wrappedSharp({
      metadata: async (real) => {
        const metadata = await real();
        expect(metadata).toMatchObject({ format: "heif", compression: "av1" });
        return metadata;
      },
    });
    const pixels = await decodeImage(await encodeTestImage("blocks.avif"), LIMITS, undefined, load);
    expect(pixels.width).toBe(64);
  });

  test("more than one page in sharp's metadata is UNSUPPORTED_FORMAT", async () => {
    const toBuffer = vi.fn((real: () => Promise<Decoded>) => real());
    const { load } = wrappedSharp({
      metadata: async (real) => ({ ...(await real()), pages: 3 }),
      toBuffer,
    });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.webp"), LIMITS, undefined, load),
    );
    expect(error).toMatchObject({ code: "UNSUPPORTED_FORMAT", message: ANIMATED });
    expect(toBuffer).not.toHaveBeenCalled();
  });
});

describe("pixel limit", () => {
  test("large-header.png is INPUT_TOO_LARGE before sharp loads", async () => {
    const load = unusedLoader();
    const error = await rejection(
      decodeImage(await encodeTestImage("large-header.png"), LIMITS, undefined, load),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(load).not.toHaveBeenCalled();
  });

  test("a limit one below the size is INPUT_TOO_LARGE; the exact size decodes", async () => {
    const bytes = await encodeTestImage("blocks.png");
    const load = unusedLoader();
    const error = await rejection(
      decodeImage(bytes, { ...LIMITS, maxPixels: 64 * 48 - 1 }, undefined, load),
    );
    expect(error).toMatchObject({
      code: "INPUT_TOO_LARGE",
      message: "Image has 3072 pixels, which exceeds the limit of 3071.",
    });
    expect(load).not.toHaveBeenCalled();
    const pixels = await decodeImage(bytes, { ...LIMITS, maxPixels: 64 * 48 }, undefined);
    expect(pixels.width).toBe(64);
  });

  test("a size known only from sharp's metadata is checked before decoding", async () => {
    const toBuffer = vi.fn((real: () => Promise<Decoded>) => real());
    const { load } = wrappedSharp({
      metadata: async (real) => ({ ...(await real()), width: 5000, height: 5000 }),
      toBuffer,
    });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, undefined, load),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(toBuffer).not.toHaveBeenCalled();
  });

  test("sharp's own pixel-limit error while decoding is INPUT_TOO_LARGE", async () => {
    const cause = new Error("Input image exceeds pixel limit");
    const { load } = wrappedSharp({ toBuffer: () => Promise.reject(cause) });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, undefined, load),
    );
    expect(error).toMatchObject({ code: "INPUT_TOO_LARGE", cause });
    expect(error.message).toContain("16777216");
  });

  test("sharp gets the documented options", async () => {
    const { calls, load } = wrappedSharp();
    await decodeImage(
      await encodeTestImage("blocks.png"),
      { ...LIMITS, maxPixels: 5000 },
      undefined,
      load,
    );
    expect(calls).toEqual([
      { limitInputPixels: false },
      { autoOrient: true, failOn: "error", limitInputPixels: 5000, pages: 1 },
    ]);
  });
});

describe("unexpected decoder output", () => {
  test.each([
    ["premultiplied pixels", (decoded: Decoded) => ({ ...decoded.info, premultiplied: true })],
    ["three channels", (decoded: Decoded) => ({ ...decoded.info, channels: 3 as const })],
    ["a wrong size", (decoded: Decoded) => ({ ...decoded.info, width: decoded.info.width + 1 })],
  ] as const)("%s is PROCESSING_FAILED", async (_label, change) => {
    const { load } = wrappedSharp({
      toBuffer: async (real) => {
        const decoded = await real();
        return { data: decoded.data, info: change(decoded) };
      },
    });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, undefined, load),
    );
    expect(error.code).toBe("PROCESSING_FAILED");
  });
});

describe("decoder missing", () => {
  const notFound = Object.assign(new Error("Cannot find package 'sharp' imported from /app/x.js"), {
    code: "ERR_MODULE_NOT_FOUND",
  });

  test("a supported image without sharp is DECODER_MISSING with the installation message", async () => {
    const load = createSharpLoader(() => Promise.reject(notFound));
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, undefined, load),
    );
    expect(error.code).toBe("DECODER_MISSING");
    expect(error.message).toMatch(
      /^Decoding images in Node\.js needs the optional package "sharp"/,
    );
    expect(error.message).toContain('"npm install sharp", "pnpm add sharp", or "yarn add sharp"');
    expect(error.cause).toBe(notFound);
  });

  test("header errors come before DECODER_MISSING", async () => {
    const load = createSharpLoader(() => Promise.reject(notFound));
    await expect(
      decodeImage(await encodeTestImage("static.gif"), LIMITS, undefined, load),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    await expect(
      decodeImage(await encodeTestImage("large-header.png"), LIMITS, undefined, load),
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });
});

describe("abort", () => {
  test("a pre-aborted call is ABORTED and never loads sharp", async () => {
    const controller = new AbortController();
    controller.abort("stop");
    const load = unusedLoader();
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, controller.signal, load),
    );
    expect(error).toMatchObject({ code: "ABORTED", cause: "stop" });
    expect(load).not.toHaveBeenCalled();
  });

  test("an abort while sharp loads is ABORTED", async () => {
    const controller = new AbortController();
    let finish!: (value: SharpFunction) => void;
    const load = vi.fn(() => new Promise<SharpFunction>((resolve) => (finish = resolve)));
    const pending = decodeImage(
      await encodeTestImage("blocks.png"),
      LIMITS,
      controller.signal,
      load,
    );
    const reason = new Error("why");
    controller.abort(reason);
    const error = await rejection(pending);
    expect(error).toMatchObject({ code: "ABORTED", cause: reason });
    expect(load).toHaveBeenCalledOnce();
    finish(sharp);
  });

  test("an abort while reading the metadata is ABORTED", async () => {
    const controller = new AbortController();
    const { load } = wrappedSharp({
      metadata: () => {
        // Abort once decodeImage is waiting on the metadata, which never arrives.
        queueMicrotask(() => controller.abort("metadata"));
        return new Promise<Metadata>(() => {});
      },
    });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, controller.signal, load),
    );
    expect(error).toMatchObject({ code: "ABORTED", cause: "metadata" });
  });

  test("an abort while decoding is ABORTED, and the late pixels are discarded", async () => {
    const controller = new AbortController();
    const late = vi.fn();
    const { load } = wrappedSharp({
      toBuffer: (real) => {
        const decoding = real();
        void decoding.then(late);
        // Abort once decodeImage is waiting on sharp, before sharp can finish.
        queueMicrotask(() => controller.abort("decode"));
        return decoding;
      },
    });
    const error = await rejection(
      decodeImage(await encodeTestImage("blocks.png"), LIMITS, controller.signal, load),
    );
    expect(error).toMatchObject({ code: "ABORTED", cause: "decode" });
    await vi.waitFor(() => expect(late).toHaveBeenCalled());
  });
});

describe("input bytes", () => {
  test("are not mutated", async () => {
    const original = await encodeTestImage("orientation-6.jpg");
    const bytes = original.slice();
    await decodeImage(bytes, LIMITS, undefined);
    expect(bytes).toEqual(original);
  });

  test("a view with an offset decodes like the whole buffer", async () => {
    const png = await encodeTestImage("rgba.png");
    const padded = new Uint8Array(png.length + 10);
    padded.set(png, 7);
    const pixels = await decodeImage(padded.subarray(7, 7 + png.length), LIMITS, undefined);
    expect([...pixels.data]).toEqual([...rgbaSample().data]);
  });
});
