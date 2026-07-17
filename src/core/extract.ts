import { ColorExtractorError } from './errors.js'
import { validateCoreInput } from './validation.js'
import { resolveOptions } from './defaults.js'
import { normalizePixels } from './pixels.js'
import { passesFilter } from './filter.js'
import { convertRgbSamplesToLab, sampleSquareGrid } from './sample.js'
import { buildClusters, kmeans } from './kmeans.js'
import { labSquaredDistance } from './color/lab.js'
import type { ExtractedColor } from './types.js'
import {
  applyLightnessGap,
  buildPalette,
  buildPrimaryColor,
  findPrimaryIndex,
  scoreSecondary,
  selectSecondary,
} from './role.js'
import { applyOutputFlags, type FullExtractionResult } from './output.js'
import type { ExtractColorsOptions } from './options.js'
import type { ExtractColorsResult, ExtractionMetadata } from './result.js'
import type { PixelInput } from './validation.js'

export interface ImageDataLike {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

function emptyResult(): ExtractColorsResult {
  return {
    primary: {
      hex: '#808080',
      rgb: { r: 128, g: 128, b: 128 },
      role: 'primary',
      source: 'fallback',
    },
    secondary: null,
  }
}

function toUint8Array(data: PixelInput['data']): Uint8Array | Uint8ClampedArray {
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    return data
  }
  return Uint8Array.from(data)
}

const PACKAGE_VERSION = '0.1.0'

export function runExtractionPipeline(
  input: PixelInput,
  options?: ExtractColorsOptions,
): ExtractColorsResult {
  validateCoreInput(input)
  const resolved = resolveOptions(options)
  const criteria = {
    alphaThreshold: resolved.filtering.alphaThreshold!,
    minBrightness: resolved.filtering.minBrightness!,
    maxBrightness: resolved.filtering.maxBrightness!,
    minSaturation: resolved.filtering.minSaturation!,
  }

  const pixels = normalizePixels(toUint8Array(input.data), input.width, input.height, 4)
  const samples = sampleSquareGrid(pixels, resolved.sampleSize)
  const validSamples = samples.filter((p) => passesFilter(p, criteria))

  if (validSamples.length === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_NO_VALID_PIXELS',
      'No valid pixels remain after filtering. The image may be fully transparent, fully out of the configured brightness or saturation range, or smaller than the sample grid can cover.',
      { cause: { sampled: samples.length, passed: 0 } },
    )
  }

  const labSamples = convertRgbSamplesToLab(validSamples)

  const k = Math.min(resolved.kmeans.clusters!, labSamples.length)
  const kmeansResult = kmeans(labSamples, {
    clusters: k,
    iterations: resolved.kmeans.iterations!,
  })

  const singleColor =
    kmeansResult.centroids.length <= 1 ||
    kmeansResult.centroids.every((c, i) => {
      if (i === 0) return true
      return labSquaredDistance(c, kmeansResult.centroids[0]!) < 1
    })

  const clusters = buildClusters(labSamples, kmeansResult, resolved)
  if (singleColor) {
    const primaryCluster = clusters[findPrimaryIndex(clusters, resolved.primary.preset!)]!
    const primary = buildPrimaryColor(primaryCluster)
    const palette = buildPalette([], resolved)
    return applyOutputFlags(
      {
        primary,
        secondary: null,
        accents: [],
        palette,
        metadata: {
          algorithm: 'lab-kmeans-chroma-weighted',
          packageVersion: PACKAGE_VERSION,
          cacheVersion: '3.6',
          sampleSize: resolved.sampleSize,
          sampledPixels: samples.length,
          validPixels: validSamples.length,
          clusters: clusters.length,
          iterations: resolved.kmeans.iterations!,
          primaryPreset: resolved.primary.preset!,
          secondaryFallback: resolved.secondary.fallback!,
          fallbackUsed: false,
          runtime: 'core',
          decoder: 'pixels',
        } satisfies ExtractionMetadata,
      },
      resolved.output,
    )
  }
  if (clusters.length === 0) {
    return emptyResult()
  }

  const primaryIdx = findPrimaryIndex(clusters, resolved.primary.preset!)
  const primaryCluster = clusters[primaryIdx]!
  const primary = buildPrimaryColor(primaryCluster)
  const others = clusters.filter((c) => c.index !== primaryCluster.index)
  const secondaryResult = selectSecondary(primaryCluster, others, resolved)
  let secondaryColor: ExtractedColor | null = null
  if (secondaryResult) {
    const clusterScore =
      secondaryResult.sourceClusterIndex !== null
        ? scoreSecondary(primaryCluster, clusters.find((c) => c.index === secondaryResult.sourceClusterIndex)!, resolved)
        : secondaryResult.color.score
    secondaryColor = { ...applyLightnessGap(primaryCluster, secondaryResult.color, resolved), score: clusterScore }
  }

  const excludeIndices: number[] = [primaryCluster.index]
  if (secondaryResult?.sourceClusterIndex !== null && secondaryResult?.sourceClusterIndex !== undefined) {
    excludeIndices.push(secondaryResult.sourceClusterIndex)
  }
  const palette = buildPalette(clusters, resolved, { excludeIndices })

  const accentsCount = resolved.accents ?? 0
  const accentPool = clusters
    .filter((c) => c.index !== primaryCluster.index && (secondaryResult?.sourceClusterIndex ?? -1) !== c.index)
    .slice(0, accentsCount)
  const accents = accentPool.map((c) => ({
    ...buildPrimaryColor(c),
    role: 'accent' as const,
  }))

  const fallbackUsed = secondaryColor?.source === 'fallback'

  const fullResult: FullExtractionResult = {
    primary,
    secondary: secondaryColor,
    accents,
    palette,
    metadata: {
      algorithm: 'lab-kmeans-chroma-weighted',
      packageVersion: PACKAGE_VERSION,
      cacheVersion: '3.6',
      sampleSize: resolved.sampleSize,
      sampledPixels: samples.length,
      validPixels: validSamples.length,
      clusters: clusters.length,
      iterations: resolved.kmeans.iterations!,
      primaryPreset: resolved.primary.preset!,
      secondaryFallback: resolved.secondary.fallback!,
      fallbackUsed,
      runtime: 'core',
      decoder: 'pixels',
    } satisfies ExtractionMetadata,
  }

  return applyOutputFlags(fullResult, resolved.output)
}

export async function extractColorsFromPixels(
  input: PixelInput,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  return runExtractionPipeline(input, options)
}

export async function extractColorsFromImageData(
  imageData: ImageDataLike,
  options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
  if (imageData === null || imageData === undefined) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'ImageData input is required.',
      { cause: imageData },
    )
  }
  const input: PixelInput = {
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  }
  return extractColorsFromPixels(input, options)
}
