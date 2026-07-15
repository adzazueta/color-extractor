import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { normalizePixels } from '../../src/core/pixels.js'

function expectUnsupportedInput(fn: () => unknown): void {
  try {
    fn()
    expect.fail('expected normalizePixels to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError)
    expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
  }
}

function makeRgba(w: number, h: number, fill: number = 128): Uint8Array {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill
    data[i + 1] = fill
    data[i + 2] = fill
    data[i + 3] = 255
  }
  return data
}

function makeRgb(w: number, h: number, fill: number = 128): Uint8Array {
  const data = new Uint8Array(w * h * 3)
  for (let i = 0; i < data.length; i += 3) {
    data[i] = fill
    data[i + 1] = fill
    data[i + 2] = fill
  }
  return data
}

describe('normalizePixels', () => {
  describe('valid inputs', () => {
    it('accepts 10x10 RGBA (400 bytes, 4 channels)', () => {
      const data = makeRgba(10, 10)
      const result = normalizePixels(data, 10, 10)
      expect(result.width).toBe(10)
      expect(result.height).toBe(10)
      expect(result.channels).toBe(4)
    })

    it('accepts 10x10 RGB (300 bytes, 3 channels explicit)', () => {
      const data = makeRgb(10, 10)
      const result = normalizePixels(data, 10, 10, 3)
      expect(result.width).toBe(10)
      expect(result.height).toBe(10)
      expect(result.channels).toBe(3)
    })

    it('accepts 1x1 single pixel RGBA', () => {
      const data = new Uint8Array([255, 0, 0, 200])
      const result = normalizePixels(data, 1, 1)
      expect(result.width).toBe(1)
      expect(result.height).toBe(1)
    })

    it('accepts 1x1 single pixel RGB', () => {
      const data = new Uint8Array([255, 0, 0])
      const result = normalizePixels(data, 1, 1, 3)
      expect(result.width).toBe(1)
      expect(result.height).toBe(1)
    })

    it('accepts Uint8ClampedArray', () => {
      const data = new Uint8ClampedArray(400)
      const result = normalizePixels(data, 10, 10)
      expect(result.data).toBe(data)
    })

    it('exposes the data reference (no copy)', () => {
      const data = makeRgba(5, 5)
      const result = normalizePixels(data, 5, 5)
      expect(result.data).toBe(data)
    })
  })

  describe('width validation', () => {
    it('throws for width = 0', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), 0, 1))
    })

    it('throws for negative width', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), -1, 1))
    })

    it('throws for non-integer width', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), 1.5, 1))
    })

    it('throws for NaN width', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), Number.NaN, 1))
    })

    it('throws for Infinity width', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), Number.POSITIVE_INFINITY, 1))
    })
  })

  describe('height validation', () => {
    it('throws for height = 0', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), 1, 0))
    })

    it('throws for negative height', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), 1, -1))
    })

    it('throws for non-integer height', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(0), 1, 2.5))
    })
  })

  describe('channels validation', () => {
    it('throws for channels = 0', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(300), 10, 10, 0))
    })

    it('throws for channels = 1 (grayscale not supported)', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(100), 10, 10, 1))
    })

    it('throws for channels = 2', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(200), 10, 10, 2))
    })

    it('throws for channels = 5', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(500), 10, 10, 5))
    })
  })

  describe('data length validation', () => {
    it('throws for data too short (RGBA)', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(40), 10, 10))
    })

    it('throws for data too long (RGBA)', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(404), 10, 10))
    })

    it('throws for data too short (RGB)', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(30), 10, 10, 3))
    })

    it('throws for 3-channel data with 4-channel size', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(400), 10, 10, 3))
    })

    it('throws for 4-channel data with 3-channel size', () => {
      expectUnsupportedInput(() => normalizePixels(new Uint8Array(300), 10, 10, 4))
    })

    it('error message is actionable', () => {
      try {
        normalizePixels(new Uint8Array(40), 10, 10)
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('length')
        expect(message).toContain('width')
        expect(message).toContain('height')
        expect(message).toContain('channels')
      }
    })
  })

  describe('iterator — RGBA', () => {
    it('yields width * height pixels', () => {
      const data = makeRgba(5, 4)
      const result = normalizePixels(data, 5, 4)
      const pixels = [...result]
      expect(pixels.length).toBe(20)
    })

    it('indices are sequential from 0 to width*height-1', () => {
      const data = makeRgba(3, 2)
      const result = normalizePixels(data, 3, 2)
      const pixels = [...result]
      expect(pixels.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5])
    })

    it('preserves byte values per channel', () => {
      const data = new Uint8Array(12)
      data.set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])
      const result = normalizePixels(data, 1, 3)
      const pixels = [...result]
      expect(pixels[0]).toEqual({ index: 0, r: 10, g: 20, b: 30, a: 40 })
      expect(pixels[1]).toEqual({ index: 1, r: 50, g: 60, b: 70, a: 80 })
      expect(pixels[2]).toEqual({ index: 2, r: 90, g: 100, b: 110, a: 120 })
    })

    it('works with for...of', () => {
      const data = makeRgba(3, 3)
      const result = normalizePixels(data, 3, 3)
      let count = 0
      for (const p of result) {
        expect(p.r).toBe(128)
        expect(p.g).toBe(128)
        expect(p.b).toBe(128)
        expect(p.a).toBe(255)
        count++
      }
      expect(count).toBe(9)
    })
  })

  describe('iterator — RGB', () => {
    it('alpha defaults to 255 for 3-channel input', () => {
      const data = new Uint8Array(3)
      data.set([10, 20, 30])
      const result = normalizePixels(data, 1, 1, 3)
      const pixels = [...result]
      expect(pixels[0]!.a).toBe(255)
    })

    it('preserves RGB byte values', () => {
      const data = new Uint8Array([10, 20, 30, 40, 50, 60])
      const result = normalizePixels(data, 2, 1, 3)
      const pixels = [...result]
      expect(pixels[0]).toEqual({ index: 0, r: 10, g: 20, b: 30, a: 255 })
      expect(pixels[1]).toEqual({ index: 1, r: 40, g: 50, b: 60, a: 255 })
    })
  })

  describe('determinism', () => {
    it('same input produces same iteration order', () => {
      const data = makeRgba(4, 4, 100)
      const a = [...normalizePixels(data, 4, 4)]
      const b = [...normalizePixels(data, 4, 4)]
      expect(a).toEqual(b)
    })
  })

  describe('core API surface', () => {
    it('no DOM or Node API dependencies', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(new URL('../../src/core/pixels.ts', import.meta.url), 'utf-8')
      expect(src).not.toMatch(/\bFile\b/)
      expect(src).not.toMatch(/\bBlob\b/)
      expect(src).not.toMatch(/\bBuffer\b/)
      expect(src).not.toMatch(/\bHTMLCanvas\b/)
      expect(src).not.toMatch(/\bImageData\b/)
    })
  })
})
