export interface KmeansOptions {
  readonly clusters?: number
  readonly iterations?: number
}

export interface FilteringOptions {
  readonly alphaThreshold?: number
  readonly minBrightness?: number
  readonly maxBrightness?: number
  readonly minSaturation?: number
}

export type PrimaryPreset = 'strict' | 'balanced' | 'vibrant' | 'dominant'

export interface PrimaryOptions {
  readonly preset?: PrimaryPreset
}

export type SecondaryFallbackMode = 'harmony' | 'null' | 'nearest'

export interface SecondaryOptions {
  readonly fallback?: SecondaryFallbackMode
  readonly contrastMinDE?: number
  readonly harmonyFallbackDeg?: number
}

export interface ScoringOptions {
  readonly chromaFloor?: number
  readonly grayPenalty?: number
}

export interface OutputOptions {
  readonly includePalette?: boolean
  readonly includeAccents?: boolean
  readonly includeMetadata?: boolean
  readonly includeLab?: boolean
  readonly includeHsl?: boolean
  readonly includeScores?: boolean
}

export interface LightnessOptions {
  readonly enforceGap?: boolean
  readonly minGap?: number
}

export interface RemoteOptions {
  readonly timeoutMs?: number
  readonly maxBytes?: number
  readonly maxRedirects?: number
  readonly allowedProtocols?: readonly string[]
  readonly allowPrivateNetworks?: boolean
  readonly validateContentType?: boolean
}

export type AnimatedHandling = 'first-frame' | 'all-frames' | 'disabled'

export type SvgHandling = 'disabled-in-node' | 'enabled-in-node' | 'disabled' | 'enabled'

export interface DecodeOptions {
  readonly maxPixels?: number
  readonly animated?: AnimatedHandling
  readonly svg?: SvgHandling
  readonly respectOrientation?: boolean
  readonly normalizeColorProfile?: boolean
}

export interface ExtractColorsOptions {
  readonly sampleSize?: number
  readonly paletteSize?: number
  readonly accents?: number

  readonly kmeans?: KmeansOptions
  readonly filtering?: FilteringOptions
  readonly primary?: PrimaryOptions
  readonly secondary?: SecondaryOptions
  readonly scoring?: ScoringOptions
  readonly output?: OutputOptions
  readonly lightness?: LightnessOptions
  readonly remote?: RemoteOptions
  readonly decode?: DecodeOptions
}
