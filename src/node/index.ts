import { ColorExtractorError } from '../core/errors.js'
import type { ExtractColorsOptions } from '../core/options.js'
import type { ExtractColorsResult } from '../core/result.js'
import { resolveOptions } from '../core/defaults.js'
import type { NodeExtractColorsInput } from './types.js'
import { detectNodeInputKind } from './detect.js'

export const VERSION = '0.1.0'
export type { NodeExtractColorsInput } from './types.js'
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
  input: NodeExtractColorsInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  if (input === null || input === undefined) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Node input is required.',
      { cause: input },
    )
  }

  // Phase 5: validate the input kind and resolve options. The actual decode
  // pipeline (bytes → core extraction) is wired in Phase 7 (Node Decode
  // Pipeline). Until then we surface a clear typed error so consumers do not
  // silently receive a placeholder.
  const kind = detectNodeInputKind(input)
  if (kind === 'unsupported') {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Node input must be a Buffer, Uint8Array, ArrayBuffer, http(s) URL string, or local path string.',
      { cause: input },
    )
  }
  resolveOptions(options)

  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
    'Node input decoding is not implemented yet. The Node decode pipeline is added in Phase 7 (Node Decode Pipeline).',
    { cause: { kind } },
  )
}
