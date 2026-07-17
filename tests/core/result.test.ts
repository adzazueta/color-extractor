import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ExtractedColor } from '../../src/core/types.js'
import type {
  ExtractColorsResult,
  ExtractionMetadata,
  MinimalExtractColorsResult,
} from '../../src/core/result.js'

function makeColor(): ExtractedColor {
  return { hex: '#ff8040', rgb: { r: 255, g: 128, b: 64 } }
}

describe('MinimalExtractColorsResult', () => {
  it('requires primary as ExtractedColor', () => {
    expectTypeOf<MinimalExtractColorsResult['primary']>().toEqualTypeOf<ExtractedColor>()
  })

  it('requires secondary as ExtractedColor | null', () => {
    expectTypeOf<MinimalExtractColorsResult['secondary']>().toEqualTypeOf<ExtractedColor | null>()
  })

  it('accepts a minimal result with both colors', () => {
    const result: MinimalExtractColorsResult = {
      primary: makeColor(),
      secondary: makeColor(),
    }
    expect(result.primary.hex).toBe('#ff8040')
    expect(result.secondary?.hex).toBe('#ff8040')
  })

  it('accepts a minimal result with null secondary (fallback failed)', () => {
    const result: MinimalExtractColorsResult = {
      primary: makeColor(),
      secondary: null,
    }
    expect(result.secondary).toBeNull()
  })
})

describe('ExtractColorsResult', () => {
  it('extends MinimalExtractColorsResult (has primary and secondary)', () => {
    const result: ExtractColorsResult = {
      primary: makeColor(),
      secondary: makeColor(),
    }
    expectTypeOf(result).toMatchTypeOf<MinimalExtractColorsResult>()
  })

  it('accents is an optional readonly ExtractedColor array', () => {
    expectTypeOf<ExtractColorsResult['accents']>().toEqualTypeOf<readonly ExtractedColor[] | undefined>()
  })

  it('palette is an optional readonly ExtractedColor array', () => {
    expectTypeOf<ExtractColorsResult['palette']>().toEqualTypeOf<readonly ExtractedColor[] | undefined>()
  })

  it('metadata is optional ExtractionMetadata', () => {
    expectTypeOf<ExtractColorsResult['metadata']>().toEqualTypeOf<ExtractionMetadata | undefined>()
  })

  it('full result can include all optional fields', () => {
    const result: ExtractColorsResult = {
      primary: makeColor(),
      secondary: makeColor(),
      accents: [makeColor(), makeColor()],
      palette: [makeColor(), makeColor(), makeColor()],
      metadata: {
        algorithm: 'lab-kmeans-chroma-weighted',
        cacheVersion: '1.0',
        sampleSize: 150,
        sampledPixels: 22500,
        validPixels: 18000,
        clusters: 5,
        iterations: 7,
        primaryPreset: 'strict',
        secondaryFallback: 'harmony',
        fallbackUsed: false,
        runtime: 'node',
      },
    }
    expect(result.accents?.length).toBe(2)
    expect(result.palette?.length).toBe(3)
    expect(result.metadata?.primaryPreset).toBe('strict')
  })

  it('default extraction returns only primary and secondary (palette and metadata excluded)', () => {
    const result: ExtractColorsResult = {
      primary: makeColor(),
      secondary: makeColor(),
    }
    expect(result.palette).toBeUndefined()
    expect(result.metadata).toBeUndefined()
    expect(result.accents).toBeUndefined()
  })
})

describe('ExtractionMetadata', () => {
  it('algorithm is the literal "lab-kmeans-chroma-weighted"', () => {
    expectTypeOf<ExtractionMetadata['algorithm']>().toEqualTypeOf<'lab-kmeans-chroma-weighted'>()
  })

  it('runtime is the union of three runtime names', () => {
    expectTypeOf<ExtractionMetadata['runtime']>().toEqualTypeOf<'browser' | 'node' | 'core'>()
  })

  it('decoder is an optional union of decoder names', () => {
    expectTypeOf<ExtractionMetadata['decoder']>().toEqualTypeOf<
      'canvas' | 'sharp' | 'image-data' | 'pixels' | undefined
    >()
  })

  it('fallbackUsed is a required boolean', () => {
    expectTypeOf<ExtractionMetadata['fallbackUsed']>().toEqualTypeOf<boolean>()
  })

  it('cacheVersion is a required string', () => {
    expectTypeOf<ExtractionMetadata['cacheVersion']>().toEqualTypeOf<string>()
  })

  it('packageVersion is optional', () => {
    expectTypeOf<ExtractionMetadata['packageVersion']>().toEqualTypeOf<string | undefined>()
  })

  it('numeric metrics are required numbers', () => {
    expectTypeOf<ExtractionMetadata['sampleSize']>().toEqualTypeOf<number>()
    expectTypeOf<ExtractionMetadata['sampledPixels']>().toEqualTypeOf<number>()
    expectTypeOf<ExtractionMetadata['validPixels']>().toEqualTypeOf<number>()
    expectTypeOf<ExtractionMetadata['clusters']>().toEqualTypeOf<number>()
    expectTypeOf<ExtractionMetadata['iterations']>().toEqualTypeOf<number>()
  })

  it('accepts a fully populated metadata', () => {
    const meta: ExtractionMetadata = {
      algorithm: 'lab-kmeans-chroma-weighted',
      packageVersion: '0.1.0',
      cacheVersion: '1.0',
      sampleSize: 150,
      sampledPixels: 22500,
      validPixels: 18000,
      clusters: 5,
      iterations: 7,
      primaryPreset: 'strict',
      secondaryFallback: 'harmony',
      fallbackUsed: false,
      runtime: 'node',
      decoder: 'sharp',
    }
    expect(meta.algorithm).toBe('lab-kmeans-chroma-weighted')
    expect(meta.decoder).toBe('sharp')
  })
})
