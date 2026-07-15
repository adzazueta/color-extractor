import type { NormalizedPixels, Pixel } from './pixels.js'
import { rgbToHsl } from './color/hsl.js'

export interface FilterCriteria {
  readonly alphaThreshold: number
  readonly minBrightness: number
  readonly maxBrightness: number
  readonly minSaturation: number
}

export function passesFilter(pixel: Pixel, criteria: FilterCriteria): boolean {
  if (pixel.a < criteria.alphaThreshold) return false

  const maxChannel = Math.max(pixel.r, pixel.g, pixel.b)
  if (maxChannel < criteria.minBrightness) return false
  if (maxChannel > criteria.maxBrightness) return false

  const { s } = rgbToHsl(pixel.r, pixel.g, pixel.b)
  if (s * 100 < criteria.minSaturation) return false

  return true
}

export function filterPixels(
  pixels: NormalizedPixels,
  criteria: FilterCriteria,
): Pixel[] {
  const result: Pixel[] = []
  for (const pixel of pixels) {
    if (passesFilter(pixel, criteria)) {
      result.push(pixel)
    }
  }
  return result
}
