import { ColorExtractorError } from './errors.js'

export interface Pixel {
  readonly index: number
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export interface NormalizedPixels {
  readonly width: number
  readonly height: number
  readonly channels: number
  readonly data: Uint8Array | Uint8ClampedArray
  [Symbol.iterator](): IterableIterator<Pixel>
}

export function normalizePixels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: number = 4,
): NormalizedPixels {
  if (!Number.isInteger(width) || width <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Width must be a positive integer.',
      { cause: width },
    )
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Height must be a positive integer.',
      { cause: height },
    )
  }
  if (channels !== 3 && channels !== 4) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Channels must be 3 (RGB) or 4 (RGBA).',
      { cause: channels },
    )
  }
  const expected = width * height * channels
  if (data.length !== expected) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `Pixel data length must equal width * height * channels (expected ${expected}, got ${data.length}).`,
      { cause: { expected, actual: data.length } },
    )
  }

  return {
    width,
    height,
    channels,
    data,
    *[Symbol.iterator]() {
      const total = width * height
      for (let i = 0; i < total; i++) {
        const o = i * channels
        yield {
          index: i,
          r: data[o]!,
          g: data[o + 1]!,
          b: data[o + 2]!,
          a: channels === 4 ? data[o + 3]! : 255,
        }
      }
    },
  }
}
