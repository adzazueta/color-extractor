import { ColorExtractorError } from '../core/errors.js'
import { loadSharp, type SharpModule } from './sharp.js'
import type { DecodeOptions } from '../core/options.js'

export interface DecodedPixels {
  readonly width: number
  readonly height: number
  readonly channels: 4
  readonly data: Uint8Array
}

interface RawOutput {
  data: Buffer
  info: { width: number; height: number; channels: 1 | 2 | 3 | 4 }
}

interface SharpMetadata {
  width?: number
  height?: number
  orientation?: number
}

type SharpPipeline = {
  rotate: (angle?: number) => SharpPipeline
  resize: (
    width: number,
    height: number,
    options?: { fit?: 'cover' | 'contain' | 'fill' },
  ) => SharpPipeline
  ensureAlpha: () => SharpPipeline
  withMetadata: (options: { orientation?: number }) => SharpPipeline
  raw: (options?: { depth?: 'uchar' | 'ushort' | 'float' }) => {
    toBuffer: (options?: { resolveWithObject?: boolean }) => Promise<RawOutput>
  }
  metadata: () => Promise<SharpMetadata>
}

function isSharpPipeline(value: unknown): value is SharpPipeline {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v['rotate'] === 'function' &&
    typeof v['resize'] === 'function' &&
    typeof v['ensureAlpha'] === 'function' &&
    typeof v['withMetadata'] === 'function' &&
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

function isSvgBytes(bytes: Buffer | Uint8Array): boolean {
  if (bytes.length < 4) return false
  let offset = 0
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    offset = 3
  }
  if (offset + 4 > bytes.length) return false
  const prefix = Buffer.from(bytes.buffer, bytes.byteOffset + offset, 4).toString('ascii')
  return prefix === '<?xm' || prefix === '<svg' || prefix === '<SVG' || prefix === '<?XML'
}

export async function decodeBufferToPixels(
  bytes: Buffer | Uint8Array,
  sampleSize: number,
  options: Pick<DecodeOptions, 'respectOrientation' | 'maxPixels' | 'svg'>,
): Promise<DecodedPixels> {
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `sampleSize must be a positive integer, got ${sampleSize}`,
      { cause: sampleSize },
    )
  }

  const svgMode = options.svg ?? 'disabled-in-node'
  const svgDisabled = svgMode === 'disabled-in-node' || svgMode === 'disabled'
  if (svgDisabled && isSvgBytes(bytes)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
      'SVG images are not supported in Node by default. Set decode.svg to "enabled-in-node" to allow SVG.',
      { cause: { svg: true, svgMode } },
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

  // Step 1: Strip implicit EXIF rotation. We control rotation explicitly so
  // that metadata(), resize(), and raw() all see the same coordinate space.
  const neutral: SharpPipeline = pipeline.withMetadata({ orientation: 1 })

  // Step 2: probe dimensions on the now-rotation-neutral pipeline.
  let neutralMeta: SharpMetadata
  try {
    neutralMeta = await neutral.metadata()
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to probe image dimensions for early resize.',
      { cause: err },
    )
  }
  const storageWidth = neutralMeta.width ?? sampleSize
  const storageHeight = neutralMeta.height ?? sampleSize

  // Step 3: only swap width/height when the EXIF orientation is a 90°/270°
  // rotation (orientations 5, 6, 7, 8). Mirrors (2, 3, 4) do not change
  // the storage dimensions.
  const requires90Swap = (o: number | undefined): boolean =>
    o === 5 || o === 6 || o === 7 || o === 8

  const doRotate =
    options.respectOrientation && requires90Swap(neutralMeta.orientation)

  const physicalWidth = doRotate ? storageHeight : storageWidth
  const physicalHeight = doRotate ? storageWidth : storageHeight

  const maxPixels = options.maxPixels ?? 25_000_000
  const totalPixels = physicalWidth * physicalHeight
  if (totalPixels > maxPixels) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
      `Image is too large (${totalPixels} pixels, max ${maxPixels}).`,
      { cause: { width: physicalWidth, height: physicalHeight, maxPixels } },
    )
  }

  // Step 4: apply EXIF rotation explicitly. rotate(0) is a no-op but keeps
  // the pipeline shape uniform.
  const oriented: SharpPipeline = doRotate ? neutral.rotate() : neutral.rotate(0)

  // Step 5: compute the resize target using the oriented dimensions.
  const target = computeResizeTarget(physicalWidth, physicalHeight, sampleSize)

  // Step 6: resize, ensure RGBA, and emit raw.
  let sized: SharpPipeline
  try {
    sized = oriented.resize(target.width, target.height, { fit: 'fill' })
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to apply early resize to the decoded image.',
      { cause: err },
    )
  }

  let rawOut: RawOutput
  try {
    rawOut = await sized.ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Failed to extract raw RGBA pixels from the decoded image.',
      { cause: err },
    )
  }

  if (rawOut.info.channels !== 4) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      `Expected 4 channels (RGBA) from sharp, got ${rawOut.info.channels}.`,
      { cause: { channels: rawOut.info.channels, width: rawOut.info.width, height: rawOut.info.height } },
    )
  }

  return {
    width: rawOut.info.width,
    height: rawOut.info.height,
    channels: 4 as const,
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
