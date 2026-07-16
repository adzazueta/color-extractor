import { ColorExtractorError } from '../core/errors.js'
import type { SharpModule } from './sharp.js'
import { loadSharp } from './sharp.js'
import type { DecodeOptions } from '../core/options.js'

export interface DecodedPixels {
  readonly width: number
  readonly height: number
  readonly channels: number
  readonly data: Uint8Array
}

interface RawOutput {
  data: Buffer
  info: { width: number; height: number; channels: 1 | 2 | 3 | 4 }
}

interface SharpMetadata {
  width?: number
  height?: number
}

type SharpPipeline = {
  rotate: (angle?: number) => SharpPipeline
  resize: (
    width: number,
    height: number,
    options?: { fit?: 'cover' | 'contain' | 'fill'; withoutEnlargement?: boolean },
  ) => SharpPipeline
  raw: (options?: { depth?: 'uchar' | 'ushort' | 'float' }) => { toBuffer: (options?: { resolveWithObject?: boolean }) => Promise<RawOutput> }
  metadata: () => Promise<SharpMetadata>
}

function isSharpPipeline(value: unknown): value is SharpPipeline {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v['rotate'] === 'function' &&
    typeof v['resize'] === 'function' &&
    typeof v['raw'] === 'function' &&
    typeof v['metadata'] === 'function'
  )
}

function computeResizeTarget(
  width: number,
  height: number,
  sampleSize: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || sampleSize <= 0) {
    return { width: sampleSize, height: sampleSize }
  }
  if (width >= height) {
    const w = Math.min(width, sampleSize)
    const h = Math.max(1, Math.round((height * w) / width))
    return { width: w, height: h }
  }
  const h = Math.min(height, sampleSize)
  const w = Math.max(1, Math.round((width * h) / height))
  return { width: w, height: h }
}

export async function decodeBufferToPixels(
  bytes: Buffer | Uint8Array,
  sampleSize: number,
  options: Pick<DecodeOptions, 'respectOrientation'>,
): Promise<DecodedPixels> {
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `sampleSize must be a positive integer, got ${sampleSize}`,
      { cause: sampleSize },
    )
  }
  const Ctor = await loadSharp()
  let pipeline: unknown
  try {
    pipeline = new Ctor(bytes)
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to construct the sharp pipeline for the provided image bytes.',
      { cause: err },
    )
  }
  if (!isSharpPipeline(pipeline)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'The loaded sharp module did not return a recognizable pipeline.',
      { cause: pipeline },
    )
  }

  let probe: SharpPipeline = pipeline
  if (options.respectOrientation) {
    probe = pipeline.rotate()
  }

  let meta: SharpMetadata
  try {
    meta = await probe.metadata()
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to probe image dimensions for early resize.',
      { cause: err },
    )
  }
  const target = computeResizeTarget(meta.width ?? sampleSize, meta.height ?? sampleSize, sampleSize)

  let sized: SharpPipeline
  try {
    sized = probe.resize(target.width, target.height, { fit: 'fill' })
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to apply early resize to the decoded image.',
      { cause: err },
    )
  }

  let rawOut: RawOutput
  try {
    rawOut = await sized.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to extract raw RGBA pixels from the decoded image.',
      { cause: err },
    )
  }

  return {
    width: rawOut.info.width,
    height: rawOut.info.height,
    channels: rawOut.info.channels,
    data: new Uint8Array(rawOut.data.buffer, rawOut.data.byteOffset, rawOut.data.byteLength),
  }
}

export function _internalIsSharpPipelineForTests(value: unknown): value is SharpPipeline {
  return isSharpPipeline(value)
}

export function _internalComputeResizeTargetForTests(
  width: number,
  height: number,
  sampleSize: number,
): { width: number; height: number } {
  return computeResizeTarget(width, height, sampleSize)
}

void ({} as SharpModule)
