import { srgbToOklabInto } from "@/core/color/oklab.js";
import type { PixelInput } from "@/core/types.js";
import { NO_GROUP } from "./parameters.js";

export interface RepresentativeColorsResult {
  /** Per group: packed RGB of its representative color. */
  readonly colors: Uint32Array;
  /** Per group: index of that color in the histogram's `colors`. */
  readonly colorIndices: Uint32Array;
}

/**
 * Chooses the representative color of every group. A color of group `g` is a candidate when
 * `weight · presenceDivisor ≥` the weight of the heaviest color of `g`. Among the candidates, the
 * one closest to the group's center wins (squared Oklab distance), and ties go to the smallest
 * packed RGB. The representative is therefore always a real color of the group.
 *
 * Preconditions: `colors` is strictly ascending packed RGB, `weights` are integer alpha sums (so
 * the presence test is an exact integer comparison), every label is in `[0, groupCount)`, every
 * group has at least one color, and `centers.length === 3 · groupCount`. A group without colors
 * throws a plain `Error`.
 *
 * @param colors - Distinct packed RGB (`r << 16 | g << 8 | b`), ascending.
 * @param weights - Per color: its weight.
 * @param colorLabels - Per color: its group.
 * @param centers - 3 per group at `3g..3g+2`: the Oklab L, a, b of its center.
 * @param groupCount - Number of groups.
 * @param presenceDivisor - A color is a candidate when its weight times this reaches the weight of
 *   its group's heaviest color.
 */
export function selectRepresentativeColors(
  colors: Uint32Array,
  weights: Float64Array,
  colorLabels: Uint8Array,
  centers: Float64Array,
  groupCount: number,
  presenceDivisor: number,
): RepresentativeColorsResult {
  const colorCount = colors.length;

  const heaviest = new Float64Array(groupCount);
  for (let c = 0; c < colorCount; c++) {
    const group = colorLabels[c]!;
    const weight = weights[c]!;
    if (weight > heaviest[group]!) {
      heaviest[group] = weight;
    }
  }

  const found = new Uint8Array(groupCount);
  const bestDistances = new Float64Array(groupCount);
  const colorIndices = new Uint32Array(groupCount);
  const lab = new Float64Array(3);
  // Ascending color order with a strict `<` gives distance ties to the smallest packed RGB.
  for (let c = 0; c < colorCount; c++) {
    const group = colorLabels[c]!;
    // Integer weights below 2^53: the product and the comparison are exact.
    if (weights[c]! * presenceDivisor < heaviest[group]!) {
      continue;
    }
    const rgb = colors[c]!;
    srgbToOklabInto(rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff, lab, 0);
    const offset = 3 * group;
    const dL = lab[0]! - centers[offset]!;
    const da = lab[1]! - centers[offset + 1]!;
    const db = lab[2]! - centers[offset + 2]!;
    const distance = dL * dL + da * da + db * db;
    if (found[group] === 0 || distance < bestDistances[group]!) {
      found[group] = 1;
      bestDistances[group] = distance;
      colorIndices[group] = c;
    }
  }

  const representatives = new Uint32Array(groupCount);
  for (let group = 0; group < groupCount; group++) {
    if (found[group] === 0) {
      throw new Error(`Group ${group} has no color.`);
    }
    representatives[group] = colors[colorIndices[group]!]!;
  }
  return { colors: representatives, colorIndices };
}

export interface RepresentativePositionsResult {
  /** 2 per requested group, in the order of `groups`: x at 2s, y at 2s + 1. */
  readonly positions: Uint32Array;
}

