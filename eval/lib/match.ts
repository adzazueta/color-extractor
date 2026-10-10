import { DARK_DIAGNOSTIC_COLORS, TOP_COLORS } from "../config.js";
import type { ImageAnnotation } from "./annotation-schema.js";
import { isNearBlack, oklabDistance, parseHex } from "./color.js";

export interface ColorLike {
  readonly hex: string;
  readonly coverage: number;
}

export interface SampleMatch {
  readonly hex: string;
  readonly color: number;
  readonly sample: number;
  readonly distance: number;
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * The closest sample over every acceptable color: lowest distance, ties to the lower color index,
 * then the lower sample index (strict `<`, iteration in index order).
 *
 * @throws RangeError when the annotation has no samples.
 */
export function nearestSample(hex: string, annotation: ImageAnnotation): SampleMatch {
  const rgb = parseHex(hex);
  let best: SampleMatch | null = null;
  annotation.acceptable.forEach((color, colorIndex) => {
    color.samples.forEach((sample, sampleIndex) => {
      const distance = oklabDistance(rgb, parseHex(sample.hex));
      if (best === null || distance < best.distance) {
        best = { hex: sample.hex, color: colorIndex, sample: sampleIndex, distance };
      }
    });
  });
  if (best === null) throw new RangeError("The annotation has no samples.");
  return best;
}

export interface ModeOutcome {
  readonly colors: readonly string[];
  /** For colors[0]. */
  readonly nearest: SampleMatch | null;
  /** Null when the threshold is null. */
  readonly firstHit: boolean | null;
  readonly top3Hit: boolean | null;
}

/**
 * `firstHit`: colors[0] exists and its nearest distance is at most the threshold (unrounded).
 * `top3Hit`: some colors[k], k < TOP_COLORS, has a nearest distance at most the threshold.
 */
export function evaluateMode(
  colors: readonly ColorLike[],
  annotation: ImageAnnotation,
  threshold: number | null,
): ModeOutcome {
  const matches = colors.slice(0, TOP_COLORS).map((color) => nearestSample(color.hex, annotation));
  const first = matches[0];
  return {
    colors: colors.map((color) => color.hex),
    nearest: first ?? null,
    firstHit: threshold === null ? null : first !== undefined && first.distance <= threshold,
    top3Hit: threshold === null ? null : matches.some((match) => match.distance <= threshold),
  };
}

export interface DarkDiagnostic {
  readonly nearBlack: number;
  readonly coverage: number;
  readonly closestPair: number | null;
}

/**
 * Over the first DARK_DIAGNOSTIC_COLORS colors: the count of near-black colors, the rounded sum of
 * their coverage, and the rounded smallest distance between two of them (null with fewer than 2).
 */
export function darkDiagnostic(colors: readonly ColorLike[]): DarkDiagnostic {
  const dark = colors
    .slice(0, DARK_DIAGNOSTIC_COLORS)
    .map((color) => ({ rgb: parseHex(color.hex), coverage: color.coverage }))
    .filter((color) => isNearBlack(color.rgb));
  let coverage = 0;
  for (const color of dark) coverage += color.coverage;
  let closest: number | null = null;
  for (let i = 0; i < dark.length; i++) {
    for (let j = i + 1; j < dark.length; j++) {
      const distance = oklabDistance(dark[i]!.rgb, dark[j]!.rgb);
      if (closest === null || distance < closest) closest = distance;
    }
  }
  return {
    nearBlack: dark.length,
    coverage: round4(coverage),
    closestPair: closest === null ? null : round4(closest),
  };
}

/** Hits of the first color for each threshold: `distance <= t` (null distances never hit). */
export function hitsAtThresholds(
  firstDistances: readonly (number | null)[],
  thresholds: readonly number[],
): number[] {
  return thresholds.map(
    (threshold) =>
      firstDistances.filter((distance) => distance !== null && distance <= threshold).length,
  );
}
