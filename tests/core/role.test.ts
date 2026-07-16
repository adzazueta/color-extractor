import { describe, it, expect } from 'vitest'
import {
  scorePrimary,
  findPrimaryIndex,
  buildPrimaryColor,
  applyGrayPenalty,
  isLowChromaCandidate,
  hueWeight,
  contrastBoost,
  scoreSecondary,
  buildHarmonyFallback,
  selectSecondary,
  buildPalette,
  filterByContrastThreshold,
} from '../../src/core/role.js'
import type { Cluster } from '../../src/core/kmeans.js'
import { DEFAULT_OPTIONS, type ResolvedOptions } from '../../src/core/defaults.js'

function cluster(
  chroma: number,
  population: number,
  proportion: number,
): Cluster {
  return {
    index: 0,
    lab: { L: 50, a: chroma, b: 0 },
    rgb: { r: 128, g: 128, b: 128 },
    hsl: { h: 0, s: 0, l: 50 },
    population,
    proportion,
    chroma,
    score: 0,
  }
}

function labCluster(
  L: number,
  a: number,
  b: number,
  population: number,
  proportion: number = 0.1,
): Cluster {
  return {
    index: 0,
    lab: { L, a, b },
    rgb: { r: 128, g: 128, b: 128 },
    hsl: { h: 0, s: 0, l: 50 },
    population,
    proportion,
    chroma: Math.sqrt(a * a + b * b),
    score: 0,
  }
}

describe('scorePrimary (ADZ-44)', () => {
  describe('AC: strict primary prefers vivid perceptual dominance', () => {
    it('a smaller high-chroma cluster beats a larger muted cluster', () => {
      const muted = cluster(5, 1000, 0.8)
      const vivid = cluster(40, 10, 0.1)
      expect(scorePrimary(vivid)).toBeGreaterThan(scorePrimary(muted))
    })

    it('uses chroma * log(population + 1)', () => {
      const c = cluster(20, 99, 0.5)
      const expected = 20 * Math.log(100)
      expect(scorePrimary(c)).toBeCloseTo(expected, 10)
    })

    it('returns 0 for a cluster with population 0 and chroma 0', () => {
      expect(scorePrimary(cluster(0, 0, 0))).toBe(0)
    })
  })
})

describe('findPrimaryIndex (ADZ-44)', () => {
  describe('AC: selects the highest-scoring cluster as primary', () => {
    it('returns the index of the highest strict score', () => {
      const a = cluster(5, 1000, 0.8)
      const b = cluster(40, 10, 0.1)
      const c = cluster(15, 200, 0.1)
      expect(findPrimaryIndex([a, b, c])).toBe(1)
    })

    it('returns 0 when only one cluster is provided', () => {
      expect(findPrimaryIndex([cluster(10, 100, 1)])).toBe(0)
    })

    it('returns -1 when no clusters are provided', () => {
      expect(findPrimaryIndex([])).toBe(-1)
    })

    it('breaks ties to the earlier index (stable)', () => {
      const a = cluster(10, 99, 0.5)
      const b = cluster(10, 99, 0.5)
      expect(findPrimaryIndex([a, b])).toBe(0)
    })
  })
})

describe('buildPrimaryColor (ADZ-44)', () => {
  describe('AC: store score when output flags request it', () => {
    it('marks the color as primary with role=primary and source=cluster', () => {
      const c = cluster(30, 50, 0.25)
      const color = buildPrimaryColor(c)
      expect(color.role).toBe('primary')
      expect(color.source).toBe('cluster')
      expect(color.chroma).toBe(30)
      expect(color.population).toBe(50)
      expect(color.proportion).toBe(0.25)
    })

    it('forwards lab, rgb, and hsl from the cluster', () => {
      const c: Cluster = {
        index: 0,
        lab: { L: 40, a: 20, b: -10 },
        rgb: { r: 200, g: 100, b: 50 },
        hsl: { h: 30, s: 80, l: 50 },
        population: 10,
        proportion: 0.5,
        chroma: 25,
        score: 0,
      }
      const color = buildPrimaryColor(c)
      expect(color.lab).toEqual({ L: 40, a: 20, b: -10 })
      expect(color.rgb).toEqual({ r: 200, g: 100, b: 50 })
      expect(color.hsl).toEqual({ h: 30, s: 80, l: 50 })
    })
  })
})

