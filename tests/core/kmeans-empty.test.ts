import { describe, it, expect } from 'vitest'
import { kmeans } from '../../src/core/kmeans.js'
import type { LabSample } from '../../src/core/sample.js'

function sample(L: number, a: number, b: number, index: number = 0): LabSample {
  return {
    rgb: { r: 128, g: 128, b: 128 },
    lab: { L, a, b },
    index,
  }
}

describe('kmeans — empty cluster handling (ADZ-41)', () => {
  describe('AC: empty clusters do not crash extraction', () => {
    it('all-identical samples with k=3 does not throw or produce NaN', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      expect(() => kmeans(samples, { clusters: 3, iterations: 5 })).not.toThrow()
      const result = kmeans(samples, { clusters: 3, iterations: 5 })
      for (const c of result.centroids) {
        expect(Number.isFinite(c.L)).toBe(true)
        expect(Number.isFinite(c.a)).toBe(true)
        expect(Number.isFinite(c.b)).toBe(true)
      }
    })

    it('all-identical samples with k=5 (more than natural clusters) does not crash', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      expect(() => kmeans(samples, { clusters: 5, iterations: 5 })).not.toThrow()
      const result = kmeans(samples, { clusters: 5, iterations: 5 })
      expect(result.centroids.length).toBe(5)
    })
  })

  describe('AC: cluster count remains predictable for scoring', () => {
    it('always returns exactly k centroids even with empty clusters', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      for (const k of [1, 2, 3, 4, 5]) {
        const result = kmeans(samples, { clusters: k, iterations: 5 })
        expect(result.centroids.length).toBe(k)
        expect(result.populations.length).toBe(k)
      }
    })

    it('population counts sum to total samples', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      const result = kmeans(samples, { clusters: 3, iterations: 5 })
      const total = result.populations.reduce((a, b) => a + b, 0)
      expect(total).toBe(samples.length)
    })
  })

  describe('AC: same input produces same empty-cluster handling', () => {
    it('two runs on identical inputs with potential empty clusters produce identical outputs', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      const a = kmeans(samples, { clusters: 3, iterations: 5 })
      const b = kmeans(samples, { clusters: 3, iterations: 5 })
      expect(a.centroids).toEqual(b.centroids)
      expect(a.populations).toEqual(b.populations)
      expect(a.assignments).toEqual(b.assignments)
    })

    it('two runs with k=5 on identical samples produce identical outputs', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      const a = kmeans(samples, { clusters: 5, iterations: 5 })
      const b = kmeans(samples, { clusters: 5, iterations: 5 })
      expect(a.centroids).toEqual(b.centroids)
      expect(a.populations).toEqual(b.populations)
      expect(a.assignments).toEqual(b.assignments)
    })
  })

  describe('no random behavior or infinite loops', () => {
    it('terminates within reasonable time even with extreme k', () => {
      const samples = Array.from({ length: 100 }, (_, i) => sample(50 + i, 0, 0, i))
      const start = performance.now()
      kmeans(samples, { clusters: 20, iterations: 5 })
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(1000)
    })
  })

  describe('no NaN or undefined in centroids after reinit', () => {
    it('all centroids are finite numbers after empty-cluster reinit', () => {
      const samples = [
        sample(50, 0, 0, 0),
        sample(50, 0, 0, 1),
        sample(50, 0, 0, 2),
        sample(50, 0, 0, 3),
        sample(50, 0, 0, 4),
      ]
      const result = kmeans(samples, { clusters: 5, iterations: 5 })
      for (const c of result.centroids) {
        expect(Number.isNaN(c.L)).toBe(false)
        expect(Number.isNaN(c.a)).toBe(false)
        expect(Number.isNaN(c.b)).toBe(false)
        expect(c.L).not.toBe(Number.POSITIVE_INFINITY)
        expect(c.L).not.toBe(Number.NEGATIVE_INFINITY)
        expect(c.a).not.toBe(Number.POSITIVE_INFINITY)
        expect(c.a).not.toBe(Number.NEGATIVE_INFINITY)
        expect(c.b).not.toBe(Number.POSITIVE_INFINITY)
        expect(c.b).not.toBe(Number.NEGATIVE_INFINITY)
      }
    })
  })
})
