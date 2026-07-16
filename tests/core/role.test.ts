import { describe, it, expect } from 'vitest'
import {
  scorePrimary,
  findPrimaryIndex,
  buildPrimaryColor,
  applyGrayPenalty,
  isLowChromaCandidate,
} from '../../src/core/role.js'
import type { Cluster } from '../../src/core/kmeans.js'
import { DEFAULT_OPTIONS, type ResolvedOptions } from '../../src/core/defaults.js'

function cluster(
  chroma: number,
  population: number,
  proportion: number,
): Cluster {
  return {
    index: 0,
    lab: { L: 50, a: chroma, b: 0 },
    rgb: { r: 128, g: 128, b: 128 },
    hsl: { h: 0, s: 0, l: 50 },
    population,
    proportion,
    chroma,
    score: 0,
  }
}

describe('scorePrimary (ADZ-44)', () => {
  describe('AC: strict primary prefers vivid perceptual dominance', () => {
    it('a smaller high-chroma cluster beats a larger muted cluster', () => {
      const muted = cluster(5, 1000, 0.8)
      const vivid = cluster(40, 10, 0.1)
      expect(scorePrimary(vivid)).toBeGreaterThan(scorePrimary(muted))
    })

    it('uses chroma * log(population + 1)', () => {
      const c = cluster(20, 99, 0.5)
      const expected = 20 * Math.log(100)
      expect(scorePrimary(c)).toBeCloseTo(expected, 10)
    })

    it('returns 0 for a cluster with population 0 and chroma 0', () => {
      expect(scorePrimary(cluster(0, 0, 0))).toBe(0)
    })
  })
})

describe('findPrimaryIndex (ADZ-44)', () => {
  describe('AC: selects the highest-scoring cluster as primary', () => {
    it('returns the index of the highest strict score', () => {
      const a = cluster(5, 1000, 0.8)
      const b = cluster(40, 10, 0.1)
      const c = cluster(15, 200, 0.1)
      expect(findPrimaryIndex([a, b, c])).toBe(1)
    })

    it('returns 0 when only one cluster is provided', () => {
      expect(findPrimaryIndex([cluster(10, 100, 1)])).toBe(0)
    })

    it('returns -1 when no clusters are provided', () => {
      expect(findPrimaryIndex([])).toBe(-1)
    })

    it('breaks ties to the earlier index (stable)', () => {
      const a = cluster(10, 99, 0.5)
      const b = cluster(10, 99, 0.5)
      expect(findPrimaryIndex([a, b])).toBe(0)
    })
  })
})

describe('buildPrimaryColor (ADZ-44)', () => {
  describe('AC: store score when output flags request it', () => {
    it('marks the color as primary with role=primary and source=cluster', () => {
      const c = cluster(30, 50, 0.25)
      const color = buildPrimaryColor(c)
      expect(color.role).toBe('primary')
      expect(color.source).toBe('cluster')
      expect(color.chroma).toBe(30)
      expect(color.population).toBe(50)
      expect(color.proportion).toBe(0.25)
    })

    it('forwards lab, rgb, and hsl from the cluster', () => {
      const c: Cluster = {
        index: 0,
        lab: { L: 40, a: 20, b: -10 },
        rgb: { r: 200, g: 100, b: 50 },
        hsl: { h: 30, s: 80, l: 50 },
        population: 10,
        proportion: 0.5,
        chroma: 25,
        score: 0,
      }
      const color = buildPrimaryColor(c)
      expect(color.lab).toEqual({ L: 40, a: 20, b: -10 })
      expect(color.rgb).toEqual({ r: 200, g: 100, b: 50 })
      expect(color.hsl).toEqual({ h: 30, s: 80, l: 50 })
    })
  })
})

