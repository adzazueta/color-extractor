import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  AnimatedHandling,
  DecodeOptions,
  ExtractColorsOptions,
  FilteringOptions,
  KmeansOptions,
  LightnessOptions,
  OutputOptions,
  PrimaryOptions,
  PrimaryPreset,
  RemoteOptions,
  ScoringOptions,
  SecondaryFallbackMode,
  SecondaryOptions,
  SvgHandling,
} from '../src/core/options.js'

describe('KmeansOptions', () => {
  it('has clusters and iterations as optional numbers', () => {
    expectTypeOf<KmeansOptions['clusters']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<KmeansOptions['iterations']>().toEqualTypeOf<number | undefined>()
  })

  it('accepts an empty object', () => {
    const opts: KmeansOptions = {}
    expect(opts.clusters).toBeUndefined()
  })
})

describe('FilteringOptions', () => {
  it('has alpha, brightness, and saturation as optional numbers', () => {
    expectTypeOf<FilteringOptions['alphaThreshold']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<FilteringOptions['minBrightness']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<FilteringOptions['maxBrightness']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<FilteringOptions['minSaturation']>().toEqualTypeOf<number | undefined>()
  })
})

describe('PrimaryPreset', () => {
  it('is the union of four documented presets', () => {
    expectTypeOf<PrimaryPreset>().toEqualTypeOf<'strict' | 'balanced' | 'vibrant' | 'dominant'>()
  })

  it.each(['strict', 'balanced', 'vibrant', 'dominant'] as const)(
    'accepts "%s" as a valid preset',
    (preset) => {
      const opts: PrimaryOptions = { preset }
      expect(opts.preset).toBe(preset)
    },
  )
})

describe('SecondaryFallbackMode', () => {
  it('is the union of three documented modes', () => {
    expectTypeOf<SecondaryFallbackMode>().toEqualTypeOf<'harmony' | 'null' | 'nearest'>()
  })

  it.each(['harmony', 'null', 'nearest'] as const)(
    'accepts "%s" as a valid fallback',
    (fallback) => {
      const opts: SecondaryOptions = { fallback }
      expect(opts.fallback).toBe(fallback)
    },
  )
})

describe('ScoringOptions', () => {
  it('has chromaFloor and grayPenalty as optional numbers', () => {
    expectTypeOf<ScoringOptions['chromaFloor']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ScoringOptions['grayPenalty']>().toEqualTypeOf<number | undefined>()
  })
})

describe('OutputOptions', () => {
  it('has all six output flags as optional booleans', () => {
    expectTypeOf<OutputOptions['includePalette']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<OutputOptions['includeAccents']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<OutputOptions['includeMetadata']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<OutputOptions['includeLab']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<OutputOptions['includeHsl']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<OutputOptions['includeScores']>().toEqualTypeOf<boolean | undefined>()
  })
})

describe('LightnessOptions', () => {
  it('has enforceGap (boolean) and minGap (number) as optional', () => {
    expectTypeOf<LightnessOptions['enforceGap']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<LightnessOptions['minGap']>().toEqualTypeOf<number | undefined>()
  })
})

describe('RemoteOptions', () => {
  it('has all six fields as optional', () => {
    expectTypeOf<RemoteOptions['timeoutMs']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<RemoteOptions['maxBytes']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<RemoteOptions['maxRedirects']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<RemoteOptions['allowPrivateNetworks']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<RemoteOptions['validateContentType']>().toEqualTypeOf<boolean | undefined>()
  })

  it('allowedProtocols is an optional readonly string array', () => {
    expectTypeOf<RemoteOptions['allowedProtocols']>().toEqualTypeOf<readonly string[] | undefined>()
  })
})

describe('DecodeOptions', () => {
  it('has maxPixels and orientation as optional', () => {
    expectTypeOf<DecodeOptions['maxPixels']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<DecodeOptions['respectOrientation']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<DecodeOptions['normalizeColorProfile']>().toEqualTypeOf<boolean | undefined>()
  })

  it('animated is the union of handling modes', () => {
    expectTypeOf<DecodeOptions['animated']>().toEqualTypeOf<AnimatedHandling | undefined>()
  })

  it('svg is the union of handling modes', () => {
    expectTypeOf<DecodeOptions['svg']>().toEqualTypeOf<SvgHandling | undefined>()
  })
})

describe('ExtractColorsOptions', () => {
  it('accepts an empty object (all fields optional)', () => {
    const opts: ExtractColorsOptions = {}
    expect(opts.sampleSize).toBeUndefined()
  })

  it('accepts only top-level fields', () => {
    const opts: ExtractColorsOptions = {
      sampleSize: 150,
      paletteSize: 5,
      accents: 3,
    }
    expect(opts.sampleSize).toBe(150)
  })

  it('accepts only grouped options', () => {
    const opts: ExtractColorsOptions = {
      kmeans: { clusters: 5, iterations: 7 },
      filtering: { alphaThreshold: 128, minSaturation: 8 },
      primary: { preset: 'strict' },
      secondary: { fallback: 'harmony', contrastMinDE: 20 },
      scoring: { chromaFloor: 12, grayPenalty: 0.1 },
      output: { includePalette: true, includeHsl: true },
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
    expect(opts.kmeans?.clusters).toBe(5)
    expect(opts.primary?.preset).toBe('strict')
    expect(opts.remote?.allowedProtocols).toEqual(['http:', 'https:'])
    expect(opts.decode?.svg).toBe('disabled-in-node')
  })

  it('groups remain independent — partial nested config does not clobber defaults', () => {
    const partial: ExtractColorsOptions = { output: { includePalette: true } }
    expect(partial.output?.includePalette).toBe(true)
    expect(partial.output?.includeAccents).toBeUndefined()
  })

  it('runtime-only groups (remote, decode) live in the shared type', () => {
    const opts: ExtractColorsOptions = {
      remote: { allowPrivateNetworks: true },
      decode: { svg: 'enabled-in-node' },
    }
    expect(opts.remote?.allowPrivateNetworks).toBe(true)
    expect(opts.decode?.svg).toBe('enabled-in-node')
  })
})
