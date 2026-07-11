import { ColorExtractorError } from '../core/errors.js'
import type { ExtractColorsOptions } from '../core/options.js'
import type { ExtractColorsResult } from '../core/result.js'
import { resolveOptions } from '../core/defaults.js'
import type { BrowserExtractColorsInput } from './types.js'

export const VERSION = '0.1.0'
export type { BrowserExtractColorsInput } from './types.js'
export {
  COLOR_EXTRACTOR_ERROR_CODES,
  ColorExtractorError,
  type ColorExtractorErrorCode,
} from '../core/index.js'
export type {
  ColorRole,
  ColorSource,
  ExtractedColor,
  HSL,
  Lab,
  RGB,
} from '../core/index.js'
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
} from '../core/index.js'
export type {
  ExtractColorsResult,
  ExtractionMetadata,
  MinimalExtractColorsResult,
} from '../core/index.js'
export { DEFAULT_OPTIONS, resolveOptions, type ResolvedOptions } from '../core/index.js'

export async function extractColors(
  input: BrowserExtractColorsInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  if (input === null || input === undefined) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Browser input is required.',
      { cause: input },
    )
  }

  resolveOptions(options)

  return {
    primary: {
      hex: '#808080',
      rgb: { r: 128, g: 128, b: 128 },
      role: 'primary',
      source: 'fallback',
    },
    secondary: null,
  }
}
