import { expect } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import type { ExtractedColor } from "@/core/types.js";

export async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

/**
 * The leading colors match `expected` in order (each channel within `tolerance`) with coverage
 * within `coverageTolerance`. Lossy encoding may add minor extra colors after them.
 */
export function expectSimilarColors(
  actual: readonly ExtractedColor[],
  expected: readonly ExtractedColor[],
  tolerance = 16,
  coverageTolerance = 0.02,
): void {
  expect(actual.length).toBeGreaterThanOrEqual(expected.length);
  for (const [index, want] of expected.entries()) {
    const got = actual[index];
    expect(got).toBeDefined();
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs((got?.rgba[channel] ?? 999) - (want.rgba[channel] ?? 0))).toBeLessThanOrEqual(
        tolerance,
      );
    }
    expect(Math.abs((got?.coverage ?? 9) - want.coverage)).toBeLessThanOrEqual(coverageTolerance);
  }
}
