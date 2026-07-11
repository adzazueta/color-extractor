export const VERSION = '0.1.0'
export {
  COLOR_EXTRACTOR_ERROR_CODES,
  ColorExtractorError,
  type ColorExtractorErrorCode,
} from './errors.js'
export {
  validateCoreInput,
  type PixelData,
  type PixelInput,
} from './validation.js'
export type {
  ColorRole,
  ColorSource,
  ExtractedColor,
  HSL,
  Lab,
  RGB,
} from './types.js'
export type {
  AnimatedHandling,
  DecodeOptions,
  ExtractColorsOptions,
  FilteringOptions,
  KmeansOptions,
  LightnessOptions,
  OutputOptions,
  PrimaryOptions,
  PrimaryPreset,
  RemoteOptions,
  ScoringOptions,
  SecondaryFallbackMode,
  SecondaryOptions,
  SvgHandling,
} from './options.js'
export type {
  ExtractColorsResult,
  ExtractionMetadata,
  MinimalExtractColorsResult,
} from './result.js'
export {
  applyOutputFlags,
  type FullExtractionResult,
} from './output.js'
export {
  DEFAULT_OPTIONS,
  resolveOptions,
  type ResolvedOptions,
} from './defaults.js'
export {
  extractColorsFromPixels,
  extractColorsFromImageData,
} from './extract.js'
