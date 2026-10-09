import { describe, expect, it } from "vite-plus/test";
import { srgbToOklabInto } from "@/core/color/oklab.js";
import { NO_GROUP } from "@/core/pipeline/parameters.js";
import {
  selectRepresentativeColors,
  selectRepresentativePositions,
} from "@/core/pipeline/representative.js";
import type { PixelInput } from "@/core/types.js";
import { mulberry32 } from "../helpers.js";

const TRANSPARENT_PIXEL = 0xffffffff;

function pack(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue;
}

function oklabOf(rgb: number): [number, number, number] {
  const out = new Float64Array(3);
  srgbToOklabInto(rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff, out, 0);
  return [out[0]!, out[1]!, out[2]!];
}

// ---------------------------------------------------------------------------------------------
// Representative colors
// ---------------------------------------------------------------------------------------------

/** One histogram color: packed RGB, weight, and group. */
interface ColorEntry {
  rgb: number;
  weight: number;
  group: number;
}

interface ColorInputs {
  colors: Uint32Array;
  weights: Float64Array;
  colorLabels: Uint8Array;
}

/** Lays out colors in the histogram's order: ascending packed RGB. */
function colorInputs(entries: readonly ColorEntry[]): ColorInputs {
  const sorted = [...entries].sort((a, b) => a.rgb - b.rgb);
  return {
    colors: Uint32Array.from(sorted, (entry) => entry.rgb),
    weights: Float64Array.from(sorted, (entry) => entry.weight),
    colorLabels: Uint8Array.from(sorted, (entry) => entry.group),
  };
}

/** Brute force: every candidate's distance, then the smallest (distance, packed RGB). */
function naiveRepresentatives(
  { colors, weights, colorLabels }: ColorInputs,
  centers: Float64Array,
  groupCount: number,
  presenceDivisor: number,
): number[] {
  const result: number[] = [];
  for (let group = 0; group < groupCount; group++) {
    let heaviest = 0;
    for (let c = 0; c < colors.length; c++) {
      if (colorLabels[c] === group) heaviest = Math.max(heaviest, weights[c]!);
    }
    let best = -1;
    let bestDistance = Infinity;
    for (let c = 0; c < colors.length; c++) {
      if (colorLabels[c] !== group || weights[c]! * presenceDivisor < heaviest) continue;
      const [L, a, b] = oklabOf(colors[c]!);
      const dL = L - centers[3 * group]!;
      const da = a - centers[3 * group + 1]!;
      const db = b - centers[3 * group + 2]!;
      const distance = dL * dL + da * da + db * db;
      const better =
        best < 0 ||
        distance < bestDistance ||
        (distance === bestDistance && colors[c]! < colors[best]!);
      if (better) {
        best = c;
        bestDistance = distance;
      }
    }
    result.push(best);
  }
  return result;
}

const GRAY_100 = pack(100, 100, 100);
const GRAY_110 = pack(110, 110, 110);
const GRAY_200 = pack(200, 200, 200);