describe('scorePrimary presets (ADZ-39)', () => {
  describe('AC: each preset produces deterministic scores', () => {
    it('balanced uses chroma^1.25 * log(pop+1)', () => {
      const c = cluster(20, 99, 0.5)
      const expected = Math.pow(20, 1.25) * Math.log(100)
      expect(scorePrimary(c, 'balanced')).toBeCloseTo(expected, 10)
    })

    it('vibrant uses chroma^1.75 * log(pop+1)', () => {
      const c = cluster(20, 99, 0.5)
      const expected = Math.pow(20, 1.75) * Math.log(100)
      expect(scorePrimary(c, 'vibrant')).toBeCloseTo(expected, 10)
    })

    it('dominant returns raw population (chroma is ignored)', () => {
      const lowChromaHighPop = cluster(2, 500, 0.5)
      const highChromaLowPop = cluster(80, 50, 0.5)
      expect(scorePrimary(lowChromaHighPop, 'dominant')).toBe(500)
      expect(scorePrimary(highChromaLowPop, 'dominant')).toBe(50)
    })
  })

  describe('AC: dominant selects by population', () => {
    it('findPrimaryIndex with dominant picks the highest-population cluster regardless of chroma', () => {
      const a = cluster(5, 10, 0.05)
      const b = cluster(50, 8, 0.04)
      const c = cluster(80, 1, 0.01)
      expect(findPrimaryIndex([a, b, c], 'dominant')).toBe(0)
    })
  })

  describe('AC: vibrant favors high-chroma clusters more strongly than strict', () => {
    it('on identical populations, vibrant gives a larger boost to high chroma than strict', () => {
      const a = cluster(10, 100, 0.5)
      const b = cluster(40, 100, 0.5)
      const strictGap = scorePrimary(b, 'strict') - scorePrimary(a, 'strict')
      const vibrantGap = scorePrimary(b, 'vibrant') - scorePrimary(a, 'vibrant')
      expect(vibrantGap).toBeGreaterThan(strictGap)
    })

    it('balanced gives a stronger chroma preference than strict but milder than vibrant', () => {
      const a = cluster(10, 100, 0.5)
      const b = cluster(40, 100, 0.5)
      const strictGap = scorePrimary(b, 'strict') - scorePrimary(a, 'strict')
      const balancedGap = scorePrimary(b, 'balanced') - scorePrimary(a, 'balanced')
      const vibrantGap = scorePrimary(b, 'vibrant') - scorePrimary(a, 'vibrant')
      expect(balancedGap).toBeGreaterThan(strictGap)
      expect(vibrantGap).toBeGreaterThan(balancedGap)
    })
  })

  describe('AC: preset selection is configurable', () => {
    it('findPrimaryIndex with vibrant can prefer smaller high-chroma over larger muted', () => {
      const muted = cluster(5, 1000, 0.8)
      const vivid = cluster(40, 10, 0.1)
      expect(findPrimaryIndex([muted, vivid], 'vibrant')).toBe(1)
    })

    it('findPrimaryIndex with dominant prefers the largest cluster regardless of chroma', () => {
      const vivid = cluster(80, 10, 0.05)
      const muted = cluster(5, 1000, 0.95)
      expect(findPrimaryIndex([vivid, muted], 'dominant')).toBe(1)
    })
  })
})

