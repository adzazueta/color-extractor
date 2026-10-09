import { describe, expect, it } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { extractColorsFromPixels } from "@/core/index.js";
import type { ExtractedColor, PixelInput } from "@/core/types.js";
import {
  colorBlocks,
  colorNoise,
  coverImage,
  createImage,
  grayGradient,
  grayNoise,
  linearGradient,
  manyCells,
  solidImage,
  transparencyMix,
  type Rgba,
} from "./images.js";

// One group of tests per core item of section 7.1 of the specification.

function thrown(action: () => unknown): ColorExtractorError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError);
    return error as ColorExtractorError;
  }
  throw new Error("Expected the call to throw.");
}

function pixelAt(pixels: PixelInput, x: number, y: number): number[] {
  const offset = (y * pixels.width + x) * 4;
  return Array.from(pixels.data.subarray(offset, offset + 4));
}

/** Images with different structure, including noisy ones. */
function sampleImages(): [string, PixelInput][] {
  return [
    ["horizontal gradient", linearGradient(96, 24, [200, 20, 30], [10, 90, 240])],
    ["gray gradient", grayGradient(128, 8)],
    ["color blocks", colorBlocks(90, 60, 3, 2)],
    ["cover", coverImage(120, 160, 11)],
    ["color noise", colorNoise(64, 64, 22)],
    ["gray noise", grayNoise(64, 64, 33)],
    ["transparency mix", transparencyMix(80, 60, 44)],
    ["many cells", manyCells(144, 144, 55)],
  ];
}

describe("spec 7.1: a single-color image", () => {
  const colors: [string, Rgba][] = [
    ["black", [0, 0, 0, 255]],
    ["white", [255, 255, 255, 255]],
    ["red", [255, 0, 0, 255]],
    ["an arbitrary color", [17, 99, 203, 255]],
    ["a semi-transparent color", [200, 100, 50, 128]],
    ["a nearly transparent color", [30, 60, 90, 1]],
  ];
  it.each(colors)("returns %s with coverage 1", (_name, rgba) => {
    const result = extractColorsFromPixels(solidImage(7, 5, rgba));
    expect(result.colors).toHaveLength(1);
    const [color] = result.colors;
    expect(color!.rgba).toEqual([...rgba]);
    expect(color!.coverage).toBe(1);
    expect(color!.score).toBe(1);
    expect(color!.rank).toBe(1);
    expect(pixelAt(solidImage(7, 5, rgba), color!.position.x, color!.position.y)).toEqual([
      ...rgba,
    ]);
  });

  it("returns one color for a 1 x 1 image", () => {
    const result = extractColorsFromPixels(solidImage(1, 1, [5, 6, 7, 255]), { count: 16 });
    expect(result.colors.map((c) => c.hex)).toEqual(["#050607"]);
    expect(result.colors[0]!.position).toEqual({ x: 0, y: 0 });
  });
});

describe("spec 7.1: a fully transparent image", () => {
  it.each([
    ["black", [0, 0, 0, 0]],
    ["colored", [123, 45, 67, 0]],
  ] as [string, Rgba][])("returns an empty list (%s pixels)", (_name, rgba) => {
    for (const mode of ["perceptual", "population"] as const) {
      const result = extractColorsFromPixels(solidImage(9, 4, rgba), { mode, count: 10 });
      expect(result.colors).toEqual([]);
      expect(result.schemaVersion).toBe(1);
      expect(result.meta.width).toBe(9);
      expect(result.meta.height).toBe(4);
      expect(result.meta.mode).toBe(mode);
    }
  });
});

