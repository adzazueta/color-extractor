import { describe, it, expect } from 'vitest'
import { linearRgbToXyz } from '../../../src/core/color/xyz.js'

const D65_WHITE = { x: 0.95047, y: 1.0, z: 1.08883 } as const

describe('linearRgbToXyz', () => {
  describe('boundary cases', () => {
    it('black (0, 0, 0) maps to (0, 0, 0)', () => {
      const result = linearRgbToXyz(0, 0, 0)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.z).toBe(0)
    })

    it('white (1, 1, 1) maps to D65 white point', () => {
      const result = linearRgbToXyz(1, 1, 1)
      expect(result.x).toBeCloseTo(D65_WHITE.x, 4)
      expect(result.y).toBeCloseTo(D65_WHITE.y, 4)
      expect(result.z).toBeCloseTo(D65_WHITE.z, 4)
    })
  })

  describe('primary color channels', () => {
    it('pure red (1, 0, 0)', () => {
      const result = linearRgbToXyz(1, 0, 0)
      expect(result.x).toBeCloseTo(0.4124564, 7)
      expect(result.y).toBeCloseTo(0.2126729, 7)
      expect(result.z).toBeCloseTo(0.0193339, 7)
    })

    it('pure green (0, 1, 0)', () => {
      const result = linearRgbToXyz(0, 1, 0)
      expect(result.x).toBeCloseTo(0.3575761, 7)
      expect(result.y).toBeCloseTo(0.7151522, 7)
      expect(result.z).toBeCloseTo(0.1191920, 7)
    })

    it('pure blue (0, 0, 1)', () => {
      const result = linearRgbToXyz(0, 0, 1)
      expect(result.x).toBeCloseTo(0.1804375, 7)
      expect(result.y).toBeCloseTo(0.0721750, 7)
      expect(result.z).toBeCloseTo(0.9503041, 7)
    })
  })

  describe('secondary colors', () => {
    it('yellow (1, 1, 0) is red + green (matrix is linear)', () => {
      const yellow = linearRgbToXyz(1, 1, 0)
      const red = linearRgbToXyz(1, 0, 0)
      const green = linearRgbToXyz(0, 1, 0)
      expect(yellow.x).toBeCloseTo(red.x + green.x, 12)
      expect(yellow.y).toBeCloseTo(red.y + green.y, 12)
      expect(yellow.z).toBeCloseTo(red.z + green.z, 12)
    })

    it('cyan (0, 1, 1) is green + blue', () => {
      const cyan = linearRgbToXyz(0, 1, 1)
      const green = linearRgbToXyz(0, 1, 0)
      const blue = linearRgbToXyz(0, 0, 1)
      expect(cyan.x).toBeCloseTo(green.x + blue.x, 12)
      expect(cyan.y).toBeCloseTo(green.y + blue.y, 12)
      expect(cyan.z).toBeCloseTo(green.z + blue.z, 12)
    })

    it('magenta (1, 0, 1) is red + blue', () => {
      const magenta = linearRgbToXyz(1, 0, 1)
      const red = linearRgbToXyz(1, 0, 0)
      const blue = linearRgbToXyz(0, 0, 1)
      expect(magenta.x).toBeCloseTo(red.x + blue.x, 12)
      expect(magenta.y).toBeCloseTo(red.y + blue.y, 12)
      expect(magenta.z).toBeCloseTo(red.z + blue.z, 12)
    })
  })

  describe('mid-gray scaling', () => {
    it('mid-gray (0.5, 0.5, 0.5) is half of the white point', () => {
      const mid = linearRgbToXyz(0.5, 0.5, 0.5)
      expect(mid.x).toBeCloseTo(D65_WHITE.x * 0.5, 4)
      expect(mid.y).toBeCloseTo(D65_WHITE.y * 0.5, 4)
      expect(mid.z).toBeCloseTo(D65_WHITE.z * 0.5, 4)
    })

    it('quarter-gray (0.25, 0.25, 0.25) is a quarter of the white point', () => {
      const q = linearRgbToXyz(0.25, 0.25, 0.25)
      expect(q.x).toBeCloseTo(D65_WHITE.x * 0.25, 4)
      expect(q.y).toBeCloseTo(D65_WHITE.y * 0.25, 4)
      expect(q.z).toBeCloseTo(D65_WHITE.z * 0.25, 4)
    })
  })

  describe('linearity', () => {
    it('scaling all channels by a constant scales XYZ by the same constant', () => {
      const factor = 0.37
      const base = linearRgbToXyz(0.8, 0.5, 0.2)
      const scaled = linearRgbToXyz(0.8 * factor, 0.5 * factor, 0.2 * factor)
      expect(scaled.x).toBeCloseTo(base.x * factor, 12)
      expect(scaled.y).toBeCloseTo(base.y * factor, 12)
      expect(scaled.z).toBeCloseTo(base.z * factor, 12)
    })

    it('matrix is linear — sum of inputs equals sum of outputs', () => {
      const a = linearRgbToXyz(0.7, 0.3, 0.1)
      const b = linearRgbToXyz(0.1, 0.5, 0.4)
      const sum = linearRgbToXyz(0.8, 0.8, 0.5)
      expect(sum.x).toBeCloseTo(a.x + b.x, 12)
      expect(sum.y).toBeCloseTo(a.y + b.y, 12)
      expect(sum.z).toBeCloseTo(a.z + b.z, 12)
    })
  })

  describe('composition with sRGB EOTF', () => {
    it('srgb byte 255 produces XYZ ≈ D65 white (after gamma decode)', async () => {
      const { srgbByteToLinear } = await import('../../../src/core/color/srgb.js')
      const lr = srgbByteToLinear(255)
      const lg = srgbByteToLinear(255)
      const lb = srgbByteToLinear(255)
      const result = linearRgbToXyz(lr, lg, lb)
      expect(result.x).toBeCloseTo(D65_WHITE.x, 4)
      expect(result.y).toBeCloseTo(D65_WHITE.y, 4)
      expect(result.z).toBeCloseTo(D65_WHITE.z, 4)
    })

    it('srgb byte 0 produces XYZ (0, 0, 0) (after gamma decode)', async () => {
      const { srgbByteToLinear } = await import('../../../src/core/color/srgb.js')
      const lr = srgbByteToLinear(0)
      const lg = srgbByteToLinear(0)
      const lb = srgbByteToLinear(0)
      const result = linearRgbToXyz(lr, lg, lb)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.z).toBe(0)
    })
  })

  describe('allocation-light', () => {
    it('returns a fresh object per call (result object, not array buffer)', () => {
      const r1 = linearRgbToXyz(0.5, 0.5, 0.5)
      const r2 = linearRgbToXyz(0.5, 0.5, 0.5)
      expect(r1).not.toBe(r2)
      expect(r1).toEqual(r2)
    })
  })
})
