import { assignGroups } from "@/core/pipeline/assign.js";
import { buildCells, buildHistogram } from "@/core/pipeline/histogram.js";
import { runKmeans } from "@/core/pipeline/kmeans.js";
import { mergeClusters } from "@/core/pipeline/merge.js";
import {
  ALGORITHM_VERSION,
  KMEANS_MAX_ITERATIONS,
  MERGE_THRESHOLD_SQUARED,
  POSITION_WINDOW_RADIUS,
  RANKING_MIN_PRESENCE_DIVISOR,
  REPRESENTATIVE_PRESENCE_DIVISOR,
  ROUNDING_SCALE,
  WU_MAX_CLUSTERS,
} from "@/core/pipeline/parameters.js";
import { rankGroups } from "@/core/pipeline/rank.js";
import {
  selectRepresentativeColors,
  selectRepresentativePositions,
} from "@/core/pipeline/representative.js";
import { proposeWuClusters } from "@/core/pipeline/wu.js";
import { ColorExtractorError } from "./errors.js";
import type { ExtractedColor, ExtractionOptions, ExtractionResult, PixelInput } from "./types.js";
import { validatePixelRequest, type ResolvedOptions } from "./validate.js";

/**
 * Extracts the main colors of raw RGBA pixels, synchronously. Every returned color is a real pixel
 * of the image, with the position of one such pixel and its alpha.
 *
 * Fully transparent pixels are ignored, and an image with no visible pixel returns an empty
 * `colors` list. Colors are ordered by the area they cover (`coverage`, descending), and groups
 * with a negligible presence are not returned. `coverage` is the share of the visible area and
 * `score` is the area relative to the largest returned color. `count` limits the list length and
 * is never padded; `meta.count` echoes the requested count.
 *
 * Temporary behavior: perceptual mode does not exist yet, so `mode: "perceptual"` (the default)
 * orders exactly like `"population"`. `meta.mode` reports the requested mode, and
 * `meta.algorithmVersion` is `"1-population-only"`.
 *
 * @param pixels Raw RGBA pixels: `data` of length `width * height * 4`, `width`, and `height`.
 * @param options Optional `count` (1 to 16, default 5), `mode`, and `limits`.
 * @returns The extraction result, as plain objects.
 * @throws ColorExtractorError with code `INVALID_OPTIONS`, `INVALID_INPUT`, or `INPUT_TOO_LARGE`
 *   when validation fails, and `PROCESSING_FAILED` (with the original error as `cause`) for an
 *   unexpected internal failure.
 */
export function extractColorsFromPixels(
  pixels: PixelInput,
  options?: ExtractionOptions,
): ExtractionResult {
  // Validation errors propagate unchanged; only failures after validation are wrapped.
  const request = validatePixelRequest(pixels, options, "sync");
  try {
    return extract(request.pixels, request.options);
  } catch (error) {
    throw new ColorExtractorError("PROCESSING_FAILED", "Color extraction failed unexpectedly.", {
      cause: error,
    });
  }
}

function extract(pixels: PixelInput, options: ResolvedOptions): ExtractionResult {
  const meta: ExtractionResult["meta"] = {
    width: pixels.width,
    height: pixels.height,
    mode: options.mode,
    count: options.count,
    algorithmVersion: ALGORITHM_VERSION,
  };

  const histogram = buildHistogram(pixels);
  if (histogram.colors.length === 0) {
    // Fully transparent image: there is no visible color to return.
    return { schemaVersion: 1, colors: [], meta };
  }

  const cells = buildCells(histogram.colors, histogram.weights);
  const wu = proposeWuClusters(cells.keys, cells.weights, cells.moments, WU_MAX_CLUSTERS);
  const kmeans = runKmeans(
    cells.points,
    cells.weights,
    wu.labels,
    wu.clusterCount,
    KMEANS_MAX_ITERATIONS,
  );
  const merged = mergeClusters(kmeans.centers, kmeans.weights, MERGE_THRESHOLD_SQUARED);
  const assigned = assignGroups(
    histogram.pixelColorIndices,
    histogram.weights,
    cells.colorCells,
    kmeans.labels,
    merged.labels,
    merged.groupCount,
  );
  const representatives = selectRepresentativeColors(
    histogram.colors,
    histogram.weights,
    assigned.colorLabels,
    merged.centers,
    merged.groupCount,
    REPRESENTATIVE_PRESENCE_DIVISOR,
  );
  // Until perceptual mode exists (milestone 5), "perceptual" orders exactly like "population";
  // meta.mode still reports the requested mode.
  const ranked = rankGroups(
    assigned.weights,
    representatives.colors,
    histogram.totalWeight,
    RANKING_MIN_PRESENCE_DIVISOR,
    options.count,
  );
  const located = selectRepresentativePositions(
    pixels,
    histogram.pixelColorIndices,
    assigned.pixelLabels,
    ranked.groups,
    representatives.colorIndices,
    POSITION_WINDOW_RADIUS,
  );

  const { data, width } = pixels;
  const groups = ranked.groups;
  // The heaviest group always passes the presence filter, so groups[0] exists.
  const largestWeight = assigned.weights[groups[0]!]!;
  const colors: ExtractedColor[] = [];
  for (let slot = 0; slot < groups.length; slot++) {
    const group = groups[slot]!;
    const color = representatives.colors[group]!;
    const red = color >>> 16;
    const green = (color >>> 8) & 0xff;
    const blue = color & 0xff;
    const x = located.positions[2 * slot]!;
    const y = located.positions[2 * slot + 1]!;
    // The pixel at the position has exactly this RGB; its alpha is the returned alpha.
    const alpha = data[(y * width + x) * 4 + 3]!;
    const weight = assigned.weights[group]!;
    const hex = `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
    colors.push({
      rank: slot + 1,
      hex,
      hex8: `${hex}${toHexByte(alpha)}`,
      rgba: [red, green, blue, alpha],
      coverage: roundRatio(weight / histogram.totalWeight),
      score: roundRatio(weight / largestWeight),
      position: { x, y },
    });
  }
  return { schemaVersion: 1, colors, meta };
}

/** Rounds a ratio to 4 decimals. */
function roundRatio(value: number): number {
  return Math.round(value * ROUNDING_SCALE) / ROUNDING_SCALE;
}

/** Formats a channel from 0 to 255 as two lowercase hex digits. */
function toHexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}
