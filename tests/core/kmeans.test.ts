import { describe, it, expect } from 'vitest'
import { initializeCentroids } from '../../src/core/kmeans.js'
import type { LabSample } from '../../src/core/sample.js'
import { labSquaredDistance } from '../../src/core/color/lab.js'

function sample(L: number, a: number, b: number, index: number = 0): LabSample {
  return {
    rgb: { r: 128, g: 128, b: 128 },
    lab: { L, a, b },
    index,
  }
}

function indices(samples: LabSample[]): number[] {
  return samples.map((s) => s.index)
}

describe('initializeCentroids', () => {
  describe('determinism (gherkin AC)', () => {
    it('same input produces same centroid sequence on repeated calls', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(60, 30, 0, 1),
        sample(50, 0, 0, 2),
        sample(70, 0, 30, 3),
        sample(40, -30, 0, 4),
      ]
      const a = initializeCentroids(samples, 3)
      const b = initializeCentroids(samples, 3)
      expect(indices(a)).toEqual(indices(b))
    })

    it('does not pick the same index twice (always unique centroids)', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
      ]
      const result = initializeCentroids(samples, 4)
      const idSet = new Set(result.map((s) => s.index))
      expect(idSet.size).toBe(4)
    })
  })

  describe('first centroid is closest to mean', () => {
    it('picks sample with Lab closest to the mean Lab', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(60, 30, 0, 1),
        sample(50, 0, 0, 2),
      ]
      const result = initializeCentroids(samples, 2)
      const mean = { L: (50 + 60 + 50) / 3, a: (0 + 30 + 0) / 3, b: 0 }
      const d0 = labSquaredDistance(samples[0]!.lab, mean)
      const d2 = labSquaredDistance(samples[2]!.lab, mean)
      expect(d0).toBe(d2)
      expect(result[0]!.index).toBe(0)
    })

    it('with distinct samples, picks the one with smallest distance to mean', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(60, 30, 0, 1),
        sample(70, 0, 30, 2),
        sample(40, -30, 0, 3),
        sample(50, 0, 30, 4),
      ]
      const result = initializeCentroids(samples, 1)
      const mean = { L: 54, a: 0, b: 12 }
      const distances = samples.map((s) => labSquaredDistance(s.lab, mean))
      const expectedIdx = distances.indexOf(Math.min(...distances))
      expect(result[0]!.index).toBe(expectedIdx)
    })
  })

  describe('subsequent centroids are farthest from existing', () => {
    it('for k=3 on 5 samples, picks samples with maximum min-distance', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(60, 30, 0, 1),
        sample(70, 0, 30, 2),
        sample(40, -30, 0, 3),
        sample(50, 0, 30, 4),
      ]
      const result = initializeCentroids(samples, 3)
      expect(result.length).toBe(3)
      expect(result[0]!.index).toBe(0)
      expect(result[1]!.index).toBe(2)
      expect(result[2]!.index).toBe(1)
    })
  })

  describe('k bounds', () => {
    it('k=1 returns exactly 1 centroid', () => {
      const samples = [sample(50, 0, 0, 0), sample(60, 0, 0, 1)]
      const result = initializeCentroids(samples, 1)
      expect(result.length).toBe(1)
    })

    it('k=0 throws RangeError', () => {
      expect(() => initializeCentroids([sample(50, 0, 0, 0)], 0)).toThrow(RangeError)
    })

    it('negative k throws RangeError', () => {
      expect(() => initializeCentroids([sample(50, 0, 0, 0)], -1)).toThrow(RangeError)
    })

    it('k > samples.length throws RangeError', () => {
      expect(() => initializeCentroids([sample(50, 0, 0, 0), sample(60, 0, 0, 1)], 5))
        .toThrow(RangeError)
    })

    it('k = samples.length returns all sample indices (in algorithm order)', () => {
      const samples = [sample(50, 0, 0, 0), sample(60, 0, 0, 1), sample(70, 0, 0, 2)]
      const result = initializeCentroids(samples, samples.length)
      const idSet = new Set(result.map((s) => s.index))
      expect(idSet).toEqual(new Set([0, 1, 2]))
    })
  })

  describe('deterministic tie-breaking', () => {
    it('when two samples have the same max-min-distance, picks the lower index', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
      ]
      const result = initializeCentroids(samples, 2)
      expect(result.map((s) => s.index)).toEqual([0, 1])
    })

    it('ties in first centroid pick go to the lower index', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
      ]
      const result = initializeCentroids(samples, 1)
      expect(result[0]!.index).toBe(0)
    })
  })

  describe('completeness', () => {
    it('returns k centroids when k is between 1 and samples.length', () => {
      const samples = Array.from({ length: 10 }, (_, i) => sample(50 + i, 0, 0, i))
      for (let k = 1; k <= 10; k++) {
        const result = initializeCentroids(samples, k)
        expect(result.length).toBe(k)
      }
    })

    it('does not return duplicate samples in the centroid list', () => {
      const samples = Array.from({ length: 5 }, (_, i) => sample(50, i * 5, 0, i))
      const result = initializeCentroids(samples, 3)
      const idSet = new Set(result.map((s) => s.index))
      expect(idSet.size).toBe(3)
    })
  })

  describe('no randomness (K-means++ would be random without seed)', () => {
    it('two runs on the same input yield identical outputs (gherkin AC)', () => {
      const samples = Array.from({ length: 20 }, (_, i) =>
        sample(50 + (i % 5) * 10, (i % 3) * 20, (i % 4) * 15, i),
      )
      const a = initializeCentroids(samples, 5)
      const b = initializeCentroids(samples, 5)
      expect(indices(a)).toEqual(indices(b))
    })
  })
})
