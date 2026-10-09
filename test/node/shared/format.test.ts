import sharp from "sharp";
import { describe, expect, test } from "vite-plus/test";
import type { ResolvedLimits } from "@/core/validate.js";
import { inspectImage, sniffImage, type ImageHeader } from "@/shared/format.js";
import { encodeTestImage, TEST_IMAGE_NAMES, type TestImageName } from "../../support/images.js";
import { blocks } from "../../support/pixels.js";

const LIMITS: ResolvedLimits = { maxBytes: 33_554_432, maxPixels: 16_777_216 };

const EXPECTED: Record<TestImageName, ImageHeader> = {
  "rgba.png": { format: "png", animated: false, width: 4, height: 2 },
  "blocks.png": { format: "png", animated: false, width: 64, height: 48 },
  "blocks.jpg": { format: "jpeg", animated: false, width: 64, height: 48 },
  "blocks.webp": { format: "webp", animated: false, width: 64, height: 48 },
  "blocks.avif": { format: "avif", animated: false, width: 64, height: 48 },
  "orientation-6.jpg": { format: "jpeg", animated: false, width: 40, height: 20 },
  "orientation-3.jpg": { format: "jpeg", animated: false, width: 40, height: 20 },
  "cmyk.jpg": { format: "jpeg", animated: false, width: 16, height: 16 },
  "cmyk-no-profile.jpg": { format: "jpeg", animated: false, width: 16, height: 16 },
  "p3.png": { format: "png", animated: false, width: 16, height: 16 },
  "gray.png": { format: "png", animated: false, width: 16, height: 16 },
  "gray-alpha.png": { format: "png", animated: false, width: 4, height: 2 },
  "rgb16.png": { format: "png", animated: false, width: 16, height: 16 },
  "palette.png": { format: "png", animated: false, width: 4, height: 2 },
  "animated.webp": { format: "webp", animated: true, width: 4, height: 2 },
  "animated.png": { format: "png", animated: true, width: 2, height: 1 },
  "animated.gif": { format: null, animated: false, width: 0, height: 0 },
  "static.gif": { format: null, animated: false, width: 0, height: 0 },
  "image.tiff": { format: null, animated: false, width: 0, height: 0 },
  "image.svg": { format: null, animated: false, width: 0, height: 0 },
  "heic-brand.bin": { format: null, animated: false, width: 0, height: 0 },
  "truncated.jpg": { format: "jpeg", animated: false, width: 64, height: 48 },
  "corrupt.png": { format: "png", animated: false, width: 8, height: 8 },
  "garbage.bin": { format: null, animated: false, width: 0, height: 0 },
  "empty.bin": { format: null, animated: false, width: 0, height: 0 },
  "large-header.png": { format: "png", animated: false, width: 5000, height: 5000 },
};

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function ascii(text: string): number[] {
  return Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
}

function box(type: string, payload: readonly number[]): number[] {
  return [...u32(8 + payload.length), ...ascii(type), ...payload];
}

function avifBytes(brand: string, sizes: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const ispes = sizes.flatMap(([w, h]) => box("ispe", [0, 0, 0, 0, ...u32(w), ...u32(h)]));
  const meta = box("meta", [0, 0, 0, 0, ...box("iprp", box("ipco", ispes))]);
  return Uint8Array.from([
    ...box("ftyp", [...ascii(brand), 0, 0, 0, 0, ...ascii("mif1")]),
    ...meta,
  ]);
}

test("covers every fixture name", () => {
  expect(Object.keys(EXPECTED).sort()).toEqual([...TEST_IMAGE_NAMES].sort());
});