describe("selectRepresentativeColors", () => {
  it("accepts a color whose weight times the divisor equals the heaviest weight", () => {
    // The center is the 24-weight color, so it would win if it were a candidate; the 25-weight
    // color is the next closest.
    const centers = Float64Array.from(oklabOf(GRAY_100));
    const passing = colorInputs([
      { rgb: GRAY_100, weight: 24, group: 0 },
      { rgb: GRAY_110, weight: 25, group: 0 },
      { rgb: GRAY_200, weight: 100, group: 0 },
    ]);
    const result = selectRepresentativeColors(
      passing.colors,
      passing.weights,
      passing.colorLabels,
      centers,
      1,
      4,
    );
    expect(Array.from(result.colorIndices)).toEqual([1]);
    expect(Array.from(result.colors)).toEqual([GRAY_110]);

    // One less is below the threshold: only the heaviest color remains.
    const failing = colorInputs([
      { rgb: GRAY_100, weight: 24, group: 0 },
      { rgb: GRAY_110, weight: 24, group: 0 },
      { rgb: GRAY_200, weight: 100, group: 0 },
    ]);
    const fallback = selectRepresentativeColors(
      failing.colors,
      failing.weights,
      failing.colorLabels,
      centers,
      1,
      4,
    );
    expect(Array.from(fallback.colorIndices)).toEqual([2]);
    expect(Array.from(fallback.colors)).toEqual([GRAY_200]);
  });

  it("prefers a lighter candidate closer to the center over the heaviest color", () => {
    const inputs = colorInputs([
      { rgb: GRAY_110, weight: 30, group: 0 },
      { rgb: GRAY_200, weight: 100, group: 0 },
    ]);
    const centers = Float64Array.from(oklabOf(pack(105, 105, 105)));
    const result = selectRepresentativeColors(
      inputs.colors,
      inputs.weights,
      inputs.colorLabels,
      centers,
      1,
      4,
    );
    expect(Array.from(result.colors)).toEqual([GRAY_110]);
  });

  it("breaks distance ties by the smallest packed RGB among the candidates", () => {
    // Every distance to (1e20, 0, 0) rounds to the same double.
    const centers = new Float64Array([1e20, 0, 0]);
    const distanceOf = (rgb: number): number => {
      const [L, a, b] = oklabOf(rgb);
      const dL = L - 1e20;
      return dL * dL + a * a + b * b;
    };
    expect(distanceOf(pack(0, 0, 255))).toBe(distanceOf(pack(255, 0, 0)));
    const inputs = colorInputs([
      { rgb: pack(0, 0, 9), weight: 1, group: 0 }, // smallest RGB, not a candidate
      { rgb: pack(0, 0, 255), weight: 50, group: 0 },
      { rgb: pack(0, 255, 0), weight: 60, group: 0 },
      { rgb: pack(255, 0, 0), weight: 100, group: 0 },
    ]);
    const result = selectRepresentativeColors(
      inputs.colors,
      inputs.weights,
      inputs.colorLabels,
      centers,
      1,
      4,
    );
    expect(Array.from(result.colors)).toEqual([pack(0, 0, 255)]);
    expect(Array.from(result.colorIndices)).toEqual([1]);
  });

  it("returns the only color of a single-color group", () => {
    const inputs = colorInputs([{ rgb: pack(7, 8, 9), weight: 3, group: 0 }]);
    const result = selectRepresentativeColors(
      inputs.colors,
      inputs.weights,
      inputs.colorLabels,
      new Float64Array([0.9, 0.2, -0.2]),
      1,
      4,
    );
    expect(Array.from(result.colors)).toEqual([pack(7, 8, 9)]);
    expect(Array.from(result.colorIndices)).toEqual([0]);
  });

  it("handles several interleaved groups in one call", () => {
    const red = pack(200, 30, 40);
    const darkRed = pack(150, 20, 30);
    const blue = pack(20, 40, 210);
    const lightBlue = pack(60, 90, 240);
    const green = pack(30, 180, 60);
    const inputs = colorInputs([
      { rgb: red, weight: 80, group: 1 },
      { rgb: darkRed, weight: 40, group: 1 },
      { rgb: blue, weight: 100, group: 0 },
      { rgb: lightBlue, weight: 25, group: 0 },
      { rgb: green, weight: 5, group: 2 },
    ]);
    const centers = new Float64Array([
      ...oklabOf(pack(55, 85, 235)),
      ...oklabOf(pack(160, 22, 32)),
      0,
      0,
      0,
    ]);
    const result = selectRepresentativeColors(
      inputs.colors,
      inputs.weights,
      inputs.colorLabels,
      centers,
      3,
      4,
    );
    expect(Array.from(result.colors)).toEqual([lightBlue, darkRed, green]);
    for (let group = 0; group < 3; group++) {
      expect(inputs.colors[result.colorIndices[group]!]).toBe(result.colors[group]);
    }
  });

  it("matches a brute-force reference and always returns a color of the group", () => {
    const next = mulberry32(29);
    for (let trial = 0; trial < 300; trial++) {
      const groupCount = 1 + Math.floor(next() * 12);
      const colorCount = groupCount + Math.floor(next() * 60);
      const used = new Set<number>();
      const entries: ColorEntry[] = [];
      while (entries.length < colorCount) {
        // Gray levels and a coarse lattice create equal distances and exact Oklab ties.
        const rgb =
          next() < 0.5
            ? pack(Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256))
            : pack(32 * Math.floor(next() * 8), 32 * Math.floor(next() * 8), 0);
        if (used.has(rgb)) continue;
        used.add(rgb);
        // The first colors cover every group, so no group is empty.
        const group =
          entries.length < groupCount ? entries.length : Math.floor(next() * groupCount);
        const weight = next() < 0.5 ? 1 + Math.floor(next() * 8) : 1 + Math.floor(next() * 4000);
        entries.push({ rgb, weight, group });
      }
      const inputs = colorInputs(entries);
      const centers = new Float64Array(3 * groupCount);
      for (let group = 0; group < groupCount; group++) {
        // Centers on a member color give exact zero distances; others are arbitrary points.
        const member = entries.find((entry) => entry.group === group)!;
        if (next() < 0.3) {
          centers.set(oklabOf(member.rgb), 3 * group);
        } else {
          centers[3 * group] = next();
          centers[3 * group + 1] = next() * 0.6 - 0.3;
          centers[3 * group + 2] = next() * 0.6 - 0.3;
        }
      }
      const divisor = 1 + Math.floor(next() * 6);
      const result = selectRepresentativeColors(
        inputs.colors,
        inputs.weights,
        inputs.colorLabels,
        centers,
        groupCount,
        divisor,
      );
      expect(Array.from(result.colorIndices)).toEqual(
        naiveRepresentatives(inputs, centers, groupCount, divisor),
      );
      for (let group = 0; group < groupCount; group++) {
        const index = result.colorIndices[group]!;
        expect(inputs.colorLabels[index]).toBe(group);
        expect(result.colors[group]).toBe(inputs.colors[index]);
      }
    }
  });

  it("is deterministic, does not mutate its inputs, and returns fresh arrays", () => {
    const inputs = colorInputs([
      { rgb: GRAY_100, weight: 40, group: 1 },
      { rgb: GRAY_110, weight: 25, group: 0 },
      { rgb: GRAY_200, weight: 100, group: 0 },
    ]);
    const centers = new Float64Array([...oklabOf(GRAY_110), ...oklabOf(GRAY_100)]);
    const copies = [
      inputs.colors.slice(),
      inputs.weights.slice(),
      inputs.colorLabels.slice(),
      centers.slice(),
    ];
    const first = selectRepresentativeColors(
      inputs.colors,
      inputs.weights,
      inputs.colorLabels,
      centers,
      2,
      4,
    );
    const second = selectRepresentativeColors(
      inputs.colors,
      inputs.weights,
      inputs.colorLabels,
      centers,
      2,
      4,
    );
    expect(second).toEqual(first);
    expect(first.colors).not.toBe(second.colors);
    expect(first.colorIndices).not.toBe(second.colorIndices);
    expect([inputs.colors, inputs.weights, inputs.colorLabels, centers]).toEqual(copies);
  });

  it("throws a plain Error for a group without colors", () => {
    const inputs = colorInputs([{ rgb: GRAY_100, weight: 1, group: 0 }]);
    expect(() =>
      selectRepresentativeColors(
        inputs.colors,
        inputs.weights,
        inputs.colorLabels,
        new Float64Array(6),
        2,
        4,
      ),
    ).toThrow(Error);
  });
});

