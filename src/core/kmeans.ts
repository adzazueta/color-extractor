import type { HSL, Lab, RGB } from './types.js'
import type { LabSample } from './sample.js'
import type { ResolvedOptions } from './defaults.js'
import { labSquaredDistance } from './color/lab.js'
import { rgbToHsl } from './color/hsl.js'
import { chromaFromLab } from './color/chroma-hue.js'
import { scorePrimary } from './role.js'

export interface KMeansOptions {
  readonly clusters: number
  readonly iterations: number
}

export interface KMeansResult {
  readonly centroids: readonly Lab[]
  readonly populations: readonly number[]
  readonly assignments: readonly number[]
}

export interface Cluster {
  readonly index: number
  readonly lab: Lab
  readonly rgb: RGB
  readonly hsl: HSL
  readonly population: number
  readonly proportion: number
  readonly chroma: number
  readonly score: number
}

function meanLab(samples: LabSample[]): Lab {
  let sumL = 0
  let suma = 0
  let sumb = 0
  for (const s of samples) {
    sumL += s.lab.L
    suma += s.lab.a
    sumb += s.lab.b
  }
  const n = samples.length
  return { L: sumL / n, a: suma / n, b: sumb / n }
}

function indexOfClosestTo(
  samples: LabSample[],
  target: Lab,
  exclude: Set<number>,
): number {
  let bestIdx = -1
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < samples.length; i++) {
    if (exclude.has(i)) continue
    const d = labSquaredDistance(samples[i]!.lab, target)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

function findFarthestFromCentroids(
  samples: LabSample[],
  centroids: readonly Lab[],
  exclude: Set<number>,
): number {
  let bestIdx = 0
  let bestMinDist = -1
  for (let i = 0; i < samples.length; i++) {
    if (exclude.has(i)) continue
    let minDist = Number.POSITIVE_INFINITY
    for (const c of centroids) {
      const d = labSquaredDistance(samples[i]!.lab, c)
      if (d < minDist) minDist = d
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist
      bestIdx = i
    }
  }
  return bestIdx
}

export function initializeCentroids(
  samples: LabSample[],
  k: number,
): LabSample[] {
  if (!Number.isInteger(k) || k <= 0) {
    throw new RangeError(`k must be a positive integer, got ${k}`)
  }
  if (k > samples.length) {
    throw new RangeError(
      `k (${k}) cannot exceed samples.length (${samples.length})`,
    )
  }

  const mean = meanLab(samples)
  const firstIdx = indexOfClosestTo(samples, mean, new Set())
  const centroids: LabSample[] = [samples[firstIdx]!]
  const exclude = new Set<number>([firstIdx])

  for (let i = 1; i < k; i++) {
    const nextIdx = findFarthestFromCentroids(
      samples,
      centroids.map((c) => c.lab),
      exclude,
    )
    centroids.push(samples[nextIdx]!)
    exclude.add(nextIdx)
  }

  return centroids
}

function assignToClusters(samples: LabSample[], centroids: readonly Lab[]): number[] {
  const assignments = new Array<number>(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let minDist = Number.POSITIVE_INFINITY
    let minIdx = 0
    for (let j = 0; j < centroids.length; j++) {
      const d = labSquaredDistance(samples[i]!.lab, centroids[j]!)
      if (d < minDist) {
        minDist = d
        minIdx = j
      }
    }
    assignments[i] = minIdx
  }
  return assignments
}

function recomputeCentroids(
  samples: LabSample[],
  assignments: readonly number[],
  k: number,
  previous: readonly Lab[],
): Lab[] {
  const sums: { L: number; a: number; b: number }[] = Array.from(
    { length: k },
    () => ({ L: 0, a: 0, b: 0 }),
  )
  const counts = new Array<number>(k).fill(0)
  for (let i = 0; i < samples.length; i++) {
    const c = assignments[i]!
    const sum = sums[c]!
    const lab = samples[i]!.lab
    sum.L += lab.L
    sum.a += lab.a
    sum.b += lab.b
    counts[c]!++
  }

  const newCentroids: Lab[] = new Array<Lab>(k)
  const validReference: Lab[] = []

  for (let j = 0; j < k; j++) {
    if (counts[j]! > 0) {
      const sum = sums[j]!
      const count = counts[j]!
      newCentroids[j] = {
        L: sum.L / count,
        a: sum.a / count,
        b: sum.b / count,
      }
      validReference.push(newCentroids[j]!)
    }
  }

  const usedSampleIndices = new Set<number>()
  for (let j = 0; j < k; j++) {
    if (counts[j] === 0) {
      const reference = validReference.length > 0 ? validReference : previous
      const idx = findFarthestFromCentroids(samples, reference, usedSampleIndices)
      usedSampleIndices.add(idx)
      const reinited: Lab = { ...samples[idx]!.lab }
      newCentroids[j] = reinited
      validReference.push(reinited)
    }
  }

  return newCentroids
}

function indexOfClosestToCentroids(
  samples: LabSample[],
  clusterIdx: number,
  assignments: readonly number[],
  target: Lab,
): number {
  let bestIdx = -1
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < samples.length; i++) {
    if (assignments[i] !== clusterIdx) continue
    const d = labSquaredDistance(samples[i]!.lab, target)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

export function kmeans(samples: LabSample[], options: KMeansOptions): KMeansResult {
  if (!Number.isInteger(options.clusters) || options.clusters <= 0) {
    throw new RangeError(
      `clusters must be a positive integer, got ${options.clusters}`,
    )
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 0) {
    throw new RangeError(
      `iterations must be a non-negative integer, got ${options.iterations}`,
    )
  }
  if (options.clusters > samples.length) {
    throw new RangeError(
      `clusters (${options.clusters}) cannot exceed samples.length (${samples.length})`,
    )
  }

  const initial = initializeCentroids(samples, options.clusters)
  let centroids: Lab[] = initial.map((s) => ({ ...s.lab }))

  let assignments = assignToClusters(samples, centroids)

  for (let i = 0; i < options.iterations; i++) {
    centroids = recomputeCentroids(samples, assignments, options.clusters, centroids)
    assignments = assignToClusters(samples, centroids)
  }

  const populations = new Array<number>(options.clusters).fill(0)
  for (const a of assignments) {
    populations[a]!++
  }

  return { centroids, populations, assignments }
}

export function buildClusters(
  samples: LabSample[],
  kmeansResult: KMeansResult,
  options?: ResolvedOptions,
): Cluster[] {
  const { centroids, populations, assignments } = kmeansResult
  const total = samples.length
  const preset = options?.primary.preset ?? 'strict'

  const clusters: Cluster[] = []
  for (let i = 0; i < centroids.length; i++) {
    if (populations[i]! === 0) continue

    const lab = centroids[i]!
    const population = populations[i]!
    const proportion = total === 0 ? 0 : population / total
    const chroma = chromaFromLab(lab.a, lab.b)

    const repIdx = indexOfClosestToCentroids(samples, i, assignments, lab)
    let rgb: RGB = { r: 0, g: 0, b: 0 }
    let hsl: HSL = { h: 0, s: 0, l: 0 }
    if (repIdx >= 0) {
      const rep = samples[repIdx]!
      rgb = { ...rep.rgb }
      hsl = rgbToHsl(rep.rgb.r, rep.rgb.g, rep.rgb.b)
    }

    const cluster: Cluster = {
      index: i,
      lab,
      rgb,
      hsl,
      population,
      proportion,
      chroma,
      score: 0,
    }
    const score = scorePrimary(cluster, preset)
    clusters.push({ ...cluster, score })
  }

  return clusters
}