describe("sniffImage", () => {
  test.each(TEST_IMAGE_NAMES)("%s", async (name) => {
    expect(sniffImage(await encodeTestImage(name))).toEqual(EXPECTED[name]);
  });

  test("reads lossy WebP (VP8) and WebP with a profile (VP8X)", async () => {
    const source = sharp(blocks().data, { raw: { width: 64, height: 48, channels: 4 } });
    const lossy = new Uint8Array(await source.clone().webp({ quality: 80 }).toBuffer());
    expect(String.fromCharCode(...lossy.subarray(12, 16))).toBe("VP8 ");
    expect(sniffImage(lossy)).toEqual({ format: "webp", animated: false, width: 64, height: 48 });
    const withProfile = new Uint8Array(
      await source.clone().withIccProfile("p3").webp({ lossless: true }).toBuffer(),
    );
    expect(String.fromCharCode(...withProfile.subarray(12, 16))).toBe("VP8X");
    expect(sniffImage(withProfile)).toEqual({
      format: "webp",
      animated: false,
      width: 64,
      height: 48,
    });
  });

  test("reads lossy AVIF", async () => {
    const avif = new Uint8Array(
      await sharp(blocks().data, { raw: { width: 64, height: 48, channels: 4 } })
        .avif({ quality: 50 })
        .toBuffer(),
    );
    expect(sniffImage(avif)).toEqual({ format: "avif", animated: false, width: 64, height: 48 });
  });

  test("detects the avis brand and uses the largest ispe", () => {
    expect(
      sniffImage(
        avifBytes("avis", [
          [8, 8],
          [40, 30],
          [10, 10],
        ]),
      ),
    ).toEqual({
      format: "avif",
      animated: true,
      width: 40,
      height: 30,
    });
    expect(sniffImage(avifBytes("avif", [[8, 8]])).animated).toBe(false);
  });

  test("accepts avif as a compatible brand and rejects HEIC-only brands", () => {
    const compatible = Uint8Array.from(
      box("ftyp", [...ascii("mif1"), 0, 0, 0, 0, ...ascii("avif")]),
    );
    expect(sniffImage(compatible).format).toBe("avif");
    const heic = Uint8Array.from(box("ftyp", [...ascii("heic"), 0, 0, 0, 0, ...ascii("mif1")]));
    expect(sniffImage(heic).format).toBeNull();
  });

  test("supports 64-bit and run-to-end box sizes", () => {
    const ispe = box("ispe", [0, 0, 0, 0, ...u32(12), ...u32(7)]);
    const ipco = box("ipco", ispe);
    const iprp = box("iprp", ipco);
    // meta with a 64-bit size
    const metaPayload = [0, 0, 0, 0, ...iprp];
    const meta64 = [
      ...u32(1),
      ...ascii("meta"),
      0,
      0,
      0,
      0,
      ...u32(16 + metaPayload.length),
      ...metaPayload,
    ];
    const ftyp = box("ftyp", [...ascii("avif"), 0, 0, 0, 0]);
    expect(sniffImage(Uint8Array.from([...ftyp, ...meta64]))).toMatchObject({
      width: 12,
      height: 7,
    });
    // meta with size 0 (to the end of the data)
    const metaToEnd = [...u32(0), ...ascii("meta"), ...metaPayload];
    expect(sniffImage(Uint8Array.from([...ftyp, ...metaToEnd]))).toMatchObject({
      width: 12,
      height: 7,
    });
  });

  test("keeps the format and reports no size on inconsistent data", async () => {
    const png = await encodeTestImage("blocks.png");
    expect(sniffImage(png.subarray(0, 30))).toEqual({
      format: "png",
      animated: false,
      width: 0,
      height: 0,
    });
    const jpeg = await encodeTestImage("blocks.jpg");
    expect(sniffImage(jpeg.subarray(0, 10))).toEqual({
      format: "jpeg",
      animated: false,
      width: 0,
      height: 0,
    });
    const avif = await encodeTestImage("blocks.avif");
    expect(sniffImage(avif.subarray(0, 40))).toMatchObject({ format: "avif", width: 0, height: 0 });
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff]))).toMatchObject({
      format: "jpeg",
      width: 0,
    });
  });

  test("never throws on truncated fixtures", async () => {
    for (const name of TEST_IMAGE_NAMES) {
      const bytes = await encodeTestImage(name);
      for (let length = 0; length <= Math.min(64, bytes.length); length++) {
        expect(() => sniffImage(bytes.subarray(0, length))).not.toThrow();
      }
    }
  });

  test("never throws on 10,000 seeded random buffers", async () => {
    const random = mulberry32(0xc0ffee);
    const seeds = await Promise.all(
      TEST_IMAGE_NAMES.map(async (name) => (await encodeTestImage(name)).slice(0, 96)),
    );
    for (let i = 0; i < 10_000; i++) {
      const length = Math.floor(random() * 96);
      let bytes: Uint8Array;
      if (i % 2 === 0) {
        bytes = Uint8Array.from({ length }, () => Math.floor(random() * 256));
      } else {
        // Start from a real header and corrupt a few bytes, to reach the deeper branches.
        bytes = (seeds[Math.floor(random() * seeds.length)] ?? new Uint8Array(0)).slice();
        for (let k = 0; k < 4 && bytes.length > 0; k++) {
          bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
        }
      }
      const header = sniffImage(bytes);
      expect(header.width).toBeGreaterThanOrEqual(0);
      expect(header.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("inspectImage", () => {
  test("returns the header of a supported image", async () => {
    expect(inspectImage(await encodeTestImage("blocks.jpg"), LIMITS, "reject")).toEqual(
      EXPECTED["blocks.jpg"],
    );
  });

  test("empty data is DECODE_FAILED", () => {
    expect(() => inspectImage(new Uint8Array(0), LIMITS, "reject")).toThrowError(
      expect.objectContaining({ code: "DECODE_FAILED", message: "The image data is empty." }),
    );
  });

  test.each([
    "animated.gif",
    "static.gif",
    "image.tiff",
    "image.svg",
    "heic-brand.bin",
    "garbage.bin",
  ] as const)("%s is UNSUPPORTED_FORMAT", async (name) => {
    const bytes = await encodeTestImage(name);
    expect(() => inspectImage(bytes, LIMITS, "reject")).toThrowError(
      expect.objectContaining({
        code: "UNSUPPORTED_FORMAT",
        message: "Unsupported image format. Supported formats are JPEG, PNG, WebP, and AVIF.",
      }),
    );
  });

  test.each(["animated.webp", "animated.png"] as const)(
    "%s: reject versus first-frame",
    async (name) => {
      const bytes = await encodeTestImage(name);
      expect(() => inspectImage(bytes, LIMITS, "reject")).toThrowError(
        expect.objectContaining({
          code: "UNSUPPORTED_FORMAT",
          message: expect.stringMatching(/^Animated images are not supported in Node\.js\./),
        }),
      );
      expect(inspectImage(bytes, LIMITS, "first-frame")).toMatchObject({ animated: true });
    },
  );

  test("large-header.png is INPUT_TOO_LARGE before any decoder", async () => {
    const bytes = await encodeTestImage("large-header.png");
    expect(() => inspectImage(bytes, LIMITS, "reject")).toThrowError(
      expect.objectContaining({ code: "INPUT_TOO_LARGE" }),
    );
    expect(inspectImage(bytes, { ...LIMITS, maxPixels: 25_000_000 }, "reject").width).toBe(5000);
  });

  test("an unknown size skips the pixel limit", async () => {
    const png = (await encodeTestImage("blocks.png")).subarray(0, 30);
    expect(inspectImage(png, { ...LIMITS, maxPixels: 1 }, "reject").format).toBe("png");
  });
});
