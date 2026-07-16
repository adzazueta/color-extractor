import type { Cluster } from './kmeans.js'
import type { PrimaryPreset } from './options.js'
import type { ResolvedOptions } from './defaults.js'
import { circularHueDistance, hueFromLab } from './color/chroma-hue.js'
import { labDistance } from './color/lab.js'

const FALLBACK_HEX = '#808080'

export function scorePrimary(
  cluster: Cluster,
  preset: PrimaryPreset = 'strict',
): number {
  switch (preset) {
    case 'strict':
      return cluster.chroma * Math.log(cluster.population + 1)
    case 'balanced':
      return Math.pow(cluster.chroma, 1.25) * Math.log(cluster.population + 1)
    case 'vibrant':
      return Math.pow(cluster.chroma, 1.75) * Math.log(cluster.population + 1)
    case 'dominant':
      return cluster.population
  }
}

export function findPrimaryIndex(
  clusters: readonly Cluster[],
  preset: PrimaryPreset = 'strict',
): number {
  if (clusters.length === 0) return -1
  let bestIdx = 0
  let bestScore = scorePrimary(clusters[0]!, preset)
  for (let i = 1; i < clusters.length; i++) {
    const score = scorePrimary(clusters[i]!, preset)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
}

export function isLowChromaCandidate(
  cluster: Cluster,
  options: ResolvedOptions,
): boolean {
  return cluster.chroma < options.scoring.chromaFloor!
}

export function applyGrayPenalty(
  score: number,
  cluster: Cluster,
  options: ResolvedOptions,
): number {
  if (isLowChromaCandidate(cluster, options)) {
    return score * options.scoring.grayPenalty!
  }
  return score
}

export function hueWeight(primary: Cluster, candidate: Cluster): number {
  const primaryHue = hueFromLab(primary.lab.a, primary.lab.b)
  const candidateHue = hueFromLab(candidate.lab.a, candidate.lab.b)
  const hueDelta = circularHueDistance(primaryHue, candidateHue)
  const min = Math.min(hueDelta, 360 - hueDelta)
  const sameHue = Math.max(0, 1 - min / 30)
  const complementary = Math.max(0, 1 - Math.abs(min - 180) / 15)
  const splitComplementary = Math.max(
    0,
    1 - Math.min(Math.abs(min - 150), Math.abs(min - 210)) / 15,
  )
  return 1 + 0.5 * Math.max(complementary, splitComplementary) - 0.5 * sameHue
}

export function contrastBoost(
  primary: Cluster,
  candidate: Cluster,
  options: ResolvedOptions,
): number {
  const de = labDistance(primary.lab, candidate.lab)
  const minDe = options.secondary.contrastMinDE!
  if (de >= minDe) return 1
  return Math.max(0, de / minDe)
}

export function scoreSecondary(
  primary: Cluster,
  candidate: Cluster,
  options: ResolvedOptions,
): number {
  const base = candidate.chroma * candidate.chroma * Math.log(candidate.population + 1)
  const weighted = base * hueWeight(primary, candidate) * contrastBoost(primary, candidate, options)
  return applyGrayPenalty(weighted, candidate, options)
}

export function buildPrimaryColor(cluster: Cluster): import('./types.js').ExtractedColor {
  return {
    hex: FALLBACK_HEX,
    rgb: cluster.rgb,
    hsl: cluster.hsl,
    lab: cluster.lab,
    chroma: cluster.chroma,
    population: cluster.population,
    proportion: cluster.proportion,
    role: 'primary',
    source: 'cluster',
  }
}

export type RoleAssignment = {
  readonly primary: import('./types.js').ExtractedColor
  readonly secondary: import('./types.js').ExtractedColor | null
  readonly accents: readonly import('./types.js').ExtractedColor[]
}
