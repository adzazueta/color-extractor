import type { ExtractedColor } from "@/core/types.js";
import { MATCH_THRESHOLD } from "../../eval/config.js";
import type { ImageAnnotation } from "../../eval/lib/annotation-schema.js";
import { evaluateMode, nearestSample } from "../../eval/lib/match.js";
import type { Draft } from "./draft.js";
import { sampleLabel } from "./format.js";

export const THRESHOLD_MIN: number = 0;
export const THRESHOLD_MAX: number = 0.3;
export const THRESHOLD_STEP: number = 0.005;
/** Default of the slider when `MATCH_THRESHOLD` is not fixed yet. */
export const FALLBACK_THRESHOLD: number = 0.06;

export function defaultThreshold(): number {
  return clampThreshold(MATCH_THRESHOLD ?? FALLBACK_THRESHOLD);
}

/** Clamps to the slider range and snaps to its step. */
export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return FALLBACK_THRESHOLD;
  const clamped = Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, value));
  return Math.round(Math.round(clamped / THRESHOLD_STEP) * THRESHOLD_STEP * 1000) / 1000;
}

/**
 * The current draft as an annotation, for the shared matcher. Color indexes are kept (empty
 * colors stay empty). Null when the draft has no samples.
 */
export function draftAnnotation(draft: Draft): ImageAnnotation | null {
  if (!draft.colors.some((samples) => samples.length > 0)) return null;
  return {
    id: "dev-000",
    sha256: "0".repeat(64),
    category: draft.category ?? "general",
    width: 1,
    height: 1,
    acceptable: draft.colors.map((samples) => ({
      samples: samples.map((sample) => ({ x: sample.x, y: sample.y, hex: sample.hex })),
    })),
  };
}

export interface LiveRow {
  readonly rank: number;
  readonly hex: string;
  readonly coverage: number;
  readonly score: number;
  /** Null without samples in the draft. */
  readonly distance: number | null;
  /** The nearest sample, for example "A2". */
  readonly nearest: string | null;
  readonly hit: boolean | null;
}

/** One row per color with its live distance to the nearest sample of the draft. */
export function liveRows(
  colors: readonly ExtractedColor[],
  draft: Draft,
  threshold: number,
): LiveRow[] {
  const annotation = draftAnnotation(draft);
  return colors.map((color) => {
    const base = { rank: color.rank, hex: color.hex, coverage: color.coverage, score: color.score };
    if (annotation === null) return { ...base, distance: null, nearest: null, hit: null };
    const match = nearestSample(color.hex, annotation);
    return {
      ...base,
      distance: match.distance,
      nearest: sampleLabel(match.color, match.sample),
      hit: match.distance <= threshold,
    };
  });
}

export interface LiveSummary {
  readonly firstHit: boolean;
  readonly top3Hit: boolean;
}

/** First-color and top-3 hits at a threshold; null without samples in the draft. */
export function liveSummary(
  colors: readonly ExtractedColor[],
  draft: Draft,
  threshold: number,
): LiveSummary | null {
  const annotation = draftAnnotation(draft);
  if (annotation === null) return null;
  const outcome = evaluateMode(colors, annotation, threshold);
  return { firstHit: outcome.firstHit === true, top3Hit: outcome.top3Hit === true };
}