/**
 * Locates each requested group's representative color in the image. The candidates are the pixels
 * of that exact color. A candidate's score is the sum of the alpha of the pixels of the same group
 * inside its window: the square of side `2 · windowRadius + 1` around it, clamped to the image
 * (no padding, replication, or wrap-around). Transparent pixels and other groups add 0. The
 * candidate with the highest score wins, and ties go to the first in row-major order.
 *
 * A group's position does not depend on which other groups are requested, so the result for a
 * prefix of `groups` is a prefix of the result.
 *
 * Preconditions: `pixelColorIndices` and `pixelLabels` are the per-pixel maps of `pixels`
 * (`0xffffffff` and `NO_GROUP` for alpha 0), `groups` holds distinct group indices below
 * `NO_GROUP` in any order, `colorIndices` is indexed by group, the representative color of every
 * requested group occurs in the image with that group's label, and `windowRadius` is an integer
 * ≥ 0. A requested group without a candidate throws a plain `Error`.
 *
 * @param pixels - The image; only `width`, `height`, and the alpha channel are read.
 * @param pixelColorIndices - Per pixel (row-major): index of its color, or `0xffffffff`.
 * @param pixelLabels - Per pixel (row-major): its group, or `NO_GROUP`.
 * @param groups - The groups to locate, in output order.
 * @param colorIndices - Per group: index of its representative color.
 * @param windowRadius - Half the side of the scoring window, without the center pixel.
 */
export function selectRepresentativePositions(
  pixels: PixelInput,
  pixelColorIndices: Uint32Array,
  pixelLabels: Uint8Array,
  groups: Uint8Array,
  colorIndices: Uint32Array,
  windowRadius: number,
): RepresentativePositionsResult {
  const { data, width, height } = pixels;
  const pixelCount = width * height;
  const count = groups.length;

  // Slot of each label in `groups`, or -1. Labels are in [0, NO_GROUP] and NO_GROUP is never
  // requested, so transparent pixels always map to -1. A slot returns to -1 once its search ends.
  const slots = new Int16Array(NO_GROUP + 1).fill(-1);
  const targets = new Uint32Array(count);
  for (let s = 0; s < count; s++) {
    const group = groups[s]!;
    slots[group] = s;
    targets[s] = colorIndices[group]!;
  }

  // Largest alpha per requested group. Once every group has reached 255 it cannot grow, so the
  // sweep stops there.
  const maxAlphas = new Uint8Array(count);
  let unsaturated = count;
  for (let p = 0; unsaturated > 0 && p < pixelCount; p++) {
    const s = slots[pixelLabels[p]!]!;
    if (s < 0) {
      continue;
    }
    const alpha = data[4 * p + 3]!;
    if (alpha > maxAlphas[s]!) {
      maxAlphas[s] = alpha;
      if (alpha === 255) {
        unsaturated--;
      }
    }
  }

  // No window holds more than side² pixels of the group, each with at most its largest alpha.
  // A candidate that reaches this bound ends its group's search: no later candidate can score
  // more, and ties keep the earlier pixel.
  const side = 2 * windowRadius + 1;
  const area = side * side;
  // Every candidate scores at least its own alpha (≥ 1), so a score of 0 means "none yet".
  const bestScores = new Float64Array(count);
  const bestPixels = new Float64Array(count);
  let remaining = count;
  for (let y = 0, rowStart = 0; remaining > 0 && y < height; y++, rowStart += width) {
    const windowTop = (y > windowRadius ? y - windowRadius : 0) * width;
    const windowBottom = (y + windowRadius < height ? y + windowRadius : height - 1) * width;
    for (let x = 0; x < width; x++) {
      const p = rowStart + x;
      const label = pixelLabels[p]!;
      const s = slots[label]!;
      if (s < 0 || pixelColorIndices[p]! !== targets[s]!) {
        continue;
      }
      const left = x > windowRadius ? x - windowRadius : 0;
      const right = x + windowRadius < width ? x + windowRadius : width - 1;
      let score = 0;
      for (let row = windowTop; row <= windowBottom; row += width) {
        const end = row + right;
        for (let q = row + left; q <= end; q++) {
          if (pixelLabels[q] === label) {
            score += data[4 * q + 3]!;
          }
        }
      }
      if (score > bestScores[s]!) {
        bestScores[s] = score;
        bestPixels[s] = p;
        if (score === area * maxAlphas[s]!) {
          slots[label] = -1;
          remaining--;
          if (remaining === 0) {
            break;
          }
        }
      }
    }
  }

  const positions = new Uint32Array(2 * count);
  for (let s = 0; s < count; s++) {
    if (bestScores[s] === 0) {
      throw new Error(`Group ${groups[s]} has no pixel of its representative color.`);
    }
    const p = bestPixels[s]!;
    const x = p % width;
    positions[2 * s] = x;
    positions[2 * s + 1] = (p - x) / width;
  }
  return { positions };
}
