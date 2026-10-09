// Section 4.1 parameters of the specification, frozen for each algorithm version: any change that
// can alter colors, order, coverage, or score changes ALGORITHM_VERSION.

/** Bits kept per RGB channel by Wu's grid and by the k-means cells (64 levels per channel). */
export const GRID_BITS: number = 6;

/** Group label of a fully transparent pixel in per-pixel group maps. */
export const NO_GROUP: number = 255;

/** Initial colors proposed by Wu's method (between 32 and 64, section 4). */
export const WU_MAX_CLUSTERS: number = 64;

/** k-means stops after an assignment step that changes no cell's cluster, or after this many steps. */
export const KMEANS_MAX_ITERATIONS: number = 50;

/** Two groups merge when their squared Oklab distance is below this (a distance of 0.03). */
export const MERGE_THRESHOLD_SQUARED: number = 0.0009;

/** A color can represent its group when 4 · its weight ≥ the weight of the group's heaviest color. */
export const REPRESENTATIVE_PRESENCE_DIVISOR: number = 4;

/** Half-size of the window that scores a position: 2 gives a 5×5 window. */
export const POSITION_WINDOW_RADIUS: number = 2;

/** A group is returned when 10,000 · its weight ≥ the total visible weight (0.01 %). */
export const RANKING_MIN_PRESENCE_DIVISOR: number = 10_000;

/** Coverage and score are rounded to multiples of 1 / 10,000 (4 decimals). */
export const ROUNDING_SCALE: number = 10_000;

/**
 * Version of the algorithm, reported in `meta.algorithmVersion`: `"<N>"` for a frozen algorithm,
 * `"<N>-<tag>"` for a temporary one. The tag says that perceptual mode orders by area until it exists.
 */
export const ALGORITHM_VERSION: string = "1-population-only";
