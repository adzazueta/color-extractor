import type { Lab, RGB } from './types.js'
import type { NormalizedPixels, Pixel } from './pixels.js'
import { srgbByteToLinear } from './color/srgb.js'
import { linearRgbToXyz } from './color/xyz.js'
import { xyzToLab } from './color/lab.js'

export interface LabSample {
  readonly rgb: RGB
  readonly lab: Lab
  readonly index: number
}

export function convertRgbSamplesToLab(pixels: Pixel[]): LabSample[] {
  const result: LabSample[] = []
  for (const p of pixels) {
    const lr = srgbByteToLinear(p.r)
    const lg = srgbByteToLinear(p.g)
    const lb = srgbByteToLinear(p.b)
    const { x, y, z } = linearRgbToXyz(lr, lg, lb)
    const { L, a, b } = xyzToLab(x, y, z)
    result.push({
      rgb: { r: p.r, g: p.g, b: p.b },
      lab: { L, a, b },
      index: p.index,
    })
  }
  return result
}

/**
 * Sample a square grid of pixels from the image.
 *
 * `sampleSize` is the side length of the grid in cells (not a sample cap).
 * The image is sampled at uniform step `max(1, floor(max(W,H) / sampleSize))`
 * along both axes, and every cell is visited. For a 300x300 image with
 * `sampleSize = 150` the step is 2 and the grid covers all 150x150 = 22,500
 * cells. For images smaller than `sampleSize`, step is 1 and every pixel
 * is sampled (no top-left bias).
 */
export function sampleSquareGrid(
  pixels: NormalizedPixels,
  sampleSize: number,
): Pixel[] {
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new RangeError(`sampleSize must be a positive integer, got ${sampleSize}`)
  }
  const { width, height, channels, data } = pixels
  if (width === 0 || height === 0) return []

  const step = Math.max(1, Math.floor(Math.max(width, height) / sampleSize))
  const samples: Pixel[] = []
  let index = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * channels
      samples.push({
        index: index++,
        r: data[o]!,
        g: data[o + 1]!,
        b: data[o + 2]!,
        a: channels === 4 ? data[o + 3]! : 255,
      })
    }
  }
  return samples
}
