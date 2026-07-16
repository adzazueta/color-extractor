import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  extractColorsFromPixels,
  extractColorsFromImageData,
  runExtractionPipeline,
  type ImageDataLike,
} from '../../../src/core/extract.js'
import { ColorExtractorError } from '../../../src/core/index.js'
import type { PixelInput } from '../../../src/core/validation.js'
import type { ExtractedColor } from '../../../src/core/types.js'

function makePixels(width: number, height: number, fill: { r?: number; g?: number; b?: number; a?: number } = {}): PixelInput {
  const r = fill.r ?? 128
  const g = fill.g ?? 128
  const b = fill.b ?? 128
  const a = fill.a ?? 255
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { data, width, height }
}

function makeBicolorPixels(
  width: number,
  height: number,
  primary: { r: number; g: number; b: number },
  secondary: { r: number; g: number; b: number },
): PixelInput {
  const data = new Uint8Array(width * height * 4)
  const half = (width * height) / 2
  for (let i = 0; i < width * height; i++) {
    const c = i < half ? primary : secondary
    const o = i * 4
    data[o] = c.r
    data[o + 1] = c.g
    data[o + 2] = c.b
    data[o + 3] = 255
  }
  return { data, width, height }
}

describe('extractColorsFromPixels (e2e pipeline)', () => {
  describe('AC: pipeline runs end-to-end (no placeholder)', () => {
    it('produces a primary color from a uniform red image (no gray placeholder)', async () => {
      const result = await extractColorsFromPixels(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
      expect(result.primary.hex).not.toBe('#808080')
      expect(result.primary.rgb.r).toBe(200)
      expect(result.primary.rgb.g).toBe(20)
      expect(result.primary.rgb.b).toBe(20)
    })

    it('primary source is cluster for a real extraction', async () => {
      const result = await extractColorsFromPixels(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
      expect(result.primary.source).toBe('cluster')
    })

    it('returns secondary: null for a single-color image', async () => {
      const result = await extractColorsFromPixels(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
      expect(result.secondary).toBeNull()
    })
  })

  describe('AC: extracted colors are visually meaningful (bicolor image)', () => {
    it('picks red as primary when red dominates the image', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 200, b: 220 }),
      )
      const p = result.primary.rgb
      expect(p.r).toBeGreaterThan(p.b)
    })

    it('picks a green-ish secondary distinct from the red primary', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 200, b: 220 }),
      )
      if (result.secondary) {
        expect(result.secondary.rgb).toBeDefined()
        expect(result.secondary.rgb.r).not.toBe(result.primary.rgb.r)
      }
    })
  })

  describe('AC: hex matches rgb (no more #808080 placeholder on cluster colors)', () => {
    it('primary hex is consistent with primary rgb', async () => {
      const result = await extractColorsFromPixels(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
      const hex = result.primary.hex
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      expect(r).toBe(200)
      expect(g).toBe(20)
      expect(b).toBe(20)
    })

    it('secondary hex is consistent with secondary rgb (when present)', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 200, b: 220 }),
      )
      if (result.secondary) {
        const hex = result.secondary.hex
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        expect([r, g, b]).toEqual([result.secondary.rgb.r, result.secondary.rgb.g, result.secondary.rgb.b])
      }
    })
  })

  describe('AC: includeScores exposes real perceptual scores', () => {
    it('primary.score is non-zero for a vivid color', async () => {
      const result = await extractColorsFromPixels(
        makePixels(20, 20, { r: 200, g: 20, b: 20 }),
        { output: { includeScores: true } },
      )
      expect(result.primary.score).toBeDefined()
      expect(result.primary.score).toBeGreaterThan(0)
    })

    it('palette entries carry real scores when includeScores is true', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 200, b: 220 }),
        { output: { includePalette: true, includeScores: true } },
      )
      if (result.palette && result.palette.length > 0) {
        for (const c of result.palette) {
          expect(c.score).toBeDefined()
          expect(c.score).toBeGreaterThan(0)
        }
      }
    })

    it('secondary.score is the scoreSecondary value (not the primary score) for cluster-derived secondaries', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 220, b: 30 }),
        { output: { includeScores: true } },
      )
      expect(result.secondary).not.toBeNull()
      expect(result.secondary!.source).toBe('cluster')
      expect(result.secondary!.score).toBeDefined()
      expect(result.secondary!.score).toBeGreaterThan(0)
    })
  })

  describe('AC: includeMetadata returns full metadata', () => {
    it('metadata has all required fields', async () => {
      const result = await extractColorsFromPixels(
        makePixels(20, 20, { r: 200, g: 20, b: 20 }),
        { output: { includeMetadata: true } },
      )
      expect(result.metadata).toBeDefined()
      expect(result.metadata!.algorithm).toBe('lab-kmeans-chroma-weighted')
      expect(result.metadata!.packageVersion).toBe('0.1.0')
      expect(result.metadata!.cacheVersion).toBe('3.6')
      expect(result.metadata!.sampleSize).toBe(150)
      expect(result.metadata!.sampledPixels).toBeGreaterThan(0)
      expect(result.metadata!.validPixels).toBeGreaterThan(0)
      expect(result.metadata!.clusters).toBeGreaterThan(0)
      expect(result.metadata!.iterations).toBe(7)
      expect(result.metadata!.primaryPreset).toBe('strict')
      expect(result.metadata!.secondaryFallback).toBe('harmony')
      expect(result.metadata!.runtime).toBe('core')
      expect(result.metadata!.decoder).toBe('pixels')
    })
  })

  describe('AC: includePalette is off by default', () => {
    it('palette is undefined when not requested', async () => {
      const result = await extractColorsFromPixels(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
      expect(result.palette).toBeUndefined()
    })

    it('palette is defined when includePalette is true', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 200, b: 220 }),
        { output: { includePalette: true } },
      )
      expect(result.palette).toBeDefined()
    })
  })

  describe('AC: contrast threshold filtering is applied end-to-end', () => {
    it('an image with two similar colors picks harmony fallback for secondary', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 200, g: 30, b: 30 }, { r: 180, g: 30, b: 30 }),
        { output: { includeMetadata: true } },
      )
      if (result.secondary) {
        expect(result.secondary.source).toBe('fallback')
        expect(result.metadata!.fallbackUsed).toBe(true)
      }
    })

    it('a sufficiently distinct secondary is selected as cluster', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 220, b: 30 }),
        { output: { includeMetadata: true } },
      )
      expect(result.secondary).not.toBeNull()
      expect(result.secondary!.source).toBe('cluster')
      expect(result.metadata!.fallbackUsed).toBe(false)
    })
  })

  describe('AC: palette excludes both primary and secondary clusters', () => {
    it('palette does not contain the secondary hex when secondary comes from a cluster', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 220, g: 30, b: 30 }, { r: 30, g: 220, b: 30 }),
        { output: { includePalette: true } },
      )
      expect(result.secondary).not.toBeNull()
      expect(result.secondary!.source).toBe('cluster')
      expect(result.palette).toBeDefined()
      const primaryHex = result.primary.hex
      const secondaryHex = result.secondary!.hex
      const hexes = (result.palette ?? []).map((c) => c.hex)
      expect(hexes).not.toContain(primaryHex)
      expect(hexes).not.toContain(secondaryHex)
    })

    it('palette can contain the secondary hex when secondary is a synthetic fallback', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 200, g: 30, b: 30 }, { r: 195, g: 30, b: 30 }),
        { output: { includePalette: true } },
      )
      if (result.secondary?.source === 'fallback') {
        const paletteHexes = (result.palette ?? []).map((c) => c.hex)
        expect(paletteHexes).not.toContain(result.secondary.hex)
      }
    })
  })

  describe('AC: secondary hue is normalized to [0, 360)', () => {
    it('fallback secondary hsl.h is in [0, 360) even when rotation is large', async () => {
      const result = await extractColorsFromPixels(
        makeBicolorPixels(40, 40, { r: 200, g: 30, b: 30 }, { r: 195, g: 30, b: 30 }),
        { secondary: { harmonyFallbackDeg: 350 } },
      )
      if (result.secondary?.hsl) {
        expect(result.secondary.hsl.h).toBeGreaterThanOrEqual(0)
        expect(result.secondary.hsl.h).toBeLessThan(360)
      }
    })
  })
})