describe('scorePrimary presets (ADZ-39)', () => {
  describe('AC: each preset produces deterministic scores', () => {
    it('balanced uses chroma^1.25 * log(pop+1)', () => {
      const c = cluster(20, 99, 0.5)
      const expected = Math.pow(20, 1.25) * Math.log(100)
      expect(scorePrimary(c, 'balanced')).toBeCloseTo(expected, 10)
    })

    it('vibrant uses chroma^1.75 * log(pop+1)', () => {
      const c = cluster(20, 99, 0.5)
      const expected = Math.pow(20, 1.75) * Math.log(100)
      expect(scorePrimary(c, 'vibrant')).toBeCloseTo(expected, 10)
    })

    it('dominant returns raw population (chroma is ignored)', () => {
      const lowChromaHighPop = cluster(2, 500, 0.5)
      const highChromaLowPop = cluster(80, 50, 0.5)
      expect(scorePrimary(lowChromaHighPop, 'dominant')).toBe(500)
      expect(scorePrimary(highChromaLowPop, 'dominant')).toBe(50)
    })
  })

  describe('AC: dominant selects by population', () => {
    it('findPrimaryIndex with dominant picks the highest-population cluster regardless of chroma', () => {
      const a = cluster(5, 10, 0.05)
      const b = cluster(50, 8, 0.04)
      const c = cluster(80, 1, 0.01)
      expect(findPrimaryIndex([a, b, c], 'dominant')).toBe(0)
    })
  })

  describe('AC: vibrant favors high-chroma clusters more strongly than strict', () => {
    it('on identical populations, vibrant gives a larger boost to high chroma than strict', () => {
      const a = cluster(10, 100, 0.5)
      const b = cluster(40, 100, 0.5)
      const strictGap = scorePrimary(b, 'strict') - scorePrimary(a, 'strict')
      const vibrantGap = scorePrimary(b, 'vibrant') - scorePrimary(a, 'vibrant')
      expect(vibrantGap).toBeGreaterThan(strictGap)
    })

    it('balanced gives a stronger chroma preference than strict but milder than vibrant', () => {
      const a = cluster(10, 100, 0.5)
      const b = cluster(40, 100, 0.5)
      const strictGap = scorePrimary(b, 'strict') - scorePrimary(a, 'strict')
      const balancedGap = scorePrimary(b, 'balanced') - scorePrimary(a, 'balanced')
      const vibrantGap = scorePrimary(b, 'vibrant') - scorePrimary(a, 'vibrant')
      expect(balancedGap).toBeGreaterThan(strictGap)
      expect(vibrantGap).toBeGreaterThan(balancedGap)
    })
  })

  describe('AC: preset selection is configurable', () => {
    it('findPrimaryIndex with vibrant can prefer smaller high-chroma over larger muted', () => {
      const muted = cluster(5, 1000, 0.8)
      const vivid = cluster(40, 10, 0.1)
      expect(findPrimaryIndex([muted, vivid], 'vibrant')).toBe(1)
    })

    it('findPrimaryIndex with dominant prefers the largest cluster regardless of chroma', () => {
      const vivid = cluster(80, 10, 0.05)
      const muted = cluster(5, 1000, 0.95)
      expect(findPrimaryIndex([vivid, muted], 'dominant')).toBe(1)
    })
  })
})

describe('applyGrayPenalty (ADZ-48)', () => {
  function options(overrides: { chromaFloor?: number; grayPenalty?: number } = {}): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      scoring: {
        chromaFloor: overrides.chromaFloor ?? 12,
        grayPenalty: overrides.grayPenalty ?? 0.1,
      },
    }
  }

  describe('AC: defaults use chromaFloor 12 and grayPenalty 0.1', () => {
    it('penalizes a cluster whose chroma is below the default floor of 12', () => {
      const gray = cluster(5, 200, 0.5)
      expect(isLowChromaCandidate(gray, DEFAULT_OPTIONS)).toBe(true)
      expect(applyGrayPenalty(100, gray, DEFAULT_OPTIONS)).toBeCloseTo(10, 10)
    })

    it('does not penalize a cluster whose chroma is at or above the default floor', () => {
      const vivid = cluster(12, 200, 0.5)
      const vividAbove = cluster(40, 200, 0.5)
      expect(isLowChromaCandidate(vivid, DEFAULT_OPTIONS)).toBe(false)
      expect(isLowChromaCandidate(vividAbove, DEFAULT_OPTIONS)).toBe(false)
      expect(applyGrayPenalty(100, vivid, DEFAULT_OPTIONS)).toBe(100)
      expect(applyGrayPenalty(100, vividAbove, DEFAULT_OPTIONS)).toBe(100)
    })
  })

  describe('AC: low-chroma candidates are not impossible to select, only penalized', () => {
    it('a high-pop gray can still beat a low-pop vivid when the gap is large enough', () => {
      const gray = cluster(5, 10_000, 0.9)
      const vivid = cluster(40, 50, 0.05)
      const opts = options()
      const grayScore = applyGrayPenalty(gray.population, gray, opts)
      const vividScore = applyGrayPenalty(vivid.population, vivid, opts)
      expect(grayScore).toBeGreaterThan(vividScore)
    })
  })

  describe('AC: keep behavior configurable', () => {
    it('respects a custom chromaFloor', () => {
      const c = cluster(8, 100, 0.5)
      expect(isLowChromaCandidate(c, options({ chromaFloor: 5 }))).toBe(false)
      expect(isLowChromaCandidate(c, options({ chromaFloor: 10 }))).toBe(true)
    })

    it('respects a custom grayPenalty', () => {
      const c = cluster(5, 100, 0.5)
      expect(applyGrayPenalty(100, c, options({ grayPenalty: 0.5 }))).toBeCloseTo(50, 10)
      expect(applyGrayPenalty(100, c, options({ grayPenalty: 0.0 }))).toBe(0)
    })

    it('a grayPenalty of 1 effectively disables the penalty (still a no-op multiplier)', () => {
      const c = cluster(5, 100, 0.5)
      expect(applyGrayPenalty(100, c, options({ grayPenalty: 1 }))).toBe(100)
    })
  })

  describe('AC: penalty is reflected in score output when enabled', () => {
    it('reduces the score proportionally to grayPenalty', () => {
      const c = cluster(5, 100, 0.5)
      const base = 100
      const result = applyGrayPenalty(base, c, DEFAULT_OPTIONS)
      expect(result).toBeCloseTo(base * 0.1, 10)
    })
  })
})
