import type { Lab, RGB } from './types.js'
import type { Pixel } from './pixels.js'
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
