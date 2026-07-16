import { ColorExtractorError } from '../core/errors.js'
import type { ExtractColorsOptions } from '../core/options.js'
import type { ExtractColorsResult } from '../core/result.js'
import { resolveOptions } from '../core/defaults.js'
import { extractColorsFromPixels } from '../core/extract.js'
import type { BrowserExtractColorsInput } from './types.js'
import { detectBrowserInputKind } from './detect.js'
import type { BrowserInputKind } from './detect.js'
import {
  decodeFileOrBlob,
  decodeRemoteUrl,
  sampleImageBitmap,
  sampleImageElement,
  sampleCanvasElement,
  sampleImageDataInput,
} from './decode.js'

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

function decoderForKind(kind: BrowserInputKind): 'canvas' | 'image-data' {
  return kind === 'imageData' ? 'image-data' : 'canvas'
}

function overrideMetadata(
  result: ExtractColorsResult,
  kind: BrowserInputKind,
): ExtractColorsResult {
  if (!result.metadata) return result
  return {
    ...result,
    metadata: {
      ...result.metadata,
      runtime: 'browser',
      decoder: decoderForKind(kind),
    },
  }
}

export async function extractColors(
  input: BrowserExtractColorsInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  try {
    const resolved = resolveOptions(options)
    const kind = detectBrowserInputKind(input)
    const maxPixels = resolved.decode.maxPixels ?? 25_000_000
    const timeoutMs = resolved.remote.timeoutMs ?? 10_000
    const maxBytes = resolved.remote.maxBytes ?? 10_000_000

    if (kind === 'file' || kind === 'blob') {
      const decoded = await decodeFileOrBlob(
        input as File | Blob,
        resolved.sampleSize,
        maxPixels,
      )
      const result = await extractColorsFromPixels(
        { data: decoded.data, width: decoded.width, height: decoded.height },
        options,
      )
      return overrideMetadata(result, kind)
    }

    if (kind === 'image') {
      const decoded = sampleImageElement(
        input as HTMLImageElement,
        resolved.sampleSize,
        maxPixels,
      )
      const result = await extractColorsFromPixels(
        { data: decoded.data, width: decoded.width, height: decoded.height },
        options,
      )
      return overrideMetadata(result, kind)
    }

    if (kind === 'bitmap') {
      const decoded = sampleImageBitmap(
        input as ImageBitmap,
        resolved.sampleSize,
        maxPixels,
      )
      const result = await extractColorsFromPixels(
        { data: decoded.data, width: decoded.width, height: decoded.height },
        options,
      )
      return overrideMetadata(result, kind)
    }

    if (kind === 'canvas') {
      const decoded = sampleCanvasElement(
        input as HTMLCanvasElement,
        resolved.sampleSize,
        maxPixels,
      )
      const result = await extractColorsFromPixels(
        { data: decoded.data, width: decoded.width, height: decoded.height },
        options,
      )
      return overrideMetadata(result, kind)
    }

    if (kind === 'imageData') {
      const decoded = sampleImageDataInput(
        input as ImageData,
        resolved.sampleSize,
        maxPixels,
      )
      const result = await extractColorsFromPixels(
        { data: decoded.data, width: decoded.width, height: decoded.height },
        options,
      )
      return overrideMetadata(result, kind)
    }

    if (kind === 'url') {
      const decoded = await decodeRemoteUrl(
        input as string,
        resolved.sampleSize,
        maxPixels,
        timeoutMs,
        maxBytes,
      )
      const result = await extractColorsFromPixels(
        { data: decoded.data, width: decoded.width, height: decoded.height },
        options,
      )
      return overrideMetadata(result, kind)
    }

    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `Browser input kind '${kind}' is not yet supported.`,
      { cause: input },
    )
  } catch (cause) {
    if (cause instanceof ColorExtractorError) {
      throw cause
    }
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Unexpected error during color extraction.',
      { cause },
    )
  }
}

export type { DecodedPixels } from './decode.js'
export {
  decodeFileOrBlob,
  decodeRemoteUrl,
  sampleImageBitmap,
  sampleImageElement,
  sampleCanvasElement,
  sampleImageDataInput,
} from './decode.js'
export { detectBrowserInputKind, type BrowserInputKind } from './detect.js'