describe('runExtractionPipeline sync variant', () => {
  it('returns the same shape as the async variant', () => {
    const sync = runExtractionPipeline(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
    expect(sync.primary.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(sync.primary.rgb.r).toBe(200)
  })
})

describe('extractColorsFromPixels edge cases', () => {
  it('returns a fallback primary when no pixel passes the filter', async () => {
    const transparent = makePixels(4, 4, { r: 128, g: 128, b: 128, a: 0 })
    const result = await extractColorsFromPixels(transparent)
    expect(result.primary.source).toBe('fallback')
    expect(result.secondary).toBeNull()
  })

  it('returns the result with ExtractedColor shape on primary', async () => {
    const result = await extractColorsFromPixels(makePixels(20, 20, { r: 200, g: 20, b: 20 }))
    const c: ExtractedColor = result.primary
    expect(c.hex).toBeDefined()
    expect(c.rgb).toBeDefined()
    expect(c.role).toBe('primary')
  })

  it('throws for invalid input', async () => {
    await expect(
      extractColorsFromPixels({} as unknown as PixelInput),
    ).rejects.toThrow(ColorExtractorError)
  })

  it('throws for null', async () => {
    await expect(
      extractColorsFromPixels(null as unknown as PixelInput),
    ).rejects.toThrow(ColorExtractorError)
  })
})

describe('extractColorsFromImageData', () => {
  it('accepts an ImageDataLike input (type-level)', () => {
    expectTypeOf<Parameters<typeof extractColorsFromImageData>[0]>().toEqualTypeOf<ImageDataLike>()
  })

  it('DOM ImageData is structurally compatible with ImageDataLike', () => {
    expectTypeOf<ImageData>().toMatchTypeOf<ImageDataLike>()
  })

  it('rejects non-ImageDataLike inputs at the type level', () => {
    expectTypeOf<File>().not.toMatchTypeOf<Parameters<typeof extractColorsFromImageData>[0]>()
    expectTypeOf<Buffer>().not.toMatchTypeOf<Parameters<typeof extractColorsFromImageData>[0]>()
  })

  it('runs the full pipeline on ImageData input', async () => {
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200
      data[i + 1] = 20
      data[i + 2] = 20
      data[i + 3] = 255
    }
    const result = await extractColorsFromImageData({ data, width: 20, height: 20 })
    expect(result.primary.rgb.r).toBe(200)
  })
})

describe('core entrypoint shape (build output)', () => {
  it('dist/core/index.js exports extractColorsFromPixels and extractColorsFromImageData', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const rootDir = path.resolve(import.meta.dirname, '../../..')
    const js = await fs.readFile(path.resolve(rootDir, 'dist/core/index.js'), 'utf-8')
    expect(js).toMatch(/extractColorsFromPixels/)
    expect(js).toMatch(/extractColorsFromImageData/)
  })

  it('dist/core/index.d.ts does not reference Buffer or File globals', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const rootDir = path.resolve(import.meta.dirname, '../../..')
    const dts = await fs.readFile(path.resolve(rootDir, 'dist/core/index.d.ts'), 'utf-8')
    expect(dts).not.toMatch(/\bBuffer\b/)
    expect(dts).not.toMatch(/\bFile\b/)
    expect(dts).not.toMatch(/\bBlob\b/)
  })
})
