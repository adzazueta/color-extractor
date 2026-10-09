import { NO_GROUP } from "./parameters.js";

/** Value of `pixelColorIndices[p]` for a fully transparent pixel (never a valid color index). */
const TRANSPARENT_PIXEL: number = 0xffffffff;

export interface AssignResult {
  /** Per color: its final group. */
  readonly colorLabels: Uint8Array;
  /** Per pixel (row-major): its final group, or NO_GROUP for alpha 0. */
  readonly pixelLabels: Uint8Array;
  /** Per group: sum of its colors' weights (exact integer). */
  readonly weights: Float64Array;
}

/**
 * Assigns every color and every pixel to its final group and sums the exact weight of each group.
 * Preconditions: all indices are in range, `groupCount <= 254`, and every group has a color.
 * Inputs are not mutated; outputs are freshly allocated.
 */
export function assignGroups(
  pixelColorIndices: Uint32Array,
  colorWeights: Float64Array,
  colorCells: Uint32Array,
  cellLabels: Uint8Array,
  clusterLabels: Uint8Array,
  groupCount: number,
): AssignResult {
  const colorCount = colorCells.length;
  const pixelCount = pixelColorIndices.length;
  const colorLabels = new Uint8Array(colorCount);
  const weights = new Float64Array(groupCount);

  for (let c = 0; c < colorCount; c++) {
    const group = clusterLabels[cellLabels[colorCells[c]!]!]!;
    colorLabels[c] = group;
    weights[group] = weights[group]! + colorWeights[c]!;
  }

  const pixelLabels = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const index = pixelColorIndices[p]!;
    pixelLabels[p] = index === TRANSPARENT_PIXEL ? NO_GROUP : colorLabels[index]!;
  }

  return { colorLabels, pixelLabels, weights };
}
