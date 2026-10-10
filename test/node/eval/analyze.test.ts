import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { extractColors } from "@/node/index.js";
import {
  decodeEvalImage,
  decoderVersions,
  encodeDisplayPng,
  extractEvalColors,
  pixelAt,
} from "../../../eval/lib/analyze.js";
import { createEvalFixture, type EvalFixture } from "../../support/eval-fixture.js";

let fixture: EvalFixture;

beforeAll(async () => {
  fixture = await createEvalFixture();
});
afterAll(async () => {
  await fixture.cleanup();
});

const read = (name: keyof EvalFixture["images"]) => {
  const { set, relativePath } = fixture.images[name];
  return readFile(join(fixture.evalDir, set, relativePath));
};

describe("results equal extractColors(bytes)", () => {
  test.each([
    ["PNG", "orange"],
    ["lossless WebP", "test-a"],
    ["JPEG", "jpeg"],
    ["noisy JPEG", "dark"],
    ["PNG with alpha", "alpha"],
  ] as const)("%s", async (_label, name) => {
    const bytes = await read(name);
    const image = await decodeEvalImage(bytes);
    expect(image.width).toBe(64);
    expect(image.height).toBe(48);
    for (const mode of ["perceptual", "population"] as const) {
      expect(extractEvalColors(image, mode, 5)).toEqual(
        await extractColors(bytes, { mode, count: 5 }),
      );
    }
  });

  test("the count is passed through", async () => {
    const image = await decodeEvalImage(await read("orange"));
    expect(extractEvalColors(image, "population", 2).colors).toHaveLength(2);
    expect(extractEvalColors(image, "population", 2).meta.count).toBe(2);
  });
});

describe("pixelAt", () => {
  test("reads exact pixels, including the corners", async () => {
    const image = await decodeEvalImage(await read("orange"));
    expect(pixelAt(image, 0, 0)).toEqual({ hex: "#d9822b", alpha: 255 });
    expect(pixelAt(image, 63, 47)).toEqual({ hex: "#f5f5f5", alpha: 255 });
    expect(pixelAt(image, 50, 29)).toEqual({ hex: "#28aab4", alpha: 255 });
  });

  test("keeps the non-premultiplied RGB of an alpha-128 pixel", async () => {
    const image = await decodeEvalImage(await read("alpha"));
    expect(pixelAt(image, 30, 10)).toEqual({ hex: "#1ea03c", alpha: 128 });
    expect(pixelAt(image, 50, 10)).toEqual({ hex: "#1e3cc8", alpha: 255 });
    expect(pixelAt(image, 5, 10).alpha).toBe(0);
  });

  test("throws outside the image or for a fractional position", async () => {
    const image = await decodeEvalImage(await read("orange"));
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [64, 0],
      [0, 48],
      [1.5, 0],
      [Number.NaN, 0],
    ] as const) {
      expect(() => pixelAt(image, x, y), `${x},${y}`).toThrow(RangeError);
    }
  });
});

describe("encodeDisplayPng", () => {
  test("decodes again to identical RGBA, including semi-transparent pixels", async () => {
    for (const name of ["alpha", "dark", "orange"] as const) {
      const image = await decodeEvalImage(await read(name));
      const png = await encodeDisplayPng(image);
      const again = await decodeEvalImage(png);
      expect(again.width).toBe(image.width);
      expect(again.height).toBe(image.height);
      expect(Buffer.from(again.data).equals(Buffer.from(image.data)), name).toBe(true);
    }
  });

  test("holds only IHDR, pHYs, IDAT, and IEND chunks", async () => {
    const png = Buffer.from(await encodeDisplayPng(await decodeEvalImage(await read("jpeg"))));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks: string[] = [];
    for (let offset = 8; offset < png.length;) {
      chunks.push(png.toString("latin1", offset + 4, offset + 8));
      offset += 12 + png.readUInt32BE(offset);
    }
    expect([...new Set(chunks)]).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  });
});

describe("errors keep their codes", () => {
  async function codeOf(bytes: Uint8Array): Promise<string> {
    try {
      await decodeEvalImage(bytes);
    } catch (error) {
      expect(error).toBeInstanceOf(ColorExtractorError);
      return (error as ColorExtractorError).code;
    }
    throw new Error("Expected a failure.");
  }

  test("garbage is UNSUPPORTED_FORMAT", async () => {
    expect(await codeOf(new TextEncoder().encode("this is not an image"))).toBe(
      "UNSUPPORTED_FORMAT",
    );
  });

  test("a truncated image is a decode failure", async () => {
    const bytes = await read("jpeg");
    expect(await codeOf(bytes.subarray(0, 40))).toMatch(/^(DECODE_FAILED|UNSUPPORTED_FORMAT)$/);
  });

  test("more bytes than the default limit is INPUT_TOO_LARGE", async () => {
    expect(await codeOf(new Uint8Array(33_554_433))).toBe("INPUT_TOO_LARGE");
  });
});

test("decoderVersions reports sharp and libvips", async () => {
  const versions = await decoderVersions();
  expect(versions.sharp).toMatch(/^\d+\.\d+\.\d+/);
  expect(versions.libvips).toMatch(/^\d+\.\d+\.\d+/);
});
