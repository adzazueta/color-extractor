import { describe, it, expect } from 'vitest'
import { xyzToLab } from '../../../src/core/color/lab.js'
import { linearRgbToXyz } from '../../../src/core/color/xyz.js'

const LAB_WHITE_X = 0.95047
const LAB_WHITE_Y = 1.0
const LAB_WHITE_Z = 1.08883

describe('xyzToLab', () => {
  describe('boundary cases', () => {
    it('black (0, 0, 0) maps to L=0, a=0, b=0 exactly', () => {
      const result = xyzToLab(0, 0, 0)
      expect(result.L).toBe(0)
      expect(result.a).toBe(0)
      expect(result.b).toBe(0)
    })

    it('D65 white maps to L=100, a=0, b=0 exactly', () => {
      const result = xyzToLab(LAB_WHITE_X, LAB_WHITE_Y, LAB_WHITE_Z)
      expect(result.L).toBe(100)
      expect(result.a).toBe(0)
      expect(result.b).toBe(0)
    })
  })

  describe('mid-gray', () => {
    it('half-intensity white maps to L≈76, a=0, b=0', () => {
      const result = xyzToLab(LAB_WHITE_X / 2, LAB_WHITE_Y / 2, LAB_WHITE_Z / 2)
      expect(result.L).toBeCloseTo(76.069, 2)
      expect(result.a).toBeCloseTo(0, 10)
      expect(result.b).toBeCloseTo(0, 10)
    })

    it('quarter-intensity white maps to L≈57, a=0, b=0', () => {
      const result = xyzToLab(LAB_WHITE_X / 4, LAB_WHITE_Y / 4, LAB_WHITE_Z / 4)
      expect(result.L).toBeCloseTo(57.075, 2)
      expect(result.a).toBeCloseTo(0, 10)
      expect(result.b).toBeCloseTo(0, 10)
    })
  })

  describe('primary color channels (linear RGB → XYZ → Lab)', () => {
    it('pure red (1, 0, 0)', () => {
      const { x, y, z } = linearRgbToXyz(1, 0, 0)
      const result = xyzToLab(x, y, z)
      expect(result.L).toBeCloseTo(53.24, 1)
      expect(result.a).toBeCloseTo(80.09, 1)
      expect(result.b).toBeCloseTo(67.20, 1)
    })

    it('pure green (0, 1, 0) — a < 0 (green axis)', () => {
      const { x, y, z } = linearRgbToXyz(0, 1, 0)
      const result = xyzToLab(x, y, z)
      expect(result.L).toBeCloseTo(87.74, 1)
      expect(result.a).toBeCloseTo(-86.18, 1)
      expect(result.b).toBeCloseTo(83.18, 1)
    })

    it('pure blue (0, 0, 1) — b < 0 (blue axis)', () => {
      const { x, y, z } = linearRgbToXyz(0, 0, 1)
      const result = xyzToLab(x, y, z)
      expect(result.L).toBeCloseTo(32.30, 1)
      expect(result.a).toBeCloseTo(79.20, 1)
      expect(result.b).toBeCloseTo(-107.86, 1)
    })
  })

  describe('axis properties', () => {
    it('red has a > 0 (red-green axis), green has a < 0', () => {
      const redXyz = linearRgbToXyz(1, 0, 0)
      const greenXyz = linearRgbToXyz(0, 1, 0)
      const red = xyzToLab(redXyz.x, redXyz.y, redXyz.z)
      const green = xyzToLab(greenXyz.x, greenXyz.y, greenXyz.z)
      expect(red.a).toBeGreaterThan(0)
      expect(green.a).toBeLessThan(0)
    })

    it('blue has b < 0 (blue-yellow axis), yellow has b > 0', () => {
      const blueXyz = linearRgbToXyz(0, 0, 1)
      const yellowXyz = linearRgbToXyz(1, 1, 0)
      const blue = xyzToLab(blueXyz.x, blueXyz.y, blueXyz.z)
      const yellow = xyzToLab(yellowXyz.x, yellowXyz.y, yellowXyz.z)
      expect(blue.b).toBeLessThan(0)
      expect(yellow.b).toBeGreaterThan(0)
    })

    it('a and b are zero when X/Xn = Y/Yn = Z/Zn (achromatic)', () => {
      const result = xyzToLab(LAB_WHITE_X * 0.3, LAB_WHITE_Y * 0.3, LAB_WHITE_Z * 0.3)
      expect(result.a).toBeCloseTo(0, 10)
      expect(result.b).toBeCloseTo(0, 10)
    })
  })

  describe('piecewise f(t) continuity at threshold', () => {
    it('linear and power branches meet smoothly at the threshold', () => {
      const justBelow = (6 / 29) ** 3 - 1e-9
      const justAbove = (6 / 29) ** 3 + 1e-9

      const f = (t: number): number => {
        const threshold = (6 / 29) ** 3
        const slope = (29 / 6) ** 2 / 3
        const offset = 4 / 29
        return t > threshold ? t ** (1 / 3) : slope * t + offset
      }

      const lower = f(justBelow)
      const upper = f(justAbove)
      expect(Math.abs(upper - lower)).toBeLessThan(1e-6)
    })

    it('f(0) in the linear branch gives the expected offset', () => {
      const result = xyzToLab(0, 0, 0)
      expect(result.L).toBe(0)
      expect(result.a).toBe(0)
      expect(result.b).toBe(0)
    })
  })

  describe('monotonicity of L along the gray axis', () => {
    it('L increases as Y increases (gray axis)', () => {
      let prevL = -Infinity
      for (let i = 0; i <= 100; i++) {
        const t = i / 100
        const { L } = xyzToLab(LAB_WHITE_X * t, LAB_WHITE_Y * t, LAB_WHITE_Z * t)
        expect(L).toBeGreaterThanOrEqual(prevL)
        prevL = L
      }
    })
  })

  describe('allocation-light', () => {
    it('returns a fresh object per call', () => {
      const r1 = xyzToLab(0.5, 0.5, 0.5)
      const r2 = xyzToLab(0.5, 0.5, 0.5)
      expect(r1).not.toBe(r2)
      expect(r1).toEqual(r2)
    })
  })
})
