export { ColorExtractorError } from "./errors.js";
export type { ColorExtractorErrorCode } from "./errors.js";
export type {
  AsyncExtractionOptions,
  ExtractedColor,
  ExtractionOptions,
  ExtractionResult,
  Mode,
  PixelInput,
} from "./types.js";
export { extractColorsFromPixels } from "./extract.js";
export { extractColors } from "./async.js";
export type { PixelInput as ImageInput } from "./types.js";
