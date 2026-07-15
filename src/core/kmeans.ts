import type { HSL, Lab, RGB } from './types.js'
import type { LabSample } from './sample.js'
import { labSquaredDistance } from './color/lab.js'
import { rgbToHsl } from './color/hsl.js'

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

function indexOfClosestTo(samples: LabSample[], target: Lab, exclude: Set<number>): number {
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

function indexOfFarthestFrom(
  samples: LabSample[],
  centroids: LabSample[],
  exclude: Set<number>,
): number {
  let bestIdx = -1
  let bestMinDist = -1
  for (let i = 0; i < samples.length; i++) {
    if (exclude.has(i)) continue
    let minDist = Number.POSITIVE_INFINITY
    for (const c of centroids) {
      const d = labSquaredDistance(samples[i]!.lab, c.lab)
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
  if (k <= 0) {
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
    const nextIdx = indexOfFarthestFrom(samples, centroids, exclude)
    centroids.push(samples[nextIdx]!)
    exclude.add(nextIdx)
  }

  return centroids
}

export interface KMeansOptions {
  readonly clusters: number
  readonly iterations: number
}

export interface KMeansResult {
  readonly centroids: readonly Lab[]
  readonly populations: readonly number[]
  readonly assignments: readonly number[]
}

function assignToClusters(samples: LabSample[], centroids: Lab[]): number[] {
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

function findFarthestFromCentroids(
  samples: LabSample[],
  centroids: Lab[],
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

function recomputeCentroids(
  samples: LabSample[],
  assignments: number[],
  k: number,
  previous: Lab[],
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

  const newCentroids: Lab[] = []
  const usedSampleIndices = new Set<number>()

  for (let j = 0; j < k; j++) {
    if (counts[j]! > 0) {
      const sum = sums[j]!
      const count = counts[j]!
      newCentroids.push({
        L: sum.L / count,
        a: sum.a / count,
        b: sum.b / count,
      })
    } else {
      const reference = newCentroids.length > 0 ? newCentroids : previous
      const idx = findFarthestFromCentroids(samples, reference, usedSampleIndices)
      usedSampleIndices.add(idx)
      newCentroids.push({ ...samples[idx]!.lab })
    }
  }
  return newCentroids
}

export function kmeans(samples: LabSample[], options: KMeansOptions): KMeansResult {
  if (options.clusters <= 0) {
    throw new RangeError(`clusters must be a positive integer, got ${options.clusters}`)
  }
  if (options.clusters > samples.length) {
    throw new RangeError(
      `clusters (${options.clusters}) cannot exceed samples.length (${samples.length})`,
    )
  }
  if (options.iterations < 0) {
    throw new RangeError(`iterations must be non-negative, got ${options.iterations}`)
  }

  const initial = initializeCentroids(samples, options.clusters)
  let centroids: Lab[] = initial.map((s) => ({ ...s.lab }))

  for (let i = 0; i < options.iterations; i++) {
    const assignments = assignToClusters(samples, centroids)
    centroids = recomputeCentroids(samples, assignments, options.clusters, centroids)
  }

  const finalAssignments = assignToClusters(samples, centroids)
  const populations = new Array<number>(options.clusters).fill(0)
  for (const a of finalAssignments) {
    populations[a]!++
  }

  return {
    centroids,
    populations,
    assignments: finalAssignments,
  }
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

export function buildClusters(
  samples: LabSample[],
  kmeansResult: KMeansResult,
): Cluster[] {
  const { centroids, populations, assignments } = kmeansResult
  const total = samples.length

  return centroids.map((lab, i) => {
    const population = populations[i]!
    const proportion = total === 0 ? 0 : population / total
    const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b)

    let rgb: RGB = { r: 0, g: 0, b: 0 }
    let hsl: HSL = { h: 0, s: 0, l: 0 }

    if (population > 0) {
      const repIdx = indexOfClosestToCentroids(samples, i, assignments, lab)
      if (repIdx >= 0) {
        const rep = samples[repIdx]!
        rgb = { ...rep.rgb }
        hsl = rgbToHsl(rep.rgb.r, rep.rgb.g, rep.rgb.b)
      }
    }

    return {
      index: i,
      lab,
      rgb,
      hsl,
      population,
      proportion,
      chroma,
      score: 0,
    }
  })
}
