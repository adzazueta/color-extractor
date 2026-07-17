import { describe, it, expect } from 'vitest'
import { FIXTURES } from './fixtures.js'

describe('FIXTURES (ADZ-77)', () => {
  describe('AC: fixtures are generated or stored deterministically', () => {
    it('all fixtures are PixelInput objects with data, width, height', () => {
      for (const [name, fixture] of Object.entries(FIXTURES)) {
        expect(fixture).toHaveProperty('data')
        expect(fixture).toHaveProperty('width')
        expect(fixture).toHaveProperty('height')
        expect(fixture.width).toBeGreaterThan(0)
        expect(fixture.height).toBeGreaterThan(0)
        expect(fixture.data.length).toBe(fixture.width * fixture.height * 4)
      }
    })

    it('repeat access returns the same pixel values (stable)', () => {
      const a = FIXTURES.red.data
      const b = FIXTURES.red.data
      expect(a).toBe(b)
    })
  })

  describe('AC: fixtures are small and fast', () => {
    it('each fixture is under 64KB', () => {
      for (const [name, fixture] of Object.entries(FIXTURES)) {
        expect(fixture.data.length).toBeLessThan(64 * 1024)
      }
    })

    it('max dimensions are 50x50', () => {
      for (const [name, fixture] of Object.entries(FIXTURES)) {
        expect(fixture.width * fixture.height).toBeLessThanOrEqual(2500)
      }
    })
  })

  describe('individual fixture properties', () => {
    it('bicolorRedBlue has two distinct colors', () => {
      const { data } = FIXTURES.bicolorRedBlue
      const half = data.length / 4 / 2
      const firstR = data[0]
      const lastR = data[(data.length / 4 - 1) * 4]
      expect(firstR).not.toBe(lastR)
    })

    it('transparent has alpha 0', () => {
      const { data } = FIXTURES.transparent
      for (let i = 3; i < data.length; i += 4) {
        expect(data[i]).toBe(0)
      }
    })

    it('mutedPlusVivid has 75% muted and 25% vivid pixels', () => {
      const { data, width, height } = FIXTURES.mutedPlusVivid
      const total = width * height
      const mutedCount = Math.floor(total * 0.75)
      const firstVividIdx = mutedCount * 4
      expect(data[firstVividIdx]).toBe(220)
      expect(data[firstVividIdx + 1]).toBe(20)
      expect(data[firstVividIdx + 2]).toBe(60)
    })

    it('monochrome has a full gray gradient', () => {
      const { data, width, height } = FIXTURES.monochrome
      const total = width * height
      expect(data[0]).toBe(0)
      expect(data[1]).toBe(0)
      expect(data[2]).toBe(0)
      const lastOffset = (total - 1) * 4
      expect(data[lastOffset]).toBe(255)
      expect(data[lastOffset + 1]).toBe(255)
      expect(data[lastOffset + 2]).toBe(255)
    })

    it('rainbowPalette contains 10 distinct color blocks', () => {
      const { data, width, height } = FIXTURES.rainbowPalette
      const total = width * height
      const blockSize = Math.floor(total / 10)
      const colors = new Set<number>()
      for (let i = 0; i < total; i += blockSize) {
        const o = i * 4
        colors.add((data[o]! << 16) | (data[o + 1]! << 8) | data[o + 2]!)
      }
      expect(colors.size).toBe(10)
    })
  })
})