describe("spec 7.1: transparent pixels do not influence the result", () => {
  /** The same visible pixels, with `fill` as the RGB under every alpha-0 pixel. */
  function withHiddenColors(
    visible: (x: number, y: number) => Rgba | null,
    fill: (x: number, y: number) => [number, number, number],
  ): PixelInput {
    return createImage(60, 40, (x, y) => {
      const pixel = visible(x, y);
      if (pixel) return pixel;
      const [r, g, b] = fill(x, y);
      return [r, g, b, 0];
    });
  }

  function visibleRegion(x: number): Rgba | null {
    if (x < 20) return [200, 30, 30, 255];
    if (x < 30) return [20, 180, 40, 255];
    if (x < 40) return [10, 20, 220, 160];
    return null;
  }

  it("gives an identical result whatever the RGB under alpha-0 pixels", () => {
    const fills = [
      () => [0, 0, 0] as [number, number, number],
      () => [255, 255, 255] as [number, number, number],
      (x: number, y: number) =>
        [(x * 7) % 256, (y * 11) % 256, (x * y) % 256] as [number, number, number],
    ];
    const results = fills.map((fill) =>
      extractColorsFromPixels(withHiddenColors(visibleRegion, fill), { count: 16 }),
    );
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0]!.colors).toHaveLength(3);
  });

  it("never returns a color that exists only under transparency", () => {
    // The hidden colors are strong, distinct, and cover half the image.
    const image = withHiddenColors(visibleRegion, (x) =>
      x % 2 === 0 ? [255, 0, 255] : [0, 255, 255],
    );
    const result = extractColorsFromPixels(image, { count: 16 });
    const hex = result.colors.map((c) => c.hex);
    expect(hex).not.toContain("#ff00ff");
    expect(hex).not.toContain("#00ffff");
    for (const color of result.colors) {
      expect(pixelAt(image, color.position.x, color.position.y)[3]).toBeGreaterThan(0);
    }
  });

  it("computes coverage over the visible pixels only", () => {
    const image = withHiddenColors(
      (x) => (x < 30 ? [10, 200, 10, 255] : null),
      () => [250, 10, 10],
    );
    const result = extractColorsFromPixels(image);
    expect(result.colors).toHaveLength(1);
    expect(result.colors[0]!.coverage).toBe(1);
  });

  it("keeps hidden noise out of a noisy image", () => {
    const hiddenA = transparencyMix(80, 60, 1);
    const hiddenB = transparencyMix(80, 60, 2);
    // transparencyMix draws different hidden RGB per seed and the same visible pixels.
    const a = extractColorsFromPixels(hiddenA, { count: 16 });
    const b = extractColorsFromPixels(hiddenB, { count: 16 });
    expect(b).toEqual(a);
  });
});

