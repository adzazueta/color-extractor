import { describe, it, expect } from 'vitest'
import {
  convertRgbSamplesToLab,
  type LabSample,
} from '../../src/core/sample.js'
import { srgbByteToLinear } from '../../src/core/color/srgb.js'
import { linearRgbToXyz } from '../../src/core/color/xyz.js'
import { xyzToLab } from '../../src/core/color/lab.js'
import type { Pixel } from '../../src/core/pixels.js'

function pixel(r: number, g: number, b: number, a: number = 255, index: number = 0): Pixel {
  return { index, r, g, b, a }
}

describe('convertRgbSamplesToLab', () => {
  describe('reference conversions', () => {
    it('mid-gray (128, 128, 128) → achromatic Lab (L≈53.6, a≈0, b≈0)', () => {
      const result = convertRgbSamplesToLab([pixel(128, 128, 128, 255, 0)])
      expect(result[0]!.lab.L).toBeCloseTo(53.6, 1)
      expect(result[0]!.lab.a).toBeCloseTo(0, 2)
      expect(result[0]!.lab.b).toBeCloseTo(0, 2)
    })

    it('preserves the original RGB alongside Lab', () => {
      const result = convertRgbSamplesToLab([pixel(200, 50, 50, 255, 0)])
      expect(result[0]!.rgb).toEqual({ r: 200, g: 50, b: 50 })
    })

    it('preserves the original index', () => {
      const result = convertRgbSamplesToLab([
        pixel(200, 50, 50, 255, 5),
        pixel(50, 200, 50, 255, 10),
        pixel(50, 50, 200, 255, 42),
      ])
      expect(result[0]!.index).toBe(5)
      expect(result[1]!.index).toBe(10)
      expect(result[2]!.index).toBe(42)
    })

    it('preserves RGB channels in the sample (alpha is not part of the RGB struct)', () => {
      const result = convertRgbSamplesToLab([pixel(128, 128, 128, 200, 0)])
      expect(result[0]!.rgb).toEqual({ r: 128, g: 128, b: 128 })
    })
  })

  describe('composition with color math helpers', () => {
    it('matches the manual chain: srgbToLinear → linearRgbToXyz → xyzToLab', () => {
      const samples: Array<[number, number, number]> = [
        [200, 50, 50],
        [50, 200, 50],
        [50, 50, 200],
        [128, 128, 128],
        [100, 150, 200],
      ]
      const pixels = samples.map(([r, g, b], i) => pixel(r, g, b, 255, i))
      const result = convertRgbSamplesToLab(pixels)

      for (let i = 0; i < samples.length; i++) {
        const [r, g, b] = samples[i]!
        const lr = srgbByteToLinear(r)
        const lg = srgbByteToLinear(g)
        const lb = srgbByteToLinear(b)
        const { x, y, z } = linearRgbToXyz(lr, lg, lb)
        const { L, a, b: bl } = xyzToLab(x, y, z)
        expect(result[i]!.lab.L).toBeCloseTo(L, 8)
        expect(result[i]!.lab.a).toBeCloseTo(a, 8)
        expect(result[i]!.lab.b).toBeCloseTo(bl, 8)
      }
    })
  })

  describe('achromatic property', () => {
    it('any R=G=B sample produces near-zero a and b (FP artifacts)', () => {
      const grays: Array<[number, number, number, number]> = [
        [0, 0, 0, 0],
        [50, 50, 50, 1],
        [128, 128, 128, 2],
        [200, 200, 200, 3],
        [240, 240, 240, 4],
      ]
      const result = convertRgbSamplesToLab(
        grays.map(([r, g, b, i]) => pixel(r, g, b, 255, i)),
      )
      for (let i = 0; i < grays.length; i++) {
        expect(result[i]!.lab.a).toBeCloseTo(0, 2)
        expect(result[i]!.lab.b).toBeCloseTo(0, 2)
      }
    })
  })

  describe('LabSample shape', () => {
    it('returned object has rgb, lab, index keys', () => {
      const result = convertRgbSamplesToLab([pixel(128, 128, 128, 255, 7)])
      expect(Object.keys(result[0]!).sort()).toEqual(['index', 'lab', 'rgb'])
      expect(Object.keys(result[0]!.rgb).sort()).toEqual(['b', 'g', 'r'])
      expect(Object.keys(result[0]!.lab).sort()).toEqual(['L', 'a', 'b'])
    })
  })

  describe('edge cases', () => {
    it('empty input returns empty output', () => {
      const result = convertRgbSamplesToLab([])
      expect(result).toEqual([])
    })

    it('handles large arrays without performance issues', () => {
      const pixels: Pixel[] = []
      for (let i = 0; i < 22500; i++) {
        pixels.push(pixel(200, 50, 50, 255, i))
      }
      const start = performance.now()
      const result = convertRgbSamplesToLab(pixels)
      const elapsed = performance.now() - start
      expect(result.length).toBe(22500)
      expect(elapsed).toBeLessThan(2000)
    })
  })

  describe('AC: every valid RGB sample has a corresponding Lab sample', () => {
    it('1:1 mapping between input and output', () => {
      const inputs: Pixel[] = []
      for (let i = 0; i < 100; i++) {
        const r = (i * 7) % 256
        const g = (i * 11) % 256
        const b = (i * 13) % 256
        inputs.push(pixel(r, g, b, 255, i))
      }
      const result = convertRgbSamplesToLab(inputs)
      expect(result.length).toBe(inputs.length)
      for (let i = 0; i < inputs.length; i++) {
        expect(result[i]!.index).toBe(inputs[i]!.index)
        expect(result[i]!.rgb.r).toBe(inputs[i]!.r)
        expect(result[i]!.rgb.g).toBe(inputs[i]!.g)
        expect(result[i]!.rgb.b).toBe(inputs[i]!.b)
        expect(typeof result[i]!.lab.L).toBe('number')
        expect(typeof result[i]!.lab.a).toBe('number')
        expect(typeof result[i]!.lab.b).toBe('number')
      }
    })
  })
})
