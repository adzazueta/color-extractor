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

function deepMerge<T>(defaults: T, user: Partial<T>): T {
  const result = { ...defaults }
  for (const key of Object.keys(user) as Array<keyof T>) {
    const userValue = user[key]
    const defaultValue = defaults[key]
    if (userValue === undefined) {
      continue
    }
    if (isPlainObject(userValue) && isPlainObject(defaultValue)) {
      ;(result as Record<string, unknown>)[key as string] = deepMerge(
        defaultValue as Record<string, unknown>,
        userValue as Record<string, unknown>,
      )
    } else {
      ;(result as Record<string, unknown>)[key as string] = userValue
    }
  }
  return result
}

export function resolveOptions(user?: ExtractColorsOptions): ResolvedOptions {
  if (user === undefined) {
    return deepClone(DEFAULT_OPTIONS)
  }
  return deepMerge(DEFAULT_OPTIONS, user)
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
