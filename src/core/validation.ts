import { ColorExtractorError } from './errors.js'

export type PixelData = Uint8Array | Uint8ClampedArray | number[]

export interface PixelInput {
  data: PixelData
  width: number
  height: number
}

function isPixelData(value: unknown): value is PixelData {
  return (
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    Array.isArray(value)
  )
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function validateCoreInput(input: unknown): asserts input is PixelInput {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Core input must be a pixel object with data, width, and height.',
      { cause: input },
    )
  }

  const candidate = input as Record<string, unknown>

  if (!isPixelData(candidate['data'])) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Core input `data` must be a Uint8Array, Uint8ClampedArray, or number[].',
      { cause: candidate['data'] },
    )
  }

  if (!isPositiveInteger(candidate['width'])) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Core input `width` must be a positive integer.',
      { cause: candidate['width'] },
    )
  }

  if (!isPositiveInteger(candidate['height'])) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Core input `height` must be a positive integer.',
      { cause: candidate['height'] },
    )
  }
}
