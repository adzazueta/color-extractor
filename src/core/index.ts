export const VERSION = '0.1.0'
export {
  COLOR_EXTRACTOR_ERROR_CODES,
  ColorExtractorError,
  type ColorExtractorErrorCode,
} from './errors.js'
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
  DEFAULT_OPTIONS,
  resolveOptions,
  type ResolvedOptions,
} from './defaults.js'
export {
  extractColorsFromPixels,
  extractColorsFromImageData,
  type ImageDataLike,
} from './extract.js'
export type { PixelData, PixelInput } from './validation.js'
export {
  srgbToLinear,
  srgbByteToLinear,
} from './color/srgb.js'
export { linearRgbToXyz } from './color/xyz.js'
export { xyzToLab, labDistance, labSquaredDistance } from './color/lab.js'
export {
  chromaFromLab,
  circularHueDistance,
  hueFromLab,
  normalizeHue,
} from './color/chroma-hue.js'
export { rgbToHsl, hslToRgb } from './color/hsl.js'
export { rgbToHex } from './color/hex.js'
export {
  normalizePixels,
  type NormalizedPixels,
  type Pixel,
} from './pixels.js'
export {
  filterPixels,
  passesFilter,
  type FilterCriteria,
} from './filter.js'