describe('applyGrayPenalty (ADZ-48)', () => {
  function options(overrides: { chromaFloor?: number; grayPenalty?: number } = {}): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      scoring: {
        chromaFloor: overrides.chromaFloor ?? 12,
        grayPenalty: overrides.grayPenalty ?? 0.1,
      },
    }
  }

  describe('AC: defaults use chromaFloor 12 and grayPenalty 0.1', () => {
    it('penalizes a cluster whose chroma is below the default floor of 12', () => {
      const gray = cluster(5, 200, 0.5)
      expect(isLowChromaCandidate(gray, DEFAULT_OPTIONS)).toBe(true)
      expect(applyGrayPenalty(100, gray, DEFAULT_OPTIONS)).toBeCloseTo(10, 10)
    })

    it('does not penalize a cluster whose chroma is at or above the default floor', () => {
      const vivid = cluster(12, 200, 0.5)
      const vividAbove = cluster(40, 200, 0.5)
      expect(isLowChromaCandidate(vivid, DEFAULT_OPTIONS)).toBe(false)
      expect(isLowChromaCandidate(vividAbove, DEFAULT_OPTIONS)).toBe(false)
      expect(applyGrayPenalty(100, vivid, DEFAULT_OPTIONS)).toBe(100)
      expect(applyGrayPenalty(100, vividAbove, DEFAULT_OPTIONS)).toBe(100)
    })
  })

  describe('AC: low-chroma candidates are not impossible to select, only penalized', () => {
    it('a high-pop gray can still beat a low-pop vivid when the gap is large enough', () => {
      const gray = cluster(5, 10_000, 0.9)
      const vivid = cluster(40, 50, 0.05)
      const opts = options()
      const grayScore = applyGrayPenalty(gray.population, gray, opts)
      const vividScore = applyGrayPenalty(vivid.population, vivid, opts)
      expect(grayScore).toBeGreaterThan(vividScore)
    })
  })

  describe('AC: keep behavior configurable', () => {
    it('respects a custom chromaFloor', () => {
      const c = cluster(8, 100, 0.5)
      expect(isLowChromaCandidate(c, options({ chromaFloor: 5 }))).toBe(false)
      expect(isLowChromaCandidate(c, options({ chromaFloor: 10 }))).toBe(true)
    })

    it('respects a custom grayPenalty', () => {
      const c = cluster(5, 100, 0.5)
      expect(applyGrayPenalty(100, c, options({ grayPenalty: 0.5 }))).toBeCloseTo(50, 10)
      expect(applyGrayPenalty(100, c, options({ grayPenalty: 0.0 }))).toBe(0)
    })

    it('a grayPenalty of 1 effectively disables the penalty (still a no-op multiplier)', () => {
      const c = cluster(5, 100, 0.5)
      expect(applyGrayPenalty(100, c, options({ grayPenalty: 1 }))).toBe(100)
    })
  })

  describe('AC: penalty is reflected in score output when enabled', () => {
    it('reduces the score proportionally to grayPenalty', () => {
      const c = cluster(5, 100, 0.5)
      const base = 100
      const result = applyGrayPenalty(base, c, DEFAULT_OPTIONS)
      expect(result).toBeCloseTo(base * 0.1, 10)
    })
  })
})

describe('hueWeight (ADZ-42)', () => {
  describe('AC: complementary candidates receive higher hue weight than same-hue candidates', () => {
    it('returns 0.5 for exactly same-hue candidates', () => {
      const primary = labCluster(50, 50, 0, 100)
      const sameHue = labCluster(50, 50, 0, 100)
      expect(hueWeight(primary, sameHue)).toBeCloseTo(0.5, 10)
    })

    it('returns 1.5 for exactly complementary candidates (180° apart)', () => {
      const primary = labCluster(50, 50, 0, 100)
      const complementary = labCluster(50, -50, 0, 100)
      expect(hueWeight(primary, complementary)).toBeCloseTo(1.5, 10)
    })

    it('returns ~1.5 for split-complementary candidates (150° apart)', () => {
      const primary = labCluster(50, 50, 0, 100)
      const angle = (150 * Math.PI) / 180
      const a = 50 * Math.cos(angle)
      const b = 50 * Math.sin(angle)
      const split = labCluster(50, a, b, 100)
      expect(hueWeight(primary, split)).toBeCloseTo(1.5, 10)
    })

    it('complementary always outscores same-hue regardless of axis', () => {
      const primary = labCluster(50, 0, 50, 100)
      const sameHue = labCluster(50, 0, 50, 100)
      const complementary = labCluster(50, 0, -50, 100)
      expect(hueWeight(primary, complementary)).toBeGreaterThan(hueWeight(primary, sameHue))
    })
  })

  describe('AC: weight is bounded and non-negative', () => {
    it('returns at least 0.5 (max same-hue penalty)', () => {
      const primary = labCluster(50, 50, 0, 100)
      const sameHue = labCluster(50, 50, 0, 100)
      expect(hueWeight(primary, sameHue)).toBeGreaterThanOrEqual(0.5)
    })

    it('returns at most 1.5 (max complementary boost)', () => {
      const primary = labCluster(50, 50, 0, 100)
      const complementary = labCluster(50, -50, 0, 100)
      expect(hueWeight(primary, complementary)).toBeLessThanOrEqual(1.5)
    })
  })
})

