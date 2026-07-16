import { ColorExtractorError } from '../core/errors.js'
import type { ExtractColorsOptions } from '../core/options.js'
import type { ExtractColorsResult } from '../core/result.js'
import { resolveOptions, type ResolvedOptions } from '../core/defaults.js'
import { runExtractionPipeline } from '../core/extract.js'
import type { NodeExtractColorsInput } from './types.js'
import { detectNodeInputKind } from './detect.js'
import { decodeBufferToPixels } from './decode.js'
import { loadLocalPath } from './load.js'
import { validateRemoteProtocol } from './security.js'
import { followRedirects } from './redirects.js'
import { validateContentType } from './content-type.js'
import { defaultResolveAndFetch } from './http-client.js'

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
  const resolved = resolveOptions(options)

  let bytes: Buffer | Uint8Array
  const kind = detectNodeInputKind(input)
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
      bytes = await fetchRemoteWithPipeline(input as string, resolved)
      break
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
    animated: resolved.decode.animated,
    normalizeColorProfile: resolved.decode.normalizeColorProfile,
  })

  let result = runExtractionPipeline(
    { data: pixels.data, width: pixels.width, height: pixels.height },
    options,
  )

  // Override metadata for Node adapter
  if (result.metadata) {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        runtime: 'node',
        decoder: 'sharp',
      },
    }
  }
  return result
}

async function fetchRemoteWithPipeline(
  href: string,
  resolved: ResolvedOptions,
): Promise<Buffer | Uint8Array> {
  // 1. Follow redirects with security validation to get the final URL and response
  const { finalUrl, finalResponse } = await followRedirects(href, {
    maxRedirects: resolved.remote.maxRedirects,
    timeoutMs: resolved.remote.timeoutMs,
    allowPrivateNetworks: resolved.remote.allowPrivateNetworks,
    allowedProtocols: resolved.remote.allowedProtocols,
    resolveAndFetch: (url, signal, hostOptions) => defaultResolveAndFetch(url, signal, hostOptions),
  })

  // 2. Validate content type
  const contentType = finalResponse.headers.get('content-type')
  validateContentType(contentType, {
    validateContentType: resolved.remote.validateContentType ?? true,
    svg: resolved.decode.svg ?? 'disabled-in-node',
  })

  // 3. Read response body with maxBytes enforcement (similar to fetchRemoteBuffer)
  const maxBytes = resolved.remote.maxBytes ?? 10_000_000
  const reader = finalResponse.body?.getReader()
  if (!reader) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_FETCH_FAILED',
      `Remote URL (${finalUrl}) returned an empty body.`,
      { cause: { url: finalUrl } },
    )
  }

  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    received += value.byteLength
    if (received > maxBytes) {
      reader.cancel()
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
        `Remote response from ${finalUrl} exceeded the ${maxBytes}-byte limit while streaming.`,
        { cause: { url: finalUrl, maxBytes, received } },
      )
    }

    chunks.push(value)
  }

  return new Uint8Array(
    chunks.reduce((acc, chunk) => {
      const tmp = new Uint8Array(acc.length + chunk.length)
      tmp.set(acc)
      tmp.set(chunk, acc.length)
      return tmp
    }, new Uint8Array(0)),
  )
}
