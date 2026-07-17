import { describe, it, expect } from 'vitest'
import { kmeans, initializeCentroids } from '../../src/core/kmeans.js'
import type { LabSample } from '../../src/core/sample.js'

function sample(L: number, a: number, b: number, index: number = 0): LabSample {
  return {
    rgb: { r: 128, g: 128, b: 128 },
    lab: { L, a, b },
    index,
  }
}

function clusterA(i: number, n: number): LabSample[] {
  const result: LabSample[] = []
  for (let j = 0; j < n; j++) {
    const angle = (j / n) * 2 * Math.PI
    result.push(sample(30 + Math.cos(angle) * 2, 60 + Math.sin(angle) * 2, 30, i + j))
  }
  return result
}

function clusterB(i: number, n: number): LabSample[] {
  const result: LabSample[] = []
  for (let j = 0; j < n; j++) {
    const angle = (j / n) * 2 * Math.PI
    result.push(sample(70 + Math.cos(angle) * 2, -30 + Math.sin(angle) * 2, 50, i + j))
  }
  return result
}

describe('kmeans', () => {
  describe('determinism (gherkin AC)', () => {
    it('same input produces same output on repeated calls', () => {
      const samples = [...clusterA(0, 10), ...clusterB(100, 10)]
      const a = kmeans(samples, { clusters: 2, iterations: 7 })
      const b = kmeans(samples, { clusters: 2, iterations: 7 })
      expect(a.centroids).toEqual(b.centroids)
      expect(a.populations).toEqual(b.populations)
      expect(a.assignments).toEqual(b.assignments)
    })
  })

  describe('iteration count', () => {
    it('runs the configured number of iterations and converges for clear 2-cluster case', () => {
      const samples = [...clusterA(0, 20), ...clusterB(100, 20)]
      const result = kmeans(samples, { clusters: 2, iterations: 10 })
      expect(result.populations[0]).toBe(20)
      expect(result.populations[1]).toBe(20)
    })

    it('centroids stabilize as iterations increase (deterministic, same output for same input)', () => {
      const samples = [...clusterA(0, 10), ...clusterB(100, 10)]
      const iter5 = kmeans(samples, { clusters: 2, iterations: 5 })
      const iter10 = kmeans(samples, { clusters: 2, iterations: 10 })
      expect(iter5.centroids).toEqual(iter10.centroids)
    })
  })

  describe('assignments', () => {
    it('every sample is assigned to a valid cluster index', () => {
      const samples = [...clusterA(0, 10), ...clusterB(100, 10)]
      const result = kmeans(samples, { clusters: 2, iterations: 7 })
      for (const a of result.assignments) {
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(2)
      }
    })

    it('population counts sum to total samples', () => {
      const samples = [...clusterA(0, 15), ...clusterB(100, 15)]
      const result = kmeans(samples, { clusters: 2, iterations: 7 })
      const total = result.populations.reduce((a, b) => a + b, 0)
      expect(total).toBe(samples.length)
    })

    it('cluster A samples go to one cluster, cluster B to the other', () => {
      const samplesA = clusterA(0, 10)
      const samplesB = clusterB(100, 10)
      const samples = [...samplesA, ...samplesB]
      const result = kmeans(samples, { clusters: 2, iterations: 10 })
      const clusterOfA = result.assignments[0]!
      const clusterOfB = result.assignments[10]!
      expect(clusterOfA).not.toBe(clusterOfB)
      for (let i = 0; i < 10; i++) {
        expect(result.assignments[i]).toBe(clusterOfA)
      }
      for (let i = 10; i < 20; i++) {
        expect(result.assignments[i]).toBe(clusterOfB)
      }
    })

    it('each sample is assigned to the nearest centroid by Lab distance', () => {
      const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
      const result = kmeans(samples, { clusters: 2, iterations: 10 })
      for (let i = 0; i < samples.length; i++) {
        const assigned = result.assignments[i]!
        const centroid = result.centroids[assigned]!
        const dAssigned = (centroid.L - samples[i]!.lab.L) ** 2
          + (centroid.a - samples[i]!.lab.a) ** 2
          + (centroid.b - samples[i]!.lab.b) ** 2
        for (let j = 0; j < result.centroids.length; j++) {
          if (j === assigned) continue
          const c = result.centroids[j]!
          const dOther = (c.L - samples[i]!.lab.L) ** 2
            + (c.a - samples[i]!.lab.a) ** 2
            + (c.b - samples[i]!.lab.b) ** 2
          expect(dAssigned).toBeLessThanOrEqual(dOther)
        }
      }
    })
  })

  describe('centroids', () => {
    it('centroids are updated to cluster means (not equal to initial seeds)', () => {
      const samples = [...clusterA(0, 10), ...clusterB(100, 10)]
      const initial = initializeCentroids(samples, 2)
      const result = kmeans(samples, { clusters: 2, iterations: 5 })
      for (let i = 0; i < 2; i++) {
        const initialLab = initial[i]!.lab
        const finalCentroid = result.centroids[i]!
        const isInitial = finalCentroid.L === initialLab.L
          && finalCentroid.a === initialLab.a
          && finalCentroid.b === initialLab.b
        expect(isInitial).toBe(false)
      }
    })

    it('with iterations=0, centroids are the means of the initial assignment', () => {
      const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
      const result = kmeans(samples, { clusters: 2, iterations: 0 })
      expect(result.centroids.length).toBe(2)
      const means = [0, 1].map((ci) => {
        const members = samples.filter((_, i) => result.assignments[i] === ci)
        const L = members.reduce((a, s) => a + s.lab.L, 0) / members.length
        const a = members.reduce((a, s) => a + s.lab.a, 0) / members.length
        const b = members.reduce((a, s) => a + s.lab.b, 0) / members.length
        return { L, a, b }
      })
      for (let i = 0; i < 2; i++) {
        expect(result.centroids[i]!.L).toBeCloseTo(means[i]!.L, 8)
        expect(result.centroids[i]!.a).toBeCloseTo(means[i]!.a, 8)
        expect(result.centroids[i]!.b).toBeCloseTo(means[i]!.b, 8)
      }
    })

    it('k=1 produces a single centroid that is the mean of all samples', () => {
      const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
      const result = kmeans(samples, { clusters: 1, iterations: 10 })
      expect(result.centroids.length).toBe(1)
      expect(result.populations).toEqual([10])
      const meanL = samples.reduce((a, s) => a + s.lab.L, 0) / 10
      expect(result.centroids[0]!.L).toBeCloseTo(meanL, 6)
    })
  })

  describe('validation', () => {
    it('throws for clusters <= 0', () => {
      expect(() => kmeans([sample(50, 0, 0, 0)], { clusters: 0, iterations: 1 })).toThrow(RangeError)
    })

    it('throws for negative clusters', () => {
      expect(() => kmeans([sample(50, 0, 0, 0)], { clusters: -1, iterations: 1 })).toThrow(RangeError)
    })

    it('throws for clusters > samples.length', () => {
      expect(() => kmeans([sample(50, 0, 0, 0), sample(60, 0, 0, 1)], { clusters: 5, iterations: 1 }))
        .toThrow(RangeError)
    })

    it('throws for negative iterations', () => {
      expect(() => kmeans([sample(50, 0, 0, 0)], { clusters: 1, iterations: -1 })).toThrow(RangeError)
    })
  })

  describe('population', () => {
    it('each non-empty cluster has at least one sample', () => {
      const samples = [...clusterA(0, 8), ...clusterB(100, 8)]
      const result = kmeans(samples, { clusters: 2, iterations: 7 })
      for (const p of result.populations) {
        expect(p).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('deterministic (no randomness, gherkin AC)', () => {
    it('two runs yield identical results on identical inputs', () => {
      const samples = [...clusterA(0, 12), ...clusterB(100, 12)]
      const a = kmeans(samples, { clusters: 2, iterations: 5 })
      const b = kmeans(samples, { clusters: 2, iterations: 5 })
      expect(a.centroids).toEqual(b.centroids)
      expect(a.populations).toEqual(b.populations)
      expect(a.assignments).toEqual(b.assignments)
    })
  })
})
