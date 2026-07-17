import { describe, it, expect } from 'vitest'
import { srgbByteToLinear } from '../../../src/core/color/srgb.js'
import { linearRgbToXyz } from '../../../src/core/color/xyz.js'
import { xyzToLab } from '../../../src/core/color/lab.js'
import { rgbToHsl, hslToRgb } from '../../../src/core/color/hsl.js'
import { rgbToHex } from '../../../src/core/color/hex.js'

function srgbByteToLab(r: number, g: number, b: number) {
  const lr = srgbByteToLinear(r)
  const lg = srgbByteToLinear(g)
  const lb = srgbByteToLinear(b)
  const xyz = linearRgbToXyz(lr, lg, lb)
  return xyzToLab(xyz.x, xyz.y, xyz.z)
}

describe('color conversion reference values (ADZ-83)', () => {
  describe('AC: black maps near Lab L=0', () => {
    it('sRGB (0, 0, 0) produces Lab L very close to 0', () => {
      const lab = srgbByteToLab(0, 0, 0)
      expect(lab.L).toBeLessThan(1)
    })

    it('sRGB (10, 10, 10) produces Lab L near but above 0', () => {
      const lab = srgbByteToLab(10, 10, 10)
      expect(lab.L).toBeGreaterThan(0)
      expect(lab.a).toBeCloseTo(0, 0)
      expect(lab.b).toBeCloseTo(0, 0)
    })
  })

  describe('AC: white maps near Lab L=100', () => {
    it('sRGB (255, 255, 255) produces Lab L very close to 100', () => {
      const lab = srgbByteToLab(255, 255, 255)
      expect(lab.L).toBeGreaterThan(99)
      expect(lab.a).toBeCloseTo(0, 0)
      expect(lab.b).toBeCloseTo(0, 0)
    })
  })

  describe('AC: primary RGB colors produce expected hue values', () => {
    it('red (255, 0, 0) → HSL hue 0', () => {
      expect(rgbToHsl(255, 0, 0).h).toBe(0)
    })

    it('yellow (255, 255, 0) → HSL hue 60', () => {
      expect(rgbToHsl(255, 255, 0).h).toBe(60)
    })

    it('green (0, 255, 0) → HSL hue 120', () => {
      expect(rgbToHsl(0, 255, 0).h).toBe(120)
    })

    it('cyan (0, 255, 255) → HSL hue 180', () => {
      expect(rgbToHsl(0, 255, 255).h).toBe(180)
    })

    it('blue (0, 0, 255) → HSL hue 240', () => {
      expect(rgbToHsl(0, 0, 255).h).toBe(240)
    })

    it('magenta (255, 0, 255) → HSL hue 300', () => {
      expect(rgbToHsl(255, 0, 255).h).toBe(300)
    })
  })

  describe('AC: round-trip HSL/RGB tests pass within tolerance', () => {
    const testCases: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [0, 255, 255],
      [255, 0, 255],
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
      [200, 100, 50],
      [50, 200, 100],
      [100, 50, 200],
      [180, 0, 0],
      [0, 180, 0],
      [0, 0, 180],
    ]

    for (const [r, g, b] of testCases) {
      it(`RGB(${r},${g},${b}) → HSL → RGB round-trips to within 1 unit`, () => {
        const hsl = rgbToHsl(r, g, b)
        const back = hslToRgb(hsl.h, hsl.s, hsl.l)
        expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1)
      })
    }
  })

  describe('AC: reference values with numeric tolerances', () => {
    it('sRGB red byte → linear → XYZ → Lab L has expected chroma', () => {
      const lab = srgbByteToLab(255, 0, 0)
      expect(lab.L).toBeCloseTo(53.2, 0)
      const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b)
      expect(chroma).toBeGreaterThan(100)
    })

    it('sRGB blue byte → Lab has expected L and chroma', () => {
      const lab = srgbByteToLab(0, 0, 255)
      expect(lab.L).toBeCloseTo(32.3, 0)
      const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b)
      expect(chroma).toBeGreaterThan(100)
    })

    it('rgbToHex produces #-prefixed lowercase hex', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000')
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00')
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe('#0000ff')
      expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff')
    })

    it('mid gray (128,128,128) has near-zero a* and b* in Lab', () => {
      const lab = srgbByteToLab(128, 128, 128)
      expect(Math.abs(lab.a)).toBeLessThan(1)
      expect(Math.abs(lab.b)).toBeLessThan(1)
    })
  })
})
