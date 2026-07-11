import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  ColorRole,
  ColorSource,
  ExtractedColor,
  HSL,
  Lab,
  RGB,
} from '../../src/core/types.js'

describe('RGB', () => {
  it('has r, g, b as number', () => {
    expectTypeOf<RGB['r']>().toEqualTypeOf<number>()
    expectTypeOf<RGB['g']>().toEqualTypeOf<number>()
    expectTypeOf<RGB['b']>().toEqualTypeOf<number>()
  })

  it('is constructible with all three channels', () => {
    const color: RGB = { r: 255, g: 128, b: 0 }
    expect(color.r).toBe(255)
    expect(color.g).toBe(128)
    expect(color.b).toBe(0)
  })
})

describe('HSL', () => {
  it('has h, s, l as number', () => {
    expectTypeOf<HSL['h']>().toEqualTypeOf<number>()
    expectTypeOf<HSL['s']>().toEqualTypeOf<number>()
    expectTypeOf<HSL['l']>().toEqualTypeOf<number>()
  })

  it('is constructible', () => {
    const color: HSL = { h: 120, s: 0.5, l: 0.4 }
    expect(color.h).toBe(120)
    expect(color.s).toBe(0.5)
    expect(color.l).toBe(0.4)
  })
})

describe('Lab', () => {
  it('has L, a, b as number', () => {
    expectTypeOf<Lab['L']>().toEqualTypeOf<number>()
    expectTypeOf<Lab['a']>().toEqualTypeOf<number>()
    expectTypeOf<Lab['b']>().toEqualTypeOf<number>()
  })

  it('is constructible', () => {
    const color: Lab = { L: 50, a: 20, b: -30 }
    expect(color.L).toBe(50)
  })
})

describe('ColorRole', () => {
  it('is a union of the four documented roles', () => {
    expectTypeOf<ColorRole>().toEqualTypeOf<'primary' | 'secondary' | 'accent' | 'palette'>()
  })

  it.each(['primary', 'secondary', 'accent', 'palette'] as const)(
    'accepts "%s" as a valid role',
    (role) => {
      const r: ColorRole = role
      expect(r).toBe(role)
    },
  )
})

describe('ColorSource', () => {
  it('is a union of the three documented sources', () => {
    expectTypeOf<ColorSource>().toEqualTypeOf<'cluster' | 'fallback' | 'adjusted'>()
  })

  it.each(['cluster', 'fallback', 'adjusted'] as const)(
    'accepts "%s" as a valid source',
    (source) => {
      const s: ColorSource = source
      expect(s).toBe(source)
    },
  )
})

describe('ExtractedColor', () => {
  it('requires hex (string) and rgb (RGB)', () => {
    const color: ExtractedColor = {
      hex: '#ff8040',
      rgb: { r: 255, g: 128, b: 64 },
    }
    expect(color.hex).toBe('#ff8040')
    expect(color.rgb.r).toBe(255)
  })

  it('treats hsl, lab, chroma, population, proportion, score, role, source as optional', () => {
    const color: ExtractedColor = {
      hex: '#000000',
      rgb: { r: 0, g: 0, b: 0 },
    }
    expect(color.hsl).toBeUndefined()
    expect(color.lab).toBeUndefined()
    expect(color.chroma).toBeUndefined()
    expect(color.population).toBeUndefined()
    expect(color.proportion).toBeUndefined()
    expect(color.score).toBeUndefined()
    expect(color.role).toBeUndefined()
    expect(color.source).toBeUndefined()
  })

  it('accepts the full set of optional fields', () => {
    const color: ExtractedColor = {
      hex: '#ff0000',
      rgb: { r: 255, g: 0, b: 0 },
      hsl: { h: 0, s: 1, l: 0.5 },
      lab: { L: 53.24, a: 80.09, b: 67.2 },
      chroma: 104.55,
      population: 1234,
      proportion: 0.42,
      score: 0.91,
      role: 'primary',
      source: 'cluster',
    }
    expect(color.role).toBe('primary')
    expect(color.source).toBe('cluster')
    expect(color.chroma).toBe(104.55)
  })
})