// ---------------------------------------------------------------------------------------------
// Representative positions
// ---------------------------------------------------------------------------------------------

/** Per-pixel inputs in the documented layouts (section 1.1), built naively. */
interface Scene {
  pixels: PixelInput;
  colors: Uint32Array;
  pixelColorIndices: Uint32Array;
  pixelLabels: Uint8Array;
  colorLabels: Uint8Array;
}

/**
 * Builds the histogram's per-pixel maps from an image and a group per packed RGB: sorted distinct
 * RGB of the visible pixels, `0xffffffff` and `NO_GROUP` for alpha 0.
 */
function analyze(pixels: PixelInput, groupOf: (rgb: number) => number): Scene {
  const { data, width, height } = pixels;
  const pixelCount = width * height;
  const distinct = new Set<number>();
  for (let p = 0; p < pixelCount; p++) {
    if (data[4 * p + 3] !== 0) distinct.add(pack(data[4 * p]!, data[4 * p + 1]!, data[4 * p + 2]!));
  }
  const colors = Uint32Array.from([...distinct].sort((a, b) => a - b));
  const indexOf = new Map<number, number>();
  colors.forEach((rgb, index) => indexOf.set(rgb, index));
  const colorLabels = Uint8Array.from(colors, groupOf);
  const pixelColorIndices = new Uint32Array(pixelCount);
  const pixelLabels = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    if (data[4 * p + 3] === 0) {
      pixelColorIndices[p] = TRANSPARENT_PIXEL;
      pixelLabels[p] = NO_GROUP;
    } else {
      const index = indexOf.get(pack(data[4 * p]!, data[4 * p + 1]!, data[4 * p + 2]!))!;
      pixelColorIndices[p] = index;
      pixelLabels[p] = colorLabels[index]!;
    }
  }
  return { pixels, colors, pixelColorIndices, pixelLabels, colorLabels };
}

