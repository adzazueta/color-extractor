import { ColorExtractorError } from '../core/errors.js'
import type { ExtractColorsOptions } from '../core/options.js'
import type { ExtractColorsResult } from '../core/result.js'
import { resolveOptions } from '../core/defaults.js'
import { extractColorsFromPixels } from '../core/extract.js'
import type { BrowserExtractColorsInput } from './types.js'
import { detectBrowserInputKind } from './detect.js'
import { decodeFileOrBlob } from './decode.js'

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
export {
  DEFAULT_OPTIONS,
  resolveOptions,
  type ResolvedOptions,
} from '../core/index.js'

export async function extractColors(
  input: BrowserExtractColorsInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  const resolved = resolveOptions(options)
  const kind = detectBrowserInputKind(input)

  if (kind === 'file' || kind === 'blob') {
    const decoded = await decodeFileOrBlob(input as File | Blob, resolved.sampleSize)
    return extractColorsFromPixels(
      { data: decoded.data, width: decoded.width, height: decoded.height },
      options,
    )
  }

  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
    `Browser input kind '${kind}' is not yet supported.`,
    { cause: input },
  )
}
