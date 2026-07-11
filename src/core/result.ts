import type { ExtractedColor } from './types.js'
import type { PrimaryPreset, SecondaryFallbackMode } from './options.js'

export interface ExtractionMetadata {
  readonly algorithm: 'lab-kmeans-chroma-weighted'
  readonly packageVersion?: string
  readonly cacheVersion: string
  readonly sampleSize: number
  readonly sampledPixels: number
  readonly validPixels: number
  readonly clusters: number
  readonly iterations: number
  readonly primaryPreset: PrimaryPreset
  readonly secondaryFallback: SecondaryFallbackMode
  readonly fallbackUsed: boolean
  readonly runtime: 'browser' | 'node' | 'core'
  readonly decoder?: 'canvas' | 'sharp' | 'image-data' | 'pixels'
}

export interface MinimalExtractColorsResult {
  readonly primary: ExtractedColor
  readonly secondary: ExtractedColor | null
}

export interface ExtractColorsResult extends MinimalExtractColorsResult {
  readonly accents?: readonly ExtractedColor[]
  readonly palette?: readonly ExtractedColor[]
  readonly metadata?: ExtractionMetadata
}
