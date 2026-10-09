import { describe, expect, it } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { extractColorsFromPixels } from "@/core/index.js";
import type { PixelInput } from "@/core/types.js";

function solid(width: number, height: number, rgba: readonly number[]): PixelInput {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { data, width, height };
}

/** Half red, a quarter green, a quarter semi-transparent blue (weighted by alpha). */
function threeColors(): PixelInput {
  const width = 40;
  const height = 10;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = x < 20 ? [200, 30, 30, 255] : x < 30 ? [20, 180, 40, 255] : [10, 20, 220, 128];
      data.set(pixel, (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError);
    return (error as ColorExtractorError).code;
  }
  throw new Error("Expected the call to throw.");
}

describe("extractColorsFromPixels", () => {
  it("returns the complete result shape with plain fields", () => {
    const pixels = threeColors();
    const result = extractColorsFromPixels(pixels, { mode: "population" });
    expect(Object.keys(result)).toEqual(["schemaVersion", "colors", "meta"]);
    expect(result.schemaVersion).toBe(1);
    expect(result.meta).toEqual({
      width: 40,
      height: 10,
      mode: "population",
      count: 5,
      algorithmVersion: "1-population-only",
    });
    expect(result.colors).toHaveLength(3);
    result.colors.forEach((color, index) => {
      expect(Object.keys(color).sort()).toEqual(
        ["coverage", "hex", "hex8", "position", "rank", "rgba", "score"].sort(),
      );
      expect(color.rank).toBe(index + 1);
      expect(color.rgba).toHaveLength(4);
      expect(Object.keys(color.position)).toEqual(["x", "y"]);
      expect(Number.isInteger(color.position.x)).toBe(true);
      expect(Number.isInteger(color.position.y)).toBe(true);
    });
    expect(result.colors.map((color) => color.coverage)).toEqual([0.5711, 0.2856, 0.1433]);
    expect(result.colors.map((color) => color.score)).toEqual([1, 0.5, 0.251]);
    expect(result.colors[0]!.hex).toBe("#c81e1e");
  });

  it("returns one color with coverage 1 and score 1 for a single-color image", () => {
    const result = extractColorsFromPixels(solid(8, 6, [12, 34, 56, 255]));
    expect(result.colors).toEqual([
      {
        rank: 1,
        hex: "#0c2238",
        hex8: "#0c2238ff",
        rgba: [12, 34, 56, 255],
        coverage: 1,
        score: 1,
        position: expect.any(Object),
      },
    ]);
  });

  it("returns an empty list with the right meta for a fully transparent image", () => {
    const result = extractColorsFromPixels(solid(3, 2, [9, 9, 9, 0]), { count: 3 });
    expect(result).toEqual({
      schemaVersion: 1,
      colors: [],
      meta: {
        width: 3,
        height: 2,
        mode: "perceptual",
        count: 3,
        algorithmVersion: "1-population-only",
      },
    });
  });

  it("lets validation errors through with their codes", () => {
    const pixels = solid(2, 2, [1, 2, 3, 255]);
    expect(codeOf(() => extractColorsFromPixels(pixels, { count: 0 }))).toBe("INVALID_OPTIONS");
    expect(codeOf(() => extractColorsFromPixels(pixels, { mode: "x" as never }))).toBe(
      "INVALID_OPTIONS",
    );
    expect(
      codeOf(() => extractColorsFromPixels({ data: new Uint8Array(3), width: 2, height: 2 })),
    ).toBe("INVALID_INPUT");
    expect(codeOf(() => extractColorsFromPixels(null as never))).toBe("INVALID_INPUT");
    expect(codeOf(() => extractColorsFromPixels(pixels, { limits: { maxPixels: 3 } }))).toBe(
      "INPUT_TOO_LARGE",
    );
  });

  it("formats hex and hex8 in lowercase with the alpha of the chosen pixel", () => {
    const result = extractColorsFromPixels(threeColors());
    for (const { hex, hex8, rgba } of result.colors) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(hex8).toMatch(/^#[0-9a-f]{8}$/);
      expect(hex8.startsWith(hex)).toBe(true);
      expect(hex8.slice(7)).toBe(rgba[3].toString(16).padStart(2, "0"));
    }
    expect(result.colors.at(-1)!.rgba[3]).toBe(128);
    expect(result.colors.at(-1)!.hex8).toBe("#0a14dc80");
  });

  it("orders perceptual like population and only changes meta.mode", () => {
    const pixels = threeColors();
    const population = extractColorsFromPixels(pixels, { mode: "population" });
    const perceptual = extractColorsFromPixels(pixels, { mode: "perceptual" });
    expect(perceptual.colors).toEqual(population.colors);
    expect(population.meta.mode).toBe("population");
    expect(perceptual.meta.mode).toBe("perceptual");
    expect({ ...perceptual.meta, mode: "population" }).toEqual(population.meta);
  });

  it("returns real pixels at their positions", () => {
    const pixels = threeColors();
    const { data, width } = pixels;
    for (const { rgba, position } of extractColorsFromPixels(pixels).colors) {
      const offset = (position.y * width + position.x) * 4;
      expect([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]).toEqual(rgba);
    }
  });

  it("truncates to count without padding", () => {
    const pixels = threeColors();
    expect(extractColorsFromPixels(pixels, { count: 2 }).colors).toHaveLength(2);
    const result = extractColorsFromPixels(pixels, { count: 16 });
    expect(result.colors).toHaveLength(3);
    expect(result.meta.count).toBe(16);
  });
});
