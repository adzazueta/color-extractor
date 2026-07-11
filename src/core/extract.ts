import { ColorExtractorError } from './errors.js'
import { validateCoreInput } from './validation.js'
import { resolveOptions } from './defaults.js'
import type { ExtractColorsOptions } from './options.js'
import type { ExtractColorsResult } from './result.js'
import type { PixelInput } from './validation.js'

export interface ImageDataLike {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

function placeholderResult(): ExtractColorsResult {
  return {
    primary: {
      hex: '#808080',
      rgb: { r: 128, g: 128, b: 128 },
      role: 'primary',
      source: 'fallback',
    },
    secondary: null,
  }
}

export async function extractColorsFromPixels(
  input: PixelInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  validateCoreInput(input)
  resolveOptions(options)
  return placeholderResult()
}

export async function extractColorsFromImageData(
  imageData: ImageDataLike,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  if (imageData === null || imageData === undefined) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'ImageData input is required.',
      { cause: imageData },
    )
  }
  const input: PixelInput = {
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  }
  return extractColorsFromPixels(input, options)
}