describe("spec 7.1: a grayscale image returns only grays", () => {
  it.each([
    ["gray gradient", grayGradient(256, 4)],
    ["gray noise", grayNoise(64, 64, 7)],
    ["gray gradient plus gray noise", mixedGray()],
  ] as [string, PixelInput][])("%s", (_name, image) => {
    for (const count of [1, 5, 16]) {
      const result = extractColorsFromPixels(image, { count });
      expect(result.colors.length).toBeGreaterThan(0);
      for (const { rgba, hex } of result.colors) {
        expect(rgba[0]).toBe(rgba[1]);
        expect(rgba[1]).toBe(rgba[2]);
        expect(hex).toMatch(/^#([0-9a-f]{2})\1\1$/);
      }
    }
  });

  function mixedGray(): PixelInput {
    const gradient = grayGradient(100, 100);
    const noise = grayNoise(100, 100, 99);
    const data = new Uint8Array(gradient.data.length);
    for (let i = 0; i < data.length; i += 4) {
      const v = (i / 4) % 3 === 0 ? noise.data[i]! : gradient.data[i]!;
      data.set([v, v, v, 255], i);
    }
    return { data, width: 100, height: 100 };
  }
});

describe("spec 7.1: every returned color matches the pixel at its position", () => {
  it.each(sampleImages())("%s", (_name, image) => {
    for (const count of [1, 5, 16]) {
      const result = extractColorsFromPixels(image, { count });
      expect(result.colors.length).toBeGreaterThan(0);
      for (const color of result.colors) {
        const { x, y } = color.position;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(image.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(image.height);
        expect(pixelAt(image, x, y)).toEqual(color.rgba);
      }
    }
  });
});

describe("spec 7.1: requesting fewer colors keeps the first ones", () => {
  const counts = [1, 3, 5, 10, 16];
  it.each(sampleImages())("%s", (_name, image) => {
    const results = counts.map((count) => extractColorsFromPixels(image, { count }).colors);
    for (let i = 0; i < counts.length; i++) {
      expect(results[i]!.length).toBeLessThanOrEqual(counts[i]!);
      for (let j = i + 1; j < counts.length; j++) {
        expect(results[j]!.slice(0, results[i]!.length)).toEqual(results[i]);
        // A smaller request is never shorter than what the larger one has up to its count.
        expect(results[i]!.length).toBe(Math.min(counts[i]!, results[j]!.length));
      }
    }
  });
});

describe("spec 7.1: changing the mode only changes the order", () => {
  function identity(color: ExtractedColor): string {
    return JSON.stringify([color.hex8, color.position, color.coverage]);
  }

  it.each([
    ["color blocks", colorBlocks(90, 60, 3, 2)],
    ["gradient", linearGradient(64, 8, [250, 0, 0], [0, 0, 250])],
    ["transparency mix", transparencyMix(40, 40, 3)],
  ] as [string, PixelInput][])("%s: same colors, any order", (_name, image) => {
    const population = extractColorsFromPixels(image, { mode: "population", count: 16 });
    const perceptual = extractColorsFromPixels(image, { mode: "perceptual", count: 16 });
    expect(population.meta.mode).toBe("population");
    expect(perceptual.meta.mode).toBe("perceptual");
    expect({ ...perceptual.meta, mode: "population" }).toEqual(population.meta);
    expect(perceptual.colors.map(identity).sort()).toEqual(population.colors.map(identity).sort());
    // Ranks are always 1..n in the returned order.
    expect(perceptual.colors.map((c) => c.rank)).toEqual(perceptual.colors.map((_, i) => i + 1));
  });

  it("population mode orders by coverage, descending", () => {
    const { colors } = extractColorsFromPixels(coverImage(120, 160, 5), {
      mode: "population",
      count: 16,
    });
    for (let i = 1; i < colors.length; i++) {
      expect(colors[i - 1]!.coverage).toBeGreaterThanOrEqual(colors[i]!.coverage);
    }
  });
});

describe("spec 7.1: invalid options or inputs and exceeded limits produce errors", () => {
  const pixels = solidImage(2, 2, [1, 2, 3, 255]);

  it.each([
    ["count 0", { count: 0 }],
    ["count 17", { count: 17 }],
    ["fractional count", { count: 2.5 }],
    ["string count", { count: "3" as never }],
    ["unknown mode", { mode: "fast" as never }],
    ["unknown option", { colors: 3 } as never],
    ["limits that is not an object", { limits: 5 as never }],
    ["non-positive limit", { limits: { maxPixels: 0 } }],
    ["unknown limit", { limits: { maxWidth: 10 } as never }],
  ])("INVALID_OPTIONS for %s", (_name, options) => {
    const error = thrown(() => extractColorsFromPixels(pixels, options));
    expect(error.code).toBe("INVALID_OPTIONS");
  });

  it.each([
    ["null", null],
    ["a number", 5],
    ["data of the wrong length", { data: new Uint8Array(3), width: 2, height: 2 }],
    ["data that is not a Uint8Array", { data: [1, 2, 3, 4], width: 1, height: 1 }],
    ["zero width", { data: new Uint8Array(0), width: 0, height: 2 }],
    ["fractional height", { data: new Uint8Array(8), width: 1, height: 1.5 }],
    ["negative width", { data: new Uint8Array(8), width: -1, height: 2 }],
  ])("INVALID_INPUT for %s", (_name, input) => {
    const error = thrown(() => extractColorsFromPixels(input as never));
    expect(error.code).toBe("INVALID_INPUT");
  });

  it("INPUT_TOO_LARGE when the pixel count exceeds limits.maxPixels", () => {
    const error = thrown(() => extractColorsFromPixels(pixels, { limits: { maxPixels: 3 } }));
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });

  it("does not apply limits.maxBytes to pixel inputs, which are limited by maxPixels", () => {
    const result = extractColorsFromPixels(pixels, { limits: { maxBytes: 1 } });
    expect(result.colors).toHaveLength(1);
  });

  it("accepts an input exactly at the limits", () => {
    const result = extractColorsFromPixels(pixels, { limits: { maxPixels: 4, maxBytes: 16 } });
    expect(result.colors).toHaveLength(1);
  });

  it("throws errors that are ColorExtractorError instances with a message", () => {
    const error = thrown(() => extractColorsFromPixels(pixels, { count: 0 }));
    expect(error.name).toBe("ColorExtractorError");
    expect(error.message.length).toBeGreaterThan(0);
  });
});
