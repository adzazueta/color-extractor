import type { ExtractColorsOptions, ExtractColorsResult } from './core/index.js'
import type { BrowserExtractColorsInput } from './browser/types.js'
import type { NodeExtractColorsInput } from './node/types.js'

export const VERSION = '0.1.0'

export type RootExtractColorsInput = BrowserExtractColorsInput | NodeExtractColorsInput

export declare function extractColors(
  input: RootExtractColorsInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult>

export { ColorExtractorError } from './core/index.js'
export type { ColorExtractorErrorCode } from './core/index.js'
export type {
  ColorRole,
  ColorSource,
  ExtractedColor,
  HSL,
  Lab,
  RGB,
} from './core/index.js'
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
} from './core/index.js'
export type {
  ExtractColorsResult,
  ExtractionMetadata,
  MinimalExtractColorsResult,
} from './core/index.js'
export { DEFAULT_OPTIONS, resolveOptions, type ResolvedOptions } from './core/index.js'
