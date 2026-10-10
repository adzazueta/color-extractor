/**
 * Oklab distance at or under which a returned color matches an acceptable sample. `null` until
 * Alexis fixes it after calibrating on the development set (specification 7.2).
 */
export const MATCH_THRESHOLD: number | null = null;

/** Candidate thresholds of the dev-only calibration table, ascending. */
export const CALIBRATION_THRESHOLDS: readonly number[] = [
  0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2,
];

/** Upper edges of the distance histogram in the dev report; a last bucket collects the rest. */
export const DISTANCE_BUCKET_EDGES: readonly number[] = [0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2];

/** Colors requested per image in reports: the package default. */
export const REPORT_COUNT: number = 5;

/** The supporting metric looks at the first 3 colors. */
export const TOP_COLORS: number = 3;

/** Near-black (dark diagnostic): Oklab L below this... */
export const NEAR_BLACK_MAX_LIGHTNESS: number = 0.25;

/** ...and chroma sqrt(a² + b²) below this. */
export const NEAR_BLACK_MAX_CHROMA: number = 0.05;

/** The dark diagnostic looks at the first 5 colors. */
export const DARK_DIAGNOSTIC_COLORS: number = 5;
