import { ColorExtractorError } from './errors.js'

export type PixelData = Uint8Array | Uint8ClampedArray | number[]

export interface PixelInput {
  data: PixelData
  width: number
  height: number
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

function isPixelData(value: unknown): value is PixelData {
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isByte)
  }
  return false
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isValidByteArray(value: number[]): boolean {
  return value.every(isByte)
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
      'Core input `data` must be a Uint8Array, Uint8ClampedArray, or a number[] of bytes in [0, 255].',
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

  const expected = (candidate['width'] as number) * (candidate['height'] as number) * 4
  const data = candidate['data'] as PixelData
  if (data.length !== expected) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `Core input \`data\` length must equal width * height * 4 (expected ${expected}, got ${data.length}).`,
      { cause: { expected, actual: data.length } },
    )
  }

  if (Array.isArray(data) && !isValidByteArray(data)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Core input `data` number array must contain only integers in [0, 255].',
      { cause: data },
    )
  }
}
