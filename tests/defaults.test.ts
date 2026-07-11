import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPTIONS,
  resolveOptions,
  type ResolvedOptions,
} from '../src/core/defaults.js'

describe('DEFAULT_OPTIONS', () => {
  it('matches the documented spec defaults', () => {
    expect(DEFAULT_OPTIONS.sampleSize).toBe(150)
    expect(DEFAULT_OPTIONS.paletteSize).toBe(5)
    expect(DEFAULT_OPTIONS.accents).toBe(0)
  })

  it('kmeans defaults are { clusters: 5, iterations: 7 }', () => {
    expect(DEFAULT_OPTIONS.kmeans).toEqual({ clusters: 5, iterations: 7 })
  })

  it('filtering defaults are correct', () => {
    expect(DEFAULT_OPTIONS.filtering).toEqual({
      alphaThreshold: 128,
      minBrightness: 10,
      maxBrightness: 245,
      minSaturation: 8,
    })
  })

  it('primary default preset is strict', () => {
    expect(DEFAULT_OPTIONS.primary).toEqual({ preset: 'strict' })
  })

  it('secondary defaults are harmony / 20 / 150', () => {
    expect(DEFAULT_OPTIONS.secondary).toEqual({
      fallback: 'harmony',
      contrastMinDE: 20,
      harmonyFallbackDeg: 150,
    })
  })

  it('scoring defaults are { chromaFloor: 12, grayPenalty: 0.1 }', () => {
    expect(DEFAULT_OPTIONS.scoring).toEqual({ chromaFloor: 12, grayPenalty: 0.1 })
  })

  it('output defaults: includeHsl: true, others false', () => {
    expect(DEFAULT_OPTIONS.output).toEqual({
      includePalette: false,
      includeAccents: false,
      includeMetadata: false,
      includeLab: false,
      includeHsl: true,
      includeScores: false,
    })
  })

  it('lightness defaults are { enforceGap: false, minGap: 18 }', () => {
    expect(DEFAULT_OPTIONS.lightness).toEqual({ enforceGap: false, minGap: 18 })
  })

  it('remote defaults match spec', () => {
    expect(DEFAULT_OPTIONS.remote.timeoutMs).toBe(10_000)
    expect(DEFAULT_OPTIONS.remote.maxBytes).toBe(10_000_000)
    expect(DEFAULT_OPTIONS.remote.maxRedirects).toBe(3)
    expect(DEFAULT_OPTIONS.remote.allowedProtocols).toEqual(['http:', 'https:'])
    expect(DEFAULT_OPTIONS.remote.allowPrivateNetworks).toBe(false)
    expect(DEFAULT_OPTIONS.remote.validateContentType).toBe(true)
  })

  it('decode defaults match spec', () => {
    expect(DEFAULT_OPTIONS.decode.maxPixels).toBe(25_000_000)
    expect(DEFAULT_OPTIONS.decode.animated).toBe('first-frame')
    expect(DEFAULT_OPTIONS.decode.svg).toBe('disabled-in-node')
    expect(DEFAULT_OPTIONS.decode.respectOrientation).toBe(true)
    expect(DEFAULT_OPTIONS.decode.normalizeColorProfile).toBe(true)
  })
})