describe('contrastBoost (ADZ-42)', () => {
  function options(contrastMinDE: number = 20): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      secondary: {
        fallback: 'harmony',
        contrastMinDE,
        harmonyFallbackDeg: 150,
      },
    }
  }

  describe('AC: candidates with sufficient contrast get full boost (1.0)', () => {
    it('returns 1 when Delta E equals the minimum', () => {
      const primary = labCluster(50, 0, 0, 100)
      const far = labCluster(70, 0, 0, 100)
      expect(contrastBoost(primary, far, options(20))).toBe(1)
    })

    it('returns 1 when Delta E exceeds the minimum', () => {
      const primary = labCluster(50, 0, 0, 100)
      const veryFar = labCluster(95, 0, 0, 100)
      expect(contrastBoost(primary, veryFar, options(20))).toBe(1)
    })
  })

  describe('AC: low-contrast candidates receive a reduced boost', () => {
    it('returns proportional boost below the minimum Delta E', () => {
      const primary = labCluster(50, 0, 0, 100)
      const close = labCluster(60, 0, 0, 100)
      const de = 10
      const expected = de / 20
      expect(contrastBoost(primary, close, options(20))).toBeCloseTo(expected, 10)
    })

    it('returns 0 for identical candidates', () => {
      const primary = labCluster(50, 0, 0, 100)
      expect(contrastBoost(primary, primary, options(20))).toBe(0)
    })
  })

  describe('AC: respects custom contrastMinDE from options', () => {
    it('a candidate that passes at contrastMinDE=10 fails at contrastMinDE=40', () => {
      const primary = labCluster(50, 0, 0, 100)
      const candidate = labCluster(65, 0, 0, 100)
      expect(contrastBoost(primary, candidate, options(10))).toBe(1)
      expect(contrastBoost(primary, candidate, options(40))).toBeCloseTo(15 / 40, 10)
    })
  })
})

describe('scoreSecondary (ADZ-42)', () => {
  describe('AC: uses chroma^2 * log(population + 1) as the base score', () => {
    it('matches chroma^2 * log(pop+1) for a neutral hue weight and full contrast', () => {
      const primary = labCluster(50, 50, 0, 100)
      const candidate = labCluster(95, 0, 50, 100, 0.1)
      const options: ResolvedOptions = {
        ...DEFAULT_OPTIONS,
        secondary: { fallback: 'harmony', contrastMinDE: 0, harmonyFallbackDeg: 150 },
      }
      const expected = 50 * 50 * Math.log(101)
      expect(scoreSecondary(primary, candidate, options)).toBeCloseTo(expected, 10)
    })
  })

  describe('AC: same-hue candidates receive lower hue weight than complementary candidates', () => {
    it('complementary wins over same-hue at equal chroma and population', () => {
      const primary = labCluster(50, 50, 0, 100)
      const sameHue = labCluster(50, 50, 0, 100, 0.1)
      const complementary = labCluster(50, -50, 0, 100, 0.1)
      const same = scoreSecondary(primary, sameHue, DEFAULT_OPTIONS)
      const comp = scoreSecondary(primary, complementary, DEFAULT_OPTIONS)
      expect(comp).toBeGreaterThan(same)
    })
  })

  describe('AC: low-population candidates can still win when chroma and contrast are strong', () => {
    it('a small vivid complementary candidate beats a large muted same-hue candidate', () => {
      const primary = labCluster(50, 50, 0, 100)
      const smallVivid = labCluster(50, -80, 0, 5, 0.01)
      const largeMuted = labCluster(50, 5, 0, 5000, 0.9)
      const smallScore = scoreSecondary(primary, smallVivid, DEFAULT_OPTIONS)
      const largeScore = scoreSecondary(primary, largeMuted, DEFAULT_OPTIONS)
      expect(smallScore).toBeGreaterThan(largeScore)
    })
  })

  describe('AC: gray penalty still applies to low-chroma secondary candidates', () => {
    it('a same-hue low-chroma candidate is heavily penalized', () => {
      const primary = labCluster(50, 50, 0, 100)
      const gray = labCluster(50, 5, 0, 200, 0.1)
      const vivid = labCluster(50, -50, 0, 200, 0.1)
      const grayScore = scoreSecondary(primary, gray, DEFAULT_OPTIONS)
      const vividScore = scoreSecondary(primary, vivid, DEFAULT_OPTIONS)
      expect(vividScore).toBeGreaterThan(grayScore)
    })
  })
})