/** A legend entry: the pixel's RGBA and the group of its RGB. */
interface Ink {
  rgba: readonly [number, number, number, number];
  group: number;
}

/** Builds a scene from rows of legend characters. */
function sceneFromRows(rows: readonly string[], legend: Readonly<Record<string, Ink>>): Scene {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height * 4);
  const groups = new Map<number, number>();
  rows.forEach((row, y) => {
    expect(row.length).toBe(width);
    for (let x = 0; x < width; x++) {
      const ink = legend[row.charAt(x)]!;
      data.set(ink.rgba, 4 * (y * width + x));
      groups.set(pack(ink.rgba[0], ink.rgba[1], ink.rgba[2]), ink.group);
    }
  });
  return analyze({ data, width, height }, (rgb) => groups.get(rgb)!);
}

function colorIndexOf(scene: Scene, ink: Ink): number {
  const index = scene.colors.indexOf(pack(ink.rgba[0], ink.rgba[1], ink.rgba[2]));
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

/** Runs the search with `representatives[g]` as group g's color; returns [x, y] per group. */
function locate(
  scene: Scene,
  representatives: readonly Ink[],
  groups: readonly number[] = representatives.map((_, group) => group),
  windowRadius = 2,
): [number, number][] {
  const colorIndices = Uint32Array.from(representatives, (ink) => colorIndexOf(scene, ink));
  const { positions } = selectRepresentativePositions(
    scene.pixels,
    scene.pixelColorIndices,
    scene.pixelLabels,
    Uint8Array.from(groups),
    colorIndices,
    windowRadius,
  );
  expect(positions.length).toBe(2 * groups.length);
  return groups.map((_, s) => [positions[2 * s]!, positions[2 * s + 1]!]);
}

/** Brute force: score every candidate over its explicitly clamped 2D window. */
function naivePositions(
  pixels: PixelInput,
  pixelColorIndices: Uint32Array,
  pixelLabels: Uint8Array,
  groups: Uint8Array,
  colorIndices: Uint32Array,
  windowRadius: number,
): number[] {
  const { data, width, height } = pixels;
  const result: number[] = [];
  for (const group of groups) {
    let bestX = -1;
    let bestY = -1;
    let bestScore = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixelColorIndices[y * width + x] !== colorIndices[group]) continue;
        let score = 0;
        for (let dy = -windowRadius; dy <= windowRadius; dy++) {
          for (let dx = -windowRadius; dx <= windowRadius; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
            const q = yy * width + xx;
            if (pixelLabels[q] === group) score += data[4 * q + 3]!;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }
    result.push(bestX, bestY);
  }
  return result;
}

// Inks: group 0 has the representative R (in several alphas) and a second color S; group 1 is the
// background X; "." is transparent with R's RGB, so only the alpha keeps it out.
const R: Ink = { rgba: [200, 40, 40, 255], group: 0 };
const R100: Ink = { rgba: [200, 40, 40, 100], group: 0 };
const R200: Ink = { rgba: [200, 40, 40, 200], group: 0 };
const S: Ink = { rgba: [180, 50, 50, 255], group: 0 };
const S100: Ink = { rgba: [180, 50, 50, 100], group: 0 };
const S200: Ink = { rgba: [180, 50, 50, 200], group: 0 };
const X: Ink = { rgba: [20, 20, 90, 255], group: 1 };
const TRANSPARENT: Ink = { rgba: [200, 40, 40, 0], group: 0 };
const LEGEND: Readonly<Record<string, Ink>> = {
  R,
  r: R100,
  q: R200,
  S,
  s: S100,
  t: S200,
  X,
  ".": TRANSPARENT,
};

function flatScene(width: number, height: number, ink: Ink): Scene {
  return sceneFromRows(
    Array.from({ length: height }, () => "R".repeat(width)),
    {
      R: ink,
    },
  );
}

describe("selectRepresentativePositions", () => {
  it("returns (0, 0) for a 1×1 image", () => {
    expect(locate(flatScene(1, 1, R), [R])).toEqual([[0, 0]]);
    expect(locate(flatScene(1, 1, R100), [R100])).toEqual([[0, 0]]);
  });

  it("returns the first full window in a single-color 6×6 image", () => {
    expect(locate(flatScene(6, 6, R), [R])).toEqual([[2, 2]]);
  });

  it("returns the first pixel when every window covers a 3×3 image", () => {
    expect(locate(flatScene(3, 3, R), [R])).toEqual([[0, 0]]);
  });

  it("clips windows in thin images", () => {
    // Every window holds 3 rows; x = 2 is the first with 5 columns.
    expect(locate(flatScene(7, 3, R), [R])).toEqual([[2, 0]]);
    expect(locate(flatScene(3, 7, R), [R])).toEqual([[0, 2]]);
    expect(locate(flatScene(9, 1, R), [R])).toEqual([[2, 0]]);
  });

  it("prefers a block of the group over an earlier isolated pixel", () => {
    const scene = sceneFromRows(
      [
        "XRXXXXXX",
        "XXXXXXXX",
        "XXXXXXXX",
        "XXXXXXXX",
        "XXXXSSSX",
        "XXXXSRSX",
        "XXXXSSSX",
        "XXXXXXXX",
      ],
      LEGEND,
    );
    expect(locate(scene, [R, X], [0])).toEqual([[5, 5]]);
  });

  it("clamps the window at corners and edges instead of replicating pixels", () => {
    // The corner candidate's clamped window holds 9 pixels of the group; with replication it
    // would hold 25. The later candidate's window holds 10.
    const scene = sceneFromRows(
      [
        "RSSXXXXXX",
        "SSSXXXXXX",
        "SSSXXXXXX",
        "XXXXXXXXX",
        "XXXXXSSXX",
        "XXXXXSSXX",
        "XXXXXSRXX",
        "XXXXXSSXX",
        "XXXXXSSXX",
      ],
      LEGEND,
    );
    expect(locate(scene, [R, X], [0])).toEqual([[6, 6]]);
  });

  it("does not wrap the window around the image's side edges", () => {
    // Columns 0 and 1 hold the group. They neighbor the right-edge candidate (5, 2) only through
    // a wrap-around; its real window holds only itself, so (2, 5) wins with 7 pixels.
    const scene = sceneFromRows(
      ["SSXXXX", "SSXXXX", "SSXXXR", "SSXXXX", "SSXXXX", "SSRXXX"],
      LEGEND,
    );
    expect(locate(scene, [R, X], [0])).toEqual([[2, 5]]);
  });

  it("weights neighbors by their alpha", () => {
    // (2, 2) has 8 neighbors at alpha 100: 255 + 800. (7, 2) has 4 at 255: 255 + 1020.
    const scene = sceneFromRows(
      ["XXXXXXXXXX", "XsssXXXSXX", "XsRsXXSRSX", "XsssXXXSXX", "XXXXXXXXXX"],
      LEGEND,
    );
    expect(locate(scene, [R, X], [0])).toEqual([[7, 2]]);
  });

  it("counts transparent pixels and other groups as 0", () => {
    // (2, 2) is surrounded by group 1 and scores only itself. (7, 2) is surrounded by transparent
    // pixels of its own RGB and has one neighbor of its group, so it scores 2 · 255.
    const scene = sceneFromRows(
      ["XXXXX.....", "XXXXX.....", "XXRXX..RS.", "XXXXX.....", "XXXXX....."],
      LEGEND,
    );
    expect(locate(scene, [R, X], [0])).toEqual([[7, 2]]);
  });

  it("never chooses a transparent pixel of the representative's RGB", () => {
    const scene = sceneFromRows(["....", "....", "...R"], LEGEND);
    expect(locate(scene, [R], [0])).toEqual([[3, 2]]);
  });

  it("chooses by alpha, then row-major order, when every candidate is isolated", () => {
    const scene = sceneFromRows(
      ["XXXXXXXX", "XrXXXXqX", "XXXXXXXX", "XXXXXXXX", "XXXXqXXX", "XXXXXXXX"],
      LEGEND,
    );
    expect(locate(scene, [R, X], [0])).toEqual([[6, 1]]);
  });

  it("breaks score ties by row-major order", () => {
    const scene = sceneFromRows(
      ["XXXXXXXX", "XXXXXXSX", "XSXXXSRX", "XRSXXXXX", "XXXXXXXX"],
      LEGEND,
    );
    // (6, 2) and (1, 3) both score 3 · 255; (6, 2) comes first.
    expect(locate(scene, [R, X], [0])).toEqual([[6, 2]]);
  });

  it("returns the first interior pixel of a flat alpha-254 image", () => {
    const ink: Ink = { rgba: [120, 60, 30, 254], group: 0 };
    expect(locate(flatScene(16, 12, ink), [ink])).toEqual([[2, 2]]);
  });

  it("bounds the early exit by the largest alpha of the whole group", () => {
    // (2, 2) is the first candidate to fill its window, all at alpha 100, the largest alpha of
    // its own color. Pixels of S at alpha 200 belong to the same group, so the search goes on and
    // (9, 2) wins with 100 + 24 · 200.
    const scene = sceneFromRows(
      ["rrrrrXXttttt", "rrrrrXXttttt", "rrrrrXXttrtt", "rrrrrXXttttt", "rrrrrXXttttt"],
      LEGEND,
    );
    expect(locate(scene, [R100, X], [0])).toEqual([[9, 2]]);
  });

  it("supports a window radius of 0 (alpha only)", () => {
    const scene = sceneFromRows(["SRSq", "SSSS"], LEGEND);
    expect(locate(scene, [R], [0], 0)).toEqual([[1, 0]]);
    const isolated = sceneFromRows(["XrXq", "XXXX"], LEGEND);
    expect(locate(isolated, [R, X], [0], 0)).toEqual([[3, 0]]);
  });

  it("follows the order of `groups` and locates only the requested groups", () => {
    const blue: Ink = { rgba: [0, 0, 255, 255], group: 2 };
    const scene = sceneFromRows(["XXXXXXXXbb", "XRSXXXXXbb", "XSSXXXXXXX", "XXXXXXXXXX"], {
      ...LEGEND,
      b: blue,
    });
    // The image is 4 rows high, so no window is full; (5, 1) is the first whose 5×4 window holds
    // only group 1.
    expect(locate(scene, [R, X, blue], [2, 0, 1])).toEqual([
      [8, 0],
      [1, 1],
      [5, 1],
    ]);
    expect(locate(scene, [R, X, blue], [1])).toEqual([[5, 1]]);
    expect(locate(scene, [R, X, blue], [2, 0])).toEqual([
      [8, 0],
      [1, 1],
    ]);

    // A group that is not requested is never searched, even when its color is absent.
    const colorIndices = Uint32Array.from([
      colorIndexOf(scene, R),
      1234,
      colorIndexOf(scene, blue),
    ]);
    const { positions } = selectRepresentativePositions(
      scene.pixels,
      scene.pixelColorIndices,
      scene.pixelLabels,
      Uint8Array.from([0, 2]),
      colorIndices,
      2,
    );
    expect(Array.from(positions)).toEqual([1, 1, 8, 0]);
  });

  it("returns no positions for no requested groups", () => {
    const scene = flatScene(4, 4, R);
    const { positions } = selectRepresentativePositions(
      scene.pixels,
      scene.pixelColorIndices,
      scene.pixelLabels,
      new Uint8Array(0),
      new Uint32Array(1),
      2,
    );
    expect(positions.length).toBe(0);
  });

  it("throws a plain Error for a requested group without candidates", () => {
    // Color 0 is X, which belongs to group 1: no pixel of group 0 has it.
    const scene = sceneFromRows(["RX", "XX"], LEGEND);
    expect(scene.colors[0]).toBe(pack(X.rgba[0], X.rgba[1], X.rgba[2]));
    expect(() =>
      selectRepresentativePositions(
        scene.pixels,
        scene.pixelColorIndices,
        scene.pixelLabels,
        Uint8Array.from([0]),
        Uint32Array.from([0]),
        2,
      ),
    ).toThrow(Error);
  });

  it("accepts Uint8ClampedArray pixel data", () => {
    const scene = flatScene(6, 6, R);
    const clamped: PixelInput = {
      data: new Uint8ClampedArray(scene.pixels.data),
      width: 6,
      height: 6,
    };
    const { positions } = selectRepresentativePositions(
      clamped,
      scene.pixelColorIndices,
      scene.pixelLabels,
      Uint8Array.from([0]),
      Uint32Array.from([0]),
      2,
    );
    expect(Array.from(positions)).toEqual([2, 2]);
  });

  it("matches a brute-force reference on seeded random images", () => {
    const next = mulberry32(2929);
    const sizes: [number, number][] = [
      [1, 1],
      [1, 7],
      [7, 1],
      [3, 200],
      [200, 3],
      [2, 2],
      [5, 5],
    ];
    for (let trial = 0; trial < 400; trial++) {
      const [width, height] =
        trial < sizes.length * 4
          ? sizes[trial % sizes.length]!
          : [1 + Math.floor(next() * 40), 1 + Math.floor(next() * 40)];
      const paletteSize = 1 + Math.floor(next() * 8);
      const palette = Array.from({ length: paletteSize }, () =>
        pack(Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256)),
      );
      const groupCount = 1 + Math.floor(next() * Math.min(paletteSize, 5));
      const groupOfPaletteColor = new Map<number, number>();
      palette.forEach((rgb, index) => {
        // `set` keeps the last group for a repeated RGB, so a color always has one group.
        groupOfPaletteColor.set(rgb, index < groupCount ? index : Math.floor(next() * groupCount));
      });
      // Half of the images are rectangles of flat opaque color, which reach the early exit; the
      // other half are noise with random and zero alphas.
      const data = new Uint8Array(width * height * 4);
      const blocky = next() < 0.5;
      for (let p = 0; p < width * height; p++) {
        const rgb = palette[Math.floor(next() * paletteSize)]!;
        const t = next();
        const alpha = blocky ? 255 : t < 0.15 ? 0 : t < 0.5 ? 1 + Math.floor(next() * 255) : 255;
        data.set([rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff, alpha], 4 * p);
      }
      if (blocky) {
        for (let k = Math.floor(next() * 6); k > 0; k--) {
          const rgb = palette[Math.floor(next() * paletteSize)]!;
          const x0 = Math.floor(next() * width);
          const y0 = Math.floor(next() * height);
          const x1 = Math.min(width, x0 + 1 + Math.floor(next() * 12));
          const y1 = Math.min(height, y0 + 1 + Math.floor(next() * 12));
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              data.set([rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff, 255], 4 * (y * width + x));
            }
          }
        }
      }
      const scene = analyze({ data, width, height }, (rgb) => groupOfPaletteColor.get(rgb)!);

      // A random present color of each present group represents it; request a random subset of
      // those groups in a random order.
      const colorIndices = new Uint32Array(groupCount);
      const present: number[] = [];
      for (let group = 0; group < groupCount; group++) {
        const members: number[] = [];
        scene.colorLabels.forEach((label, index) => {
          if (label === group) members.push(index);
        });
        if (members.length === 0) continue;
        colorIndices[group] = members[Math.floor(next() * members.length)]!;
        present.push(group);
      }
      for (let i = present.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [present[i], present[j]] = [present[j]!, present[i]!];
      }
      const groups = Uint8Array.from(present.slice(0, 1 + Math.floor(next() * present.length)));
      const windowRadius = Math.floor(next() * 4);

      const { positions } = selectRepresentativePositions(
        scene.pixels,
        scene.pixelColorIndices,
        scene.pixelLabels,
        groups,
        colorIndices,
        windowRadius,
      );
      expect(Array.from(positions)).toEqual(
        naivePositions(
          scene.pixels,
          scene.pixelColorIndices,
          scene.pixelLabels,
          groups,
          colorIndices,
          windowRadius,
        ),
      );
      // Every position holds a visible pixel of the representative color.
      groups.forEach((group, s) => {
        const p = positions[2 * s + 1]! * width + positions[2 * s]!;
        expect(scene.pixelColorIndices[p]).toBe(colorIndices[group]);
        expect(data[4 * p + 3]).toBeGreaterThan(0);
      });
    }
  });

  it("is deterministic and does not mutate its inputs", () => {
    const next = mulberry32(7);
    const width = 30;
    const height = 20;
    const data = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      const shade = 60 * Math.floor(next() * 4);
      data.set([shade, shade, shade, next() < 0.1 ? 0 : 128 + Math.floor(next() * 128)], 4 * p);
    }
    const scene = analyze({ data, width, height }, (rgb) => ((rgb & 0xff) < 100 ? 0 : 1));
    const groups = Uint8Array.from([1, 0]);
    const colorIndices = Uint32Array.from([0, scene.colors.length - 1]);
    const copies = [
      data.slice(),
      scene.pixelColorIndices.slice(),
      scene.pixelLabels.slice(),
      groups.slice(),
      colorIndices.slice(),
    ];
    const run = (): Uint32Array =>
      selectRepresentativePositions(
        scene.pixels,
        scene.pixelColorIndices,
        scene.pixelLabels,
        groups,
        colorIndices,
        2,
      ).positions;
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect([data, scene.pixelColorIndices, scene.pixelLabels, groups, colorIndices]).toEqual(
      copies,
    );
  });
});