describe('resolveOptions', () => {
  describe('with no user input', () => {
    it('returns a clone of DEFAULT_OPTIONS', () => {
      const resolved = resolveOptions()
      expect(resolved).toEqual(DEFAULT_OPTIONS)
    })

    it('clone is a fresh object — mutating it does not affect DEFAULT_OPTIONS', () => {
      const resolved = resolveOptions()
      ;(resolved as { sampleSize: number }).sampleSize = 999
      expect(DEFAULT_OPTIONS.sampleSize).toBe(150)
    })

    it('clone of nested groups is also fresh', () => {
      const resolved = resolveOptions()
      ;(resolved.output as { includeHsl: boolean }).includeHsl = false
      expect(DEFAULT_OPTIONS.output.includeHsl).toBe(true)
    })
  })

  describe('partial nested merge (gherkin AC)', () => {
    it('user passes output.includePalette: true — palette becomes true, other output flags remain at defaults', () => {
      const resolved = resolveOptions({ output: { includePalette: true } })
      expect(resolved.output.includePalette).toBe(true)
      expect(resolved.output.includeAccents).toBe(false)
      expect(resolved.output.includeMetadata).toBe(false)
      expect(resolved.output.includeLab).toBe(false)
      expect(resolved.output.includeHsl).toBe(true)
      expect(resolved.output.includeScores).toBe(false)
    })

    it('unrelated option groups remain unchanged', () => {
      const resolved = resolveOptions({ output: { includePalette: true } })
      expect(resolved.kmeans).toEqual(DEFAULT_OPTIONS.kmeans)
      expect(resolved.filtering).toEqual(DEFAULT_OPTIONS.filtering)
      expect(resolved.primary).toEqual(DEFAULT_OPTIONS.primary)
      expect(resolved.secondary).toEqual(DEFAULT_OPTIONS.secondary)
      expect(resolved.scoring).toEqual(DEFAULT_OPTIONS.scoring)
      expect(resolved.lightness).toEqual(DEFAULT_OPTIONS.lightness)
      expect(resolved.remote).toEqual(DEFAULT_OPTIONS.remote)
      expect(resolved.decode).toEqual(DEFAULT_OPTIONS.decode)
    })
  })

  describe('top-level overrides', () => {
    it('user can override sampleSize at the top level', () => {
      const resolved = resolveOptions({ sampleSize: 200 })
      expect(resolved.sampleSize).toBe(200)
      expect(resolved.paletteSize).toBe(5)
    })

    it('user can override multiple top-level fields', () => {
      const resolved = resolveOptions({ sampleSize: 200, paletteSize: 8, accents: 4 })
      expect(resolved.sampleSize).toBe(200)
      expect(resolved.paletteSize).toBe(8)
      expect(resolved.accents).toBe(4)
    })
  })

  describe('deep overrides within groups', () => {
    it('user can override one field inside kmeans', () => {
      const resolved = resolveOptions({ kmeans: { iterations: 10 } })
      expect(resolved.kmeans.clusters).toBe(5)
      expect(resolved.kmeans.iterations).toBe(10)
    })

    it('user can override one field inside output', () => {
      const resolved = resolveOptions({ output: { includeScores: true } })
      expect(resolved.output.includeHsl).toBe(true)
      expect(resolved.output.includeScores).toBe(true)
    })

    it('user can override fields inside multiple groups simultaneously', () => {
      const resolved = resolveOptions({
        kmeans: { clusters: 8 },
        output: { includeLab: true, includeScores: true },
      })
      expect(resolved.kmeans).toEqual({ clusters: 8, iterations: 7 })
      expect(resolved.output.includeLab).toBe(true)
      expect(resolved.output.includeScores).toBe(true)
      expect(resolved.output.includeHsl).toBe(true)
    })
  })

  describe('arrays are replaced, not merged', () => {
    it('user override of allowedProtocols replaces the array', () => {
      const resolved = resolveOptions({ remote: { allowedProtocols: ['https:'] } })
      expect(resolved.remote.allowedProtocols).toEqual(['https:'])
    })
  })

  describe('undefined values are ignored', () => {
    it('passing undefined for a field does not override the default', () => {
      const resolved = resolveOptions({ sampleSize: undefined, kmeans: { clusters: undefined } })
      expect(resolved.sampleSize).toBe(150)
      expect(resolved.kmeans.clusters).toBe(5)
    })
  })

  describe('immutability from caller mutations', () => {
    it('mutating the result does not affect DEFAULT_OPTIONS', () => {
      const resolved = resolveOptions()
      ;(resolved as { sampleSize: number }).sampleSize = 999
      ;(resolved.output as { includeHsl: boolean }).includeHsl = false
      ;(resolved.remote as { maxBytes: number }).maxBytes = 1
      expect(DEFAULT_OPTIONS.sampleSize).toBe(150)
      expect(DEFAULT_OPTIONS.output.includeHsl).toBe(true)
      expect(DEFAULT_OPTIONS.remote.maxBytes).toBe(10_000_000)
    })

    it('regression: unprovided nested groups in user options do not share references with DEFAULT_OPTIONS (the exact case of the previous bug)', () => {
      const resolved = resolveOptions({ sampleSize: 200 })

      ;(resolved.output as { includeHsl: boolean }).includeHsl = false
      ;(resolved.output as { includePalette: boolean }).includePalette = true
      ;(resolved.remote as { maxBytes: number }).maxBytes = 1
      ;(resolved.remote as { allowedProtocols: string[] }).allowedProtocols = ['ftp:']
      ;(resolved.kmeans as { clusters: number }).clusters = 99
      ;(resolved.filtering as { alphaThreshold: number }).alphaThreshold = 0

      expect(DEFAULT_OPTIONS.output.includeHsl).toBe(true)
      expect(DEFAULT_OPTIONS.output.includePalette).toBe(false)
      expect(DEFAULT_OPTIONS.remote.maxBytes).toBe(10_000_000)
      expect(DEFAULT_OPTIONS.remote.allowedProtocols).toEqual(['http:', 'https:'])
      expect(DEFAULT_OPTIONS.kmeans.clusters).toBe(5)
      expect(DEFAULT_OPTIONS.filtering.alphaThreshold).toBe(128)

      expect(resolved.sampleSize).toBe(200)
    })

    it('regression: arrays inside unprovided groups have independent references from DEFAULT_OPTIONS', () => {
      const resolved = resolveOptions({ sampleSize: 200 })
      expect(resolved.remote.allowedProtocols).not.toBe(DEFAULT_OPTIONS.remote.allowedProtocols)
      expect(resolved.remote.allowedProtocols).toEqual(DEFAULT_OPTIONS.remote.allowedProtocols)

      ;(resolved.remote.allowedProtocols as string[]).push('ftp:')
      expect(DEFAULT_OPTIONS.remote.allowedProtocols).toEqual(['http:', 'https:'])
      expect(resolved.remote.allowedProtocols).toEqual(['http:', 'https:', 'ftp:'])
    })

    it('regression: user-provided nested group is also independent of DEFAULT_OPTIONS', () => {
      const resolved = resolveOptions({ kmeans: { clusters: 8 } })
      ;(resolved.kmeans as { iterations: number }).iterations = 99
      expect(DEFAULT_OPTIONS.kmeans.iterations).toBe(7)
      expect(resolved.kmeans.iterations).toBe(99)
    })
  })

  describe('DEFAULT_OPTIONS runtime immutability (Object.freeze)', () => {
    it('DEFAULT_OPTIONS is frozen at the top level', () => {
      expect(Object.isFrozen(DEFAULT_OPTIONS)).toBe(true)
    })

    it('DEFAULT_OPTIONS nested groups are frozen', () => {
      expect(Object.isFrozen(DEFAULT_OPTIONS.kmeans)).toBe(true)
      expect(Object.isFrozen(DEFAULT_OPTIONS.output)).toBe(true)
      expect(Object.isFrozen(DEFAULT_OPTIONS.remote)).toBe(true)
      expect(Object.isFrozen(DEFAULT_OPTIONS.decode)).toBe(true)
    })

    it('DEFAULT_OPTIONS arrays are frozen', () => {
      expect(Object.isFrozen(DEFAULT_OPTIONS.remote.allowedProtocols)).toBe(true)
    })

    it('attempting to mutate a top-level field throws in strict mode', () => {
      expect(() => {
        ;(DEFAULT_OPTIONS as unknown as { sampleSize: number }).sampleSize = 999
      }).toThrow(TypeError)
      expect(DEFAULT_OPTIONS.sampleSize).toBe(150)
    })

    it('attempting to mutate a nested field throws in strict mode', () => {
      expect(() => {
        ;(DEFAULT_OPTIONS.output as unknown as { includeHsl: boolean }).includeHsl = false
      }).toThrow(TypeError)
      expect(DEFAULT_OPTIONS.output.includeHsl).toBe(true)
    })

    it('attempting to push into a frozen array throws in strict mode', () => {
      expect(() => {
        ;(DEFAULT_OPTIONS.remote.allowedProtocols as unknown as string[]).push('ftp:')
      }).toThrow(TypeError)
      expect(DEFAULT_OPTIONS.remote.allowedProtocols).toEqual(['http:', 'https:'])
    })

    it('subsequent resolveOptions calls return defaults unchanged after attempted mutation', () => {
      try {
        ;(DEFAULT_OPTIONS as unknown as { sampleSize: number }).sampleSize = 999
      } catch { /* expected throw */ }
      const after = resolveOptions()
      expect(after.sampleSize).toBe(150)
    })
  })

  describe('resolved result is a fresh (mutable) copy', () => {
    it('resolveOptions() returns an unfrozen result so callers can mutate it', () => {
      const resolved = resolveOptions()
      expect(Object.isFrozen(resolved)).toBe(false)
      ;(resolved as { sampleSize: number }).sampleSize = 999
      expect(resolved.sampleSize).toBe(999)
    })

    it('resolveOptions with user options returns an unfrozen result', () => {
      const resolved = resolveOptions({ sampleSize: 200 })
      expect(Object.isFrozen(resolved)).toBe(false)
    })
  })

  describe('return type is fully resolved', () => {
    it('every top-level field is defined (not undefined)', () => {
      const resolved: ResolvedOptions = resolveOptions()
      expect(resolved.sampleSize).toBeDefined()
      expect(resolved.kmeans).toBeDefined()
      expect(resolved.output).toBeDefined()
      expect(resolved.remote).toBeDefined()
    })
  })
})