function hslCluster(h: number, s: number, l: number, population: number = 100): Cluster {
  const hueRad = (h * Math.PI) / 180
  const a = 50 * Math.cos(hueRad)
  const b = 50 * Math.sin(hueRad)
  return {
    index: 0,
    lab: { L: 50, a, b },
    rgb: { r: 0, g: 0, b: 0 },
    hsl: { h, s, l },
    population,
    proportion: 0.1,
    chroma: 50,
    score: 0,
  }
}

describe('buildHarmonyFallback (ADZ-43)', () => {
  function options(overrides: { harmonyFallbackDeg?: number } = {}): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      secondary: {
        fallback: 'harmony',
        contrastMinDE: 20,
        harmonyFallbackDeg: overrides.harmonyFallbackDeg ?? 150,
      },
    }
  }

  describe('AC: secondary is generated from primary hue rotation', () => {
    it('rotates the primary hue by the configured harmonyFallbackDeg', () => {
      const primary = hslCluster(0, 0.5, 0.5)
      const fb = buildHarmonyFallback(primary, options({ harmonyFallbackDeg: 150 }))
      expect(fb.hsl).toBeDefined()
      expect(fb.hsl!.h).toBeCloseTo(150, 5)
    })

    it('uses 180 by default for complementary rotation', () => {
      const primary = hslCluster(0, 0.5, 0.5)
      const fb = buildHarmonyFallback(primary, options({ harmonyFallbackDeg: 180 }))
      expect(fb.hsl!.h).toBeCloseTo(180, 5)
    })

    it('normalizes hue wraparound into [0, 360)', () => {
      const primary = hslCluster(300, 0.5, 0.5)
      const fb = buildHarmonyFallback(primary, options({ harmonyFallbackDeg: 150 }))
      expect(fb.hsl!.h).toBeCloseTo(90, 5)
      expect(fb.hsl!.h).toBeGreaterThanOrEqual(0)
      expect(fb.hsl!.h).toBeLessThan(360)
    })
  })

  describe('AC: applies saturation and lightness floors', () => {
    it('raises saturation when primary saturation is below the floor', () => {
      const primary = hslCluster(0, 0.1, 0.5)
      const fb = buildHarmonyFallback(primary, options())
      expect(fb.hsl!.s).toBeGreaterThanOrEqual(0.4)
    })

    it('keeps saturation when primary saturation already meets the floor', () => {
      const primary = hslCluster(0, 0.8, 0.5)
      const fb = buildHarmonyFallback(primary, options())
      expect(fb.hsl!.s).toBeCloseTo(0.8, 5)
    })

    it('clamps lightness into [0.3, 0.7]', () => {
      const tooDark = hslCluster(0, 0.5, 0.1)
      const fbDark = buildHarmonyFallback(tooDark, options())
      expect(fbDark.hsl!.l).toBeGreaterThanOrEqual(0.3)

      const tooLight = hslCluster(0, 0.5, 0.95)
      const fbLight = buildHarmonyFallback(tooLight, options())
      expect(fbLight.hsl!.l).toBeLessThanOrEqual(0.7)
    })
  })

  describe('AC: marks color source as fallback', () => {
    it('sets role=secondary and source=fallback', () => {
      const primary = hslCluster(0, 0.5, 0.5)
      const fb = buildHarmonyFallback(primary, options())
      expect(fb.role).toBe('secondary')
      expect(fb.source).toBe('fallback')
    })

    it('does not carry cluster-derived population or proportion', () => {
      const primary = hslCluster(0, 0.5, 0.5, 250)
      const fb = buildHarmonyFallback(primary, options())
      expect(fb.population).toBeUndefined()
      expect(fb.proportion).toBeUndefined()
    })
  })

  describe('AC: returns a consistent ExtractedColor shape', () => {
    it('produces matching hex, rgb, hsl and lab', () => {
      const primary = hslCluster(30, 0.6, 0.5)
      const fb = buildHarmonyFallback(primary, options())
      expect(fb.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(fb.rgb).toBeDefined()
      expect(fb.hsl).toBeDefined()
      expect(fb.lab).toBeDefined()
      expect(fb.chroma).toBeGreaterThan(0)
    })
  })
})

