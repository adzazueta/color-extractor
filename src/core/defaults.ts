import type { ExtractColorsOptions } from './options.js'

export type ResolvedOptions = {
  readonly [K in keyof ExtractColorsOptions]-?: ExtractColorsOptions[K]
}

export const DEFAULT_OPTIONS: ResolvedOptions = {
  sampleSize: 150,
  paletteSize: 5,
  accents: 0,
  kmeans: { clusters: 5, iterations: 7 },
  filtering: { alphaThreshold: 128, minBrightness: 10, maxBrightness: 245, minSaturation: 8 },
  primary: { preset: 'strict' },
  secondary: { fallback: 'harmony', contrastMinDE: 20, harmonyFallbackDeg: 150 },
  scoring: { chromaFloor: 12, grayPenalty: 0.1 },
  output: {
    includePalette: false,
    includeAccents: false,
    includeMetadata: false,
    includeLab: false,
    includeHsl: true,
    includeScores: false,
  },
  lightness: { enforceGap: false, minGap: 18 },
  remote: {
    timeoutMs: 10_000,
    maxBytes: 10_000_000,
    maxRedirects: 3,
    allowedProtocols: ['http:', 'https:'],
    allowPrivateNetworks: false,
    validateContentType: true,
  },
  decode: {
    maxPixels: 25_000_000,
    animated: 'first-frame',
    svg: 'disabled-in-node',
    respectOrientation: true,
    normalizeColorProfile: true,
  },
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepClone<T>(value: T): T {
  if (!isPlainObject(value)) {
    return value
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    const v = (value as Record<string, unknown>)[key]
    result[key] = Array.isArray(v) ? v.slice() : deepClone(v)
  }
  return result as T
}

function deepMerge<T>(defaults: T, user: Partial<T>): T {
  const defaultsRecord = defaults as unknown as Record<string, unknown>
  const userRecord = user as unknown as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(defaultsRecord)) {
    result[key] = deepClone(defaultsRecord[key])
  }
  for (const key of Object.keys(userRecord)) {
    const userValue = userRecord[key]
    if (userValue === undefined) {
      continue
    }
    if (isPlainObject(userValue) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], userValue)
    } else {
      result[key] = userValue
    }
  }
  return result as T
}

export function resolveOptions(user?: ExtractColorsOptions): ResolvedOptions {
  if (user === undefined) {
    return deepClone(DEFAULT_OPTIONS)
  }
  return deepMerge(DEFAULT_OPTIONS, user)
}
