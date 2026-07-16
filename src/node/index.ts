import { ColorExtractorError } from '../core/errors.js'
import type { ExtractColorsOptions } from '../core/options.js'
import type { ExtractColorsResult } from '../core/result.js'
import { resolveOptions } from '../core/defaults.js'
import { runExtractionPipeline } from '../core/extract.js'
import type { NodeExtractColorsInput } from './types.js'
import { detectNodeInputKind } from './detect.js'
import { decodeBufferToPixels } from './decode.js'
import { loadLocalPath } from './load.js'

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

  const kind = detectNodeInputKind(input)
  if (kind === 'unsupported') {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Node input must be a Buffer, Uint8Array, ArrayBuffer, http(s) URL string, or local path string.',
      { cause: input },
    )
  }

  const resolved = resolveOptions(options)

  let bytes: Buffer | Uint8Array
  switch (kind) {
    case 'buffer':
      bytes = input as Buffer
      break
    case 'bytes':
      bytes = input as Uint8Array
      break
    case 'arrayBuffer':
      bytes = new Uint8Array(input as ArrayBuffer)
      break
    case 'localPath':
      bytes = await loadLocalPath(input as string)
      break
    case 'remoteUrl':
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
        'Remote URL decoding is not yet implemented (planned for later in Phase 7).',
        { cause: { kind } },
      )
    default:
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
        'Node input must be a Buffer, Uint8Array, ArrayBuffer, http(s) URL string, or local path string.',
        { cause: input },
      )
  }

  const pixels = await decodeBufferToPixels(bytes, resolved.sampleSize, {
    respectOrientation: resolved.decode.respectOrientation,
    maxPixels: resolved.decode.maxPixels,
    svg: resolved.decode.svg,
  })

  return runExtractionPipeline(
    { data: pixels.data, width: pixels.width, height: pixels.height },
    options,
  )
}
