import type { Mode } from "./types.js";

/** Default number of colors to return. */
export const DEFAULT_COUNT: number = 5;

/** Smallest allowed `count`. */
export const MIN_COUNT: number = 1;

/** Largest allowed `count`. */
export const MAX_COUNT: number = 16;

/** Default extraction mode. */
export const DEFAULT_MODE: Mode = "perceptual";

/** Default maximum input size in bytes (32 MiB). */
export const DEFAULT_MAX_BYTES: number = 33_554_432;

/** Default maximum number of pixels. */
export const DEFAULT_MAX_PIXELS: number = 16_777_216;
