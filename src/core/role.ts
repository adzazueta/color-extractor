import type { Cluster } from './kmeans.js'

const FALLBACK_HEX = '#808080'

export function scorePrimary(cluster: Cluster): number {
  return cluster.chroma * Math.log(cluster.population + 1)
}

export function findPrimaryIndex(clusters: readonly Cluster[]): number {
  if (clusters.length === 0) return -1
  let bestIdx = 0
  let bestScore = scorePrimary(clusters[0]!)
  for (let i = 1; i < clusters.length; i++) {
    const score = scorePrimary(clusters[i]!)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
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
