/** Extraction mode. */
export type Mode = "perceptual" | "population";

/**
 * Raw pixels to analyze. Pixels are non-premultiplied RGBA, rows run from top
 * to bottom, and there is no row padding. `data.length` must equal
 * `width * height * 4`. An `ImageData` matches this shape.
 */
export interface PixelInput {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Options accepted by the extraction functions. Omitting an option or passing
 * `undefined` applies its default.
 */
export interface ExtractionOptions {
  /** Number of colors to return, from 1 to 16. Default: 5. */
  count?: number | undefined;
  /** Extraction mode. Default: `"perceptual"`. */
  mode?: Mode | undefined;
  /** Input size limits. Defaults: 33,554,432 bytes and 16,777,216 pixels. */
  limits?:
    | {
        /** Maximum input size in bytes. Default: 33,554,432. */
        maxBytes?: number | undefined;
        /** Maximum number of pixels. Default: 16,777,216. */
        maxPixels?: number | undefined;
      }
    | undefined;
}

/**
 * Options for the asynchronous extraction functions, which can load an image
 * from a URL.
 */
export interface AsyncExtractionOptions extends ExtractionOptions {
  /** Aborts the operation when signaled. */
  signal?: AbortSignal | undefined;
  /** Fetch implementation used to load the image. */
  fetch?: typeof globalThis.fetch | undefined;
}

/**
 * One extracted color. Every returned color is a real pixel value from the image.
 */
export interface ExtractedColor {
  /** Position of the color in the result. */
  rank: number;
  /** Color as `#RRGGBB`. */
  hex: string;
  /** Color as `#RRGGBBAA`. */
  hex8: string;
  /** Color as `[r, g, b, a]`, each channel from 0 to 255. */
  rgba: readonly [number, number, number, number];
  /** Share of the image covered by this color, from 0 to 1. */
  coverage: number;
  /** Score from 0 to 1. Only compare scores within the same image. */
  score: number;
  /** Pixel coordinates of the color in the image. */
  position: { x: number; y: number };
}

/**
 * Result of an extraction. The first color is `colors[0]`; there is no
 * separate primary field.
 */
export interface ExtractionResult {
  /** Version of the result format. */
  schemaVersion: 1;
  /** Extracted colors, ordered by rank. */
  colors: readonly ExtractedColor[];
  /** Information about the input and the run. */
  meta: {
    width: number;
    height: number;
    mode: Mode;
    count: number;
    /** Version of the algorithm that produced the colors. */
    algorithmVersion: string;
  };
}
