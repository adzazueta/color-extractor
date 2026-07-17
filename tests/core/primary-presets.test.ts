import { describe, it, expect } from 'vitest'
import { kmeans, buildClusters } from '../../src/core/kmeans.js'
import { normalizePixels } from '../../src/core/pixels.js'
import { sampleSquareGrid, convertRgbSamplesToLab } from '../../src/core/sample.js'
import { findPrimaryIndex, scorePrimary } from '../../src/core/index.js'
import { passesFilter } from '../../src/core/filter.js'
import { resolveOptions } from '../../src/core/defaults.js'
import { FIXTURES } from './fixtures.js'

function clustersFromFixture(
  fixtureKey: keyof typeof FIXTURES,
  k: number,
): ReturnType<typeof buildClusters> {
  const f = FIXTURES[fixtureKey]
  const opts = resolveOptions()
  const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height)
  const sampled = sampleSquareGrid(normalized, opts.sampleSize)
  const criteria = {
    alphaThreshold: opts.filtering.alphaThreshold!,
    minBrightness: opts.filtering.minBrightness!,
    maxBrightness: opts.filtering.maxBrightness!,
    minSaturation: opts.filtering.minSaturation!,
  }
  const validSamples = sampled.filter((p) => passesFilter(p, criteria))
  const labs = convertRgbSamplesToLab(validSamples)
  const kResult = kmeans(labs, { clusters: Math.min(k, labs.length), iterations: opts.kmeans.iterations! })
  return buildClusters(labs, kResult)
}

describe('primary presets with synthetic fixtures (ADZ-90)', () => {
  describe('AC: strict can select a smaller vivid cluster', () => {
    it('mutedPlusVivid fixture: strict picks the vivid minority over the muted majority', () => {
      const clusters = clustersFromFixture('mutedPlusVivid', 2)
      const idx = findPrimaryIndex(clusters, 'strict')
      expect(idx).not.toBe(-1)
      const c = clusters[idx]!
      expect(c.chroma).toBeGreaterThan(10)
    })
  })

  describe('AC: dominant selects the largest cluster', () => {
    it('mutedPlusVivid fixture: dominant picks the muted majority over the vivid minority', () => {
      const clusters = clustersFromFixture('mutedPlusVivid', 2)
      const idx = findPrimaryIndex(clusters, 'dominant')
      expect(idx).not.toBe(-1)
      const c = clusters[idx]!
      expect(c.population).toBeGreaterThan(clusters[1 - idx]!.population)
    })

    it('bicolorRedBlue fixture: dominant picks the first block (half/half tie goes to first)', () => {
      const clusters = clustersFromFixture('bicolorRedBlue', 2)
      const idx = findPrimaryIndex(clusters, 'dominant')
      expect(idx).not.toBe(-1)
    })
  })

  describe('AC: vibrant stronger chroma preference', () => {
    it('vibrant score gap between high and low chroma exceeds strict gap', () => {
      const clusters = clustersFromFixture('mutedPlusVivid', 2)
      const scores = (preset: 'strict' | 'balanced' | 'vibrant') =>
        clusters.map((c) => scorePrimary(c, preset))
      const strictGap = Math.abs(scores('strict')[0]! - scores('strict')[1]!)
      const vibrantGap = Math.abs(scores('vibrant')[0]! - scores('vibrant')[1]!)
      expect(vibrantGap).toBeGreaterThan(strictGap)
    })

    it('vibrant picks the same cluster as strict on mutedPlusVivid', () => {
      const clusters = clustersFromFixture('mutedPlusVivid', 2)
      expect(findPrimaryIndex(clusters, 'vibrant')).toBe(findPrimaryIndex(clusters, 'strict'))
    })
  })

  describe('AC: balanced intermediate behavior', () => {
    it('balanced score gap sits between strict and vibrant', () => {
      const clusters = clustersFromFixture('mutedPlusVivid', 2)
      const scores = (preset: 'strict' | 'balanced' | 'vibrant') =>
        clusters.map((c) => scorePrimary(c, preset))
      const strictGap = Math.abs(scores('strict')[0]! - scores('strict')[1]!)
      const balancedGap = Math.abs(scores('balanced')[0]! - scores('balanced')[1]!)
      const vibrantGap = Math.abs(scores('vibrant')[0]! - scores('vibrant')[1]!)
      expect(balancedGap).toBeGreaterThan(strictGap)
      expect(vibrantGap).toBeGreaterThan(balancedGap)
    })
  })

  describe('AC: presets are deterministic', () => {
    it('two identical runs with strict produce the same primary index', () => {
      const clustersA = clustersFromFixture('rainbowPalette', 5)
      const clustersB = clustersFromFixture('rainbowPalette', 5)
      expect(findPrimaryIndex(clustersA, 'strict')).toBe(findPrimaryIndex(clustersB, 'strict'))
    })

    it('two identical runs with dominant produce the same primary index', () => {
      const clustersA = clustersFromFixture('rainbowPalette', 5)
      const clustersB = clustersFromFixture('rainbowPalette', 5)
      expect(findPrimaryIndex(clustersA, 'dominant')).toBe(findPrimaryIndex(clustersB, 'dominant'))
    })
  })
})
