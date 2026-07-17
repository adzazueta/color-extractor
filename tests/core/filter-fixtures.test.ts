import { describe, it, expect } from 'vitest'
import { normalizePixels } from '../../src/core/pixels.js'
import { sampleSquareGrid } from '../../src/core/sample.js'
import { filterPixels, passesFilter } from '../../src/core/filter.js'
import { resolveOptions } from '../../src/core/defaults.js'
import { FIXTURES } from './fixtures.js'

describe('filtering with synthetic fixtures (ADZ-78)', () => {
  describe('AC: transparent pixels are filtered', () => {
    it('transparent fixture produces no valid pixels with default filter', () => {
      const opts = resolveOptions()
      const f = FIXTURES.transparent
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      const filtered = filterPixels(normalized, criteria)
      expect(filtered).toHaveLength(0)
    })

    it('semiTransparent fixture (alpha=64) is filtered below default alphaThreshold=128', () => {
      const opts = resolveOptions()
      const f = FIXTURES.semiTransparent
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      const filtered = filterPixels(normalized, criteria)
      expect(filtered).toHaveLength(0)
    })

    it('mostlyTransparent fixture has no valid pixels (all alpha=0 even if some are red)', () => {
      const opts = resolveOptions()
      const f = FIXTURES.mostlyTransparent
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      const filtered = filterPixels(normalized, criteria)
      expect(filtered).toHaveLength(0)
    })
  })

  describe('AC: near-black and near-white pixels are filtered', () => {
    it('monochrome gradient produces no valid pixels (gray = zero saturation)', () => {
      const opts = resolveOptions()
      const f = FIXTURES.monochrome
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      const filtered = filterPixels(normalized, criteria)
      expect(filtered).toHaveLength(0)
    })

    it('black fixture pixel (10,10,10) fails individual passesFilter (s=0)', () => {
      const pixel = { index: 0, r: 10, g: 10, b: 10, a: 255 }
      const opts = resolveOptions()
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      expect(passesFilter(pixel, criteria)).toBe(false)
    })

    it('white fixture pixel (244,244,244) is filtered (s=0)', () => {
      const pixel = { index: 0, r: 244, g: 244, b: 244, a: 255 }
      const opts = resolveOptions()
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      expect(passesFilter(pixel, criteria)).toBe(false)
    })
  })

  describe('AC: valid saturated pixels remain', () => {
    it('bicolorRedBlue fixture has valid pixels', () => {
      const opts = resolveOptions()
      const f = FIXTURES.bicolorRedBlue
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      const filtered = filterPixels(normalized, criteria)
      expect(filtered.length).toBeGreaterThan(0)
    })

    it('rainbowPalette fixture has valid pixels across all blocks', () => {
      const opts = resolveOptions()
      const f = FIXTURES.rainbowPalette
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
      }
      const filtered = filterPixels(normalized, criteria)
      expect(filtered.length).toBeGreaterThan(0)
      const uniqueColors = new Set(filtered.map((p) => `${p.r},${p.g},${p.b}`))
      expect(uniqueColors.size).toBeGreaterThan(1)
    })
  })

  describe('AC: custom filter criteria accept or reject as configured', () => {
    it('relaxed criteria allow almost all pixels through', () => {
      const f = FIXTURES.monochrome
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const relaxed = { alphaThreshold: 0, minBrightness: 0, maxBrightness: 255, minSaturation: 0 }
      const filtered = filterPixels(normalized, relaxed)
      expect(filtered.length).toBeGreaterThan(0)
    })

    it('zero minSaturation and zero alphaThreshold let all pixels through', () => {
      const f = FIXTURES.bicolorRedBlue
      const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
      const relaxed = { alphaThreshold: 0, minBrightness: 0, maxBrightness: 255, minSaturation: 0 }
      const filtered = filterPixels(normalized, relaxed)
      const total = normalized.width * normalized.height
      expect(filtered.length).toBe(total)
    })
  })
})
