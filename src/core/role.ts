import type { Cluster } from './kmeans.js'
import type { PrimaryPreset, SecondaryFallbackMode } from './options.js'
import type { ResolvedOptions } from './defaults.js'
import { circularHueDistance, hueFromLab, normalizeHue } from './color/chroma-hue.js'
import { labDistance, xyzToLab } from './color/lab.js'
import { hslToRgb } from './color/hsl.js'
import { rgbToHex } from './color/hex.js'
import { srgbByteToLinear } from './color/srgb.js'
import { linearRgbToXyz } from './color/xyz.js'
import type { ExtractedColor } from './types.js'

const HARMONY_SATURATION_FLOOR = 0.4
const HARMONY_LIGHTNESS_FLOOR = 0.3
const HARMONY_LIGHTNESS_CEILING = 0.7

function clampUnit(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

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

export function buildHarmonyFallback(
  primary: Cluster,
  options: ResolvedOptions,
): ExtractedColor {
  const baseHue = primary.hsl.h
  const rotatedHue = baseHue + options.secondary.harmonyFallbackDeg!
  const s = Math.max(primary.hsl.s, HARMONY_SATURATION_FLOOR)
  const l = Math.min(
    Math.max(primary.hsl.l, HARMONY_LIGHTNESS_FLOOR),
    HARMONY_LIGHTNESS_CEILING,
  )

  const rgb = hslToRgb(rotatedHue, s, l)
  const hex = rgbToHex(rgb)
  const lr = srgbByteToLinear(rgb.r)
  const lg = srgbByteToLinear(rgb.g)
  const lb = srgbByteToLinear(rgb.b)
  const xyz = linearRgbToXyz(lr, lg, lb)
  const lab = xyzToLab(xyz.x, xyz.y, xyz.z)
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b)

  return {
    hex,
    rgb,
    hsl: { h: normalizeHue(rotatedHue), s, l },
    lab,
    chroma,
    role: 'secondary',
    source: 'fallback',
  }
}

function rankBySecondaryScore(
  primary: Cluster,
  candidates: readonly Cluster[],
  options: ResolvedOptions,
): { cluster: Cluster; score: number }[] {
  return candidates
    .map((c) => ({ cluster: c, score: scoreSecondary(primary, c, options) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.cluster.index - b.cluster.index
    })
}

function clusterAsSecondaryColor(cluster: Cluster, source: ExtractedColor['source']): ExtractedColor {
  return {
    hex: rgbToHex(cluster.rgb),
    rgb: cluster.rgb,
    hsl: cluster.hsl,
    lab: cluster.lab,
    chroma: cluster.chroma,
    population: cluster.population,
    proportion: cluster.proportion,
    score: cluster.score,
    role: 'secondary',
    source,
  }
}

function clusterAsPaletteColor(cluster: Cluster): ExtractedColor {
  return {
    hex: rgbToHex(cluster.rgb),
    rgb: cluster.rgb,
    hsl: cluster.hsl,
    lab: cluster.lab,
    chroma: cluster.chroma,
    population: cluster.population,
    proportion: cluster.proportion,
    score: cluster.score,
    role: 'palette',
    source: 'cluster',
  }
}

export interface BuildPaletteOptions {
  readonly excludeIndices?: readonly number[]
}

export function buildPalette(
  clusters: readonly Cluster[],
  options: ResolvedOptions,
  paletteOptions: BuildPaletteOptions = {},
): ExtractedColor[] {
  const exclude = new Set(paletteOptions.excludeIndices ?? [])
  const preset = options.primary.preset ?? 'strict'

  const ranked = clusters
    .filter((c) => !exclude.has(c.index))
    .map((c) => ({ cluster: c, score: scorePrimary(c, preset) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.cluster.index - b.cluster.index
    })

  const size = Math.max(0, options.paletteSize ?? 0)
  return ranked.slice(0, size).map((r) => clusterAsPaletteColor(r.cluster))
}

export function selectSecondary(
  primary: Cluster,
  candidates: readonly Cluster[],
  options: ResolvedOptions,
): ExtractedColor | null {
  const { passing, rejected } = filterByContrastThreshold(primary, candidates, options)
  const passingRanked = rankBySecondaryScore(primary, passing, options)
  const rejectedRanked = rankBySecondaryScore(primary, rejected, options)

  if (passingRanked.length === 0) {
    if (options.secondary.fallback === 'harmony') {
      return buildHarmonyFallback(primary, options)
    }
    if (options.secondary.fallback === 'nearest') {
      if (rejectedRanked.length === 0) return null
      return clusterAsSecondaryColor(rejectedRanked[0]!.cluster, 'fallback')
    }
    return null
  }

  return clusterAsSecondaryColor(passingRanked[0]!.cluster, 'cluster')
}

export interface ContrastFilterResult {
  readonly passing: readonly Cluster[]
  readonly rejected: readonly Cluster[]
}

export function filterByContrastThreshold(
  primary: Cluster,
  candidates: readonly Cluster[],
  options: ResolvedOptions,
): ContrastFilterResult {
  const minDe = options.secondary.contrastMinDE!
  const passing: Cluster[] = []
  const rejected: Cluster[] = []
  for (const c of candidates) {
    if (labDistance(primary.lab, c.lab) >= minDe) {
      passing.push(c)
    } else {
      rejected.push(c)
    }
  }
  return { passing, rejected }
}

export function applyLightnessGap(
  primary: Cluster,
  secondary: ExtractedColor,
  options: ResolvedOptions,
): ExtractedColor {
  if (!options.lightness.enforceGap) {
    return secondary
  }
  if (secondary.hsl === undefined) {
    return secondary
  }

  const minGapUnit = options.lightness.minGap! / 100
  const currentGap = Math.abs(primary.hsl.l - secondary.hsl.l)
  if (currentGap >= minGapUnit) {
    return secondary
  }

  const direction = primary.hsl.l >= 0.5 ? -1 : 1
  const targetL = clampUnit(primary.hsl.l + direction * minGapUnit)
  const adjustedHsl = { h: secondary.hsl.h, s: secondary.hsl.s, l: targetL }
  const adjustedRgb = hslToRgb(adjustedHsl.h, adjustedHsl.s, adjustedHsl.l)
  const adjustedHex = rgbToHex(adjustedRgb)
  const lr = srgbByteToLinear(adjustedRgb.r)
  const lg = srgbByteToLinear(adjustedRgb.g)
  const lb = srgbByteToLinear(adjustedRgb.b)
  const xyz = linearRgbToXyz(lr, lg, lb)
  const adjustedLab = xyzToLab(xyz.x, xyz.y, xyz.z)
  const adjustedChroma = Math.sqrt(adjustedLab.a * adjustedLab.a + adjustedLab.b * adjustedLab.b)

  return {
    hex: adjustedHex,
    rgb: adjustedRgb,
    hsl: adjustedHsl,
    lab: adjustedLab,
    chroma: adjustedChroma,
    role: 'secondary',
    source: 'adjusted',
  }
}

export function buildPrimaryColor(cluster: Cluster): import('./types.js').ExtractedColor {
  return {
    hex: rgbToHex(cluster.rgb),
    rgb: cluster.rgb,
    hsl: cluster.hsl,
    lab: cluster.lab,
    chroma: cluster.chroma,
    population: cluster.population,
    proportion: cluster.proportion,
    score: cluster.score,
    role: 'primary',
    source: 'cluster',
  }
}

export type RoleAssignment = {
  readonly primary: import('./types.js').ExtractedColor
  readonly secondary: import('./types.js').ExtractedColor | null
  readonly accents: readonly import('./types.js').ExtractedColor[]
}