describe('selectSecondary (ADZ-45)', () => {
  function options(overrides: { harmonyFallbackDeg?: number; contrastMinDE?: number; fallback?: 'harmony' | 'null' | 'nearest' } = {}): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      secondary: {
        fallback: overrides.fallback ?? 'harmony',
        contrastMinDE: overrides.contrastMinDE ?? 20,
        harmonyFallbackDeg: overrides.harmonyFallbackDeg ?? 150,
      },
    }
  }

  describe('AC: harmony mode returns generated fallback when no candidate passes', () => {
    it('returns a harmony fallback with source=fallback when candidates fail contrast', () => {
      const primary = labCluster(50, 50, 0, 100)
      const tooClose = labCluster(55, 50, 0, 100, 0.1)
      const result = selectSecondary(primary, [tooClose], options({ fallback: 'harmony' }))
      expect(result).not.toBeNull()
      expect(result!.source).toBe('fallback')
      expect(result!.role).toBe('secondary')
      expect(result!.hsl).toBeDefined()
    })

    it('uses a cluster when the top candidate passes the contrast threshold', () => {
      const primary = labCluster(50, 50, 0, 100)
      const passing = labCluster(95, 0, 50, 100, 0.1)
      const result = selectSecondary(primary, [passing], options({ fallback: 'harmony' }))
      expect(result).not.toBeNull()
      expect(result!.source).toBe('cluster')
      expect(result!.lab).toEqual(passing.lab)
    })
  })

  describe('AC: null mode returns null when no candidate passes', () => {
    it('returns null when the only candidate fails contrast', () => {
      const primary = labCluster(50, 50, 0, 100)
      const tooClose = labCluster(55, 50, 0, 100, 0.1)
      const result = selectSecondary(primary, [tooClose], options({ fallback: 'null' }))
      expect(result).toBeNull()
    })

    it('returns a cluster when a candidate passes contrast', () => {
      const primary = labCluster(50, 50, 0, 100)
      const passing = labCluster(95, 0, 50, 100, 0.1)
      const result = selectSecondary(primary, [passing], options({ fallback: 'null' }))
      expect(result).not.toBeNull()
      expect(result!.source).toBe('cluster')
    })
  })

  describe('AC: nearest mode returns the best candidate even below threshold', () => {
    it('returns the best-scoring cluster with source=fallback when no candidate passes', () => {
      const primary = labCluster(50, 50, 0, 100)
      const a = labCluster(55, 50, 0, 100, 0.1)
      const b = labCluster(60, 50, 0, 200, 0.2)
      const result = selectSecondary(primary, [a, b], options({ fallback: 'nearest' }))
      expect(result).not.toBeNull()
      expect(result!.source).toBe('fallback')
      expect(result!.lab).toEqual(b.lab)
    })

    it('returns a cluster with source=cluster when top candidate passes contrast', () => {
      const primary = labCluster(50, 50, 0, 100)
      const passing = labCluster(95, 0, 50, 100, 0.1)
      const result = selectSecondary(primary, [passing], options({ fallback: 'nearest' }))
      expect(result).not.toBeNull()
      expect(result!.source).toBe('cluster')
    })
  })

  describe('AC: metadata marks when fallback behavior is used', () => {
    it('harmony fallback is marked with source=fallback', () => {
      const primary = labCluster(50, 50, 0, 100)
      const tooClose = labCluster(55, 50, 0, 100, 0.1)
      const result = selectSecondary(primary, [tooClose], options({ fallback: 'harmony' }))
      expect(result!.source).toBe('fallback')
    })

    it('nearest fallback is marked with source=fallback', () => {
      const primary = labCluster(50, 50, 0, 100)
      const tooClose = labCluster(55, 50, 0, 100, 0.1)
      const result = selectSecondary(primary, [tooClose], options({ fallback: 'nearest' }))
      expect(result!.source).toBe('fallback')
    })

    it('cluster-derived secondary is marked with source=cluster', () => {
      const primary = labCluster(50, 50, 0, 100)
      const passing = labCluster(95, 0, 50, 100, 0.1)
      const result = selectSecondary(primary, [passing], options({ fallback: 'harmony' }))
      expect(result!.source).toBe('cluster')
    })
  })

  describe('AC: respects custom contrastMinDE', () => {
    it('raises the contrast threshold to filter out marginal candidates', () => {
      const primary = labCluster(50, 50, 0, 100)
      const candidate = labCluster(60, 0, 50, 100, 0.1)
      const result = selectSecondary(primary, [candidate], options({ contrastMinDE: 200, fallback: 'null' }))
      expect(result).toBeNull()
    })

    it('lowers the contrast threshold so a marginal candidate passes', () => {
      const primary = labCluster(50, 50, 0, 100)
      const candidate = labCluster(60, 0, 50, 100, 0.1)
      const result = selectSecondary(primary, [candidate], options({ contrastMinDE: 5, fallback: 'null' }))
      expect(result).not.toBeNull()
      expect(result!.source).toBe('cluster')
    })
  })
})

