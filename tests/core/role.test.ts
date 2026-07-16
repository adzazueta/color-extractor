import { describe, it, expect } from 'vitest'
import {
  scorePrimary,
  findPrimaryIndex,
  buildPrimaryColor,
} from '../../src/core/role.js'
import type { Cluster } from '../../src/core/kmeans.js'

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
