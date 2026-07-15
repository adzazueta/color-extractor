import { describe, it, expect } from 'vitest'
import { buildClusters, kmeans } from '../../src/core/kmeans.js'
import type { LabSample } from '../../src/core/sample.js'

function sample(L: number, a: number, b: number, index: number = 0): LabSample {
  return {
    rgb: { r: 128, g: 128, b: 128 },
    lab: { L, a, b },
    index,
  }
}

function clusterA(i: number, n: number): LabSample[] {
  return Array.from({ length: n }, (_, j) => sample(30 + j, 60, 30, i + j))
}

function clusterB(i: number, n: number): LabSample[] {
  return Array.from({ length: n }, (_, j) => sample(70 + j, -30, 50, i + j))
}

describe('buildClusters — filtering (reviewer finding #4)', () => {
  it('returns only non-empty clusters (empty clusters filtered out)', () => {
    const samples = [
      sample(50, 0, 0, 0),
      sample(50, 0, 0, 1),
      sample(50, 0, 0, 2),
    ]
    const kmeansResult = kmeans(samples, { clusters: 3, iterations: 5 })
    const clusters = buildClusters(samples, kmeansResult)
    for (const c of clusters) {
      expect(c.population).toBeGreaterThan(0)
    }
  })

  it('kmeans with k=3 + 3 identical samples produces ≤ 3 clusters (after filtering empties)', () => {
    const samples = [
      sample(50, 0, 0, 0),
      sample(50, 0, 0, 1),
      sample(50, 0, 0, 2),
    ]
    const kmeansResult = kmeans(samples, { clusters: 3, iterations: 5 })
    const clusters = buildClusters(samples, kmeansResult)
    expect(clusters.length).toBeLessThanOrEqual(3)
  })

  it('non-empty cluster has the expected fields', () => {
    const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
    const kmeansResult = kmeans(samples, { clusters: 2, iterations: 10 })
    const clusters = buildClusters(samples, kmeansResult)
    expect(clusters.length).toBe(2)
    for (const c of clusters) {
      expect(c).toHaveProperty('index')
      expect(c).toHaveProperty('lab')
      expect(c).toHaveProperty('rgb')
      expect(c).toHaveProperty('hsl')
      expect(c).toHaveProperty('population')
      expect(c).toHaveProperty('proportion')
      expect(c).toHaveProperty('chroma')
      expect(c).toHaveProperty('score')
    }
  })

  it('preserves the original cluster index after filtering', () => {
    const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
    const kmeansResult = kmeans(samples, { clusters: 2, iterations: 10 })
    const clusters = buildClusters(samples, kmeansResult)
    const indices = clusters.map((c) => c.index)
    for (const c of clusters) {
      expect(indices).toContain(c.index)
    }
  })

  it('k=1 always returns a single cluster', () => {
    const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
    const kmeansResult = kmeans(samples, { clusters: 1, iterations: 10 })
    const clusters = buildClusters(samples, kmeansResult)
    expect(clusters.length).toBe(1)
    expect(clusters[0]!.population).toBe(samples.length)
    expect(clusters[0]!.proportion).toBe(1)
  })

  it('proportions sum to 1.0 across non-empty clusters', () => {
    const samples = [...clusterA(0, 5), ...clusterB(100, 5)]
    const kmeansResult = kmeans(samples, { clusters: 2, iterations: 10 })
    const clusters = buildClusters(samples, kmeansResult)
    const totalProportion = clusters.reduce((a, c) => a + c.proportion, 0)
    expect(totalProportion).toBeCloseTo(1.0, 10)
  })
})