describe('buildPalette (ADZ-46)', () => {
  function indexedCluster(index: number, chroma: number, population: number, proportion: number = 0.1): Cluster {
    return { ...cluster(chroma, population, proportion), index }
  }

  function options(overrides: { paletteSize?: number; preset?: 'strict' | 'balanced' | 'vibrant' | 'dominant' } = {}): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      paletteSize: overrides.paletteSize ?? 5,
      primary: { preset: overrides.preset ?? 'strict' },
    }
  }

  describe('AC: palette length respects paletteSize', () => {
    it('returns at most paletteSize entries', () => {
      const clusters = [
        indexedCluster(0, 30, 100),
        indexedCluster(1, 20, 80),
        indexedCluster(2, 15, 60),
        indexedCluster(3, 10, 40),
      ]
      const palette = buildPalette(clusters, options({ paletteSize: 2 }))
      expect(palette).toHaveLength(2)
    })

    it('returns an empty array when paletteSize is 0', () => {
      const clusters = [indexedCluster(0, 30, 100)]
      const palette = buildPalette(clusters, options({ paletteSize: 0 }))
      expect(palette).toEqual([])
    })

    it('returns all available clusters when fewer than paletteSize remain', () => {
      const clusters = [indexedCluster(0, 30, 100), indexedCluster(1, 20, 80)]
      const palette = buildPalette(clusters, options({ paletteSize: 5 }))
      expect(palette).toHaveLength(2)
    })
  })

  describe('AC: higher perceptual score appears earlier in the palette', () => {
    it('orders by primary score (strict: chroma * log(pop+1))', () => {
      const clusters = [
        indexedCluster(0, 10, 100, 0.2),
        indexedCluster(1, 50, 80, 0.4),
        indexedCluster(2, 30, 50, 0.3),
      ]
      const palette = buildPalette(clusters, options({ paletteSize: 3, preset: 'strict' }))
      const chromas = palette.map((c) => c.chroma)
      const sortedDesc = [...chromas].sort((a, b) => (b ?? 0) - (a ?? 0))
      expect(chromas).toEqual(sortedDesc)
    })

    it('orders by population when preset is dominant', () => {
      const clusters = [
        indexedCluster(0, 5, 500, 0.5),
        indexedCluster(1, 80, 10, 0.05),
        indexedCluster(2, 40, 200, 0.2),
      ]
      const palette = buildPalette(clusters, options({ paletteSize: 3, preset: 'dominant' }))
      const pops = palette.map((c) => c.population)
      const sortedDesc = [...pops].sort((a, b) => (b ?? 0) - (a ?? 0))
      expect(pops).toEqual(sortedDesc)
    })
  })

  describe('AC: palette output is deterministic', () => {
    it('returns the same order on repeated calls with identical input', () => {
      const clusters = [
        indexedCluster(0, 30, 100),
        indexedCluster(1, 20, 80),
        indexedCluster(2, 25, 90),
      ]
      const a = buildPalette(clusters, options())
      const b = buildPalette(clusters, options())
      expect(a.map((c) => c.chroma)).toEqual(b.map((c) => c.chroma))
    })

    it('breaks ties by original cluster index', () => {
      const clusters = [
        indexedCluster(3, 20, 100, 0.1),
        indexedCluster(0, 20, 100, 0.1),
        indexedCluster(7, 20, 100, 0.1),
      ]
      const palette = buildPalette(clusters, options({ paletteSize: 3, preset: 'strict' }))
      const chromas = palette.map((c) => c.chroma)
      const proportions = palette.map((c) => c.proportion)
      expect(chromas).toEqual([20, 20, 20])
      expect(proportions).toEqual([0.1, 0.1, 0.1])
    })
  })

  describe('AC: excludes primary/secondary consistently', () => {
    it('excludes clusters by index via excludeIndices', () => {
      const clusters = [
        indexedCluster(0, 50, 200, 0.4),
        indexedCluster(1, 30, 100, 0.2),
        indexedCluster(2, 10, 50, 0.1),
      ]
      const palette = buildPalette(clusters, options({ paletteSize: 3 }), { excludeIndices: [0, 1] })
      expect(palette).toHaveLength(1)
      expect(palette[0]!.chroma).toBe(10)
    })
  })

  describe('AC: palette colors are marked with role=palette and source=cluster', () => {
    it('marks every palette entry with role=palette and source=cluster', () => {
      const clusters = [indexedCluster(0, 30, 100), indexedCluster(1, 20, 80)]
      const palette = buildPalette(clusters, options())
      for (const c of palette) {
        expect(c.role).toBe('palette')
        expect(c.source).toBe('cluster')
      }
    })
  })
})

