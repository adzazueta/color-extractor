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

export function sampleSquareGrid(
  pixels: NormalizedPixels,
  sampleSize: number,
): Pixel[] {
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new RangeError(`sampleSize must be a positive integer, got ${sampleSize}`)
  }
  const { width, height } = pixels
  const total = width * height
  if (total === 0) return []

  const step = Math.max(1, Math.floor(Math.sqrt(total / sampleSize)))
  const samples: Pixel[] = []
  let index = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const px = pixels.data
      const o = (y * width + x) * pixels.channels
      samples.push({
        index: index++,
        r: px[o]!,
        g: px[o + 1]!,
        b: px[o + 2]!,
        a: pixels.channels === 4 ? px[o + 3]! : 255,
      })
      if (samples.length >= sampleSize) return samples
    }
  }
  return samples
}