describe('filterByContrastThreshold (ADZ-49)', () => {
  function options(overrides: { contrastMinDE?: number } = {}): ResolvedOptions {
    return {
      ...DEFAULT_OPTIONS,
      secondary: {
        fallback: 'harmony',
        contrastMinDE: overrides.contrastMinDE ?? 20,
        harmonyFallbackDeg: 150,
      },
    }
  }

  describe('AC: candidates below contrastMinDE are excluded from passing set', () => {
    it('puts a low-contrast candidate into rejected', () => {
      const primary = labCluster(50, 50, 0, 100)
      const close = labCluster(55, 50, 0, 100, 0.1)
      const result = filterByContrastThreshold(primary, [close], options())
      expect(result.passing).toHaveLength(0)
      expect(result.rejected).toHaveLength(1)
      expect(result.rejected[0]).toBe(close)
    })

    it('puts a high-contrast candidate into passing', () => {
      const primary = labCluster(50, 50, 0, 100)
      const far = labCluster(95, 0, 50, 100, 0.1)
      const result = filterByContrastThreshold(primary, [far], options())
      expect(result.passing).toHaveLength(1)
      expect(result.passing[0]).toBe(far)
      expect(result.rejected).toHaveLength(0)
    })

    it('partitions a mixed batch by contrast threshold', () => {
      const primary = labCluster(50, 50, 0, 100)
      const a = labCluster(95, 0, 50, 100, 0.1)
      const b = labCluster(55, 50, 0, 100, 0.1)
      const c = labCluster(60, 0, 50, 100, 0.1)
      const result = filterByContrastThreshold(primary, [a, b, c], options())
      expect(result.passing).toContain(a)
      expect(result.passing).toContain(c)
      expect(result.rejected).toContain(b)
    })
  })

  describe('AC: integration with selectSecondary in normal mode', () => {
    it('a low-contrast candidate is not selected in normal mode', () => {
      const primary = labCluster(50, 50, 0, 100)
      const tooClose = labCluster(55, 50, 0, 100, 0.1)
      const result = selectSecondary(primary, [tooClose], options())
      expect(result).not.toBeNull()
      expect(result!.source).toBe('fallback')
    })

    it('preserves rejected candidates so nearest mode can still pick them', () => {
      const primary = labCluster(50, 50, 0, 100)
      const a = labCluster(55, 50, 0, 100, 0.1)
      const b = labCluster(60, 50, 0, 200, 0.2)
      const filtered = filterByContrastThreshold(primary, [a, b], options())
      const result = selectSecondary(primary, [...filtered.passing, ...filtered.rejected], {
        ...options(),
        secondary: { fallback: 'nearest', contrastMinDE: 20, harmonyFallbackDeg: 150 },
      })
      expect(result).not.toBeNull()
      expect(result!.source).toBe('fallback')
      expect(result!.lab).toEqual(b.lab)
    })
  })

  describe('AC: empty input is handled', () => {
    it('returns empty arrays for empty candidates', () => {
      const primary = labCluster(50, 50, 0, 100)
      const result = filterByContrastThreshold(primary, [], options())
      expect(result.passing).toEqual([])
      expect(result.rejected).toEqual([])
    })
  })
})
