import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  labDistance,
  labSquaredDistance,
} from '../../../src/core/color/lab.js'
import type { Lab } from '../../../src/core/types.js'

const A: Lab = { L: 50, a: 0, b: 0 }
const B: Lab = { L: 53, a: 80, b: 67 }

describe('labSquaredDistance', () => {
  describe('identity', () => {
    it('distance from a color to itself is zero', () => {
      expect(labSquaredDistance(A, A)).toBe(0)
    })

    it('zero lab pair squared distance is zero', () => {
      const zero: Lab = { L: 0, a: 0, b: 0 }
      expect(labSquaredDistance(zero, zero)).toBe(0)
    })
  })

  describe('symmetry', () => {
    it('d(a, b) === d(b, a)', () => {
      expect(labSquaredDistance(A, B)).toBe(labSquaredDistance(B, A))
    })

    it('symmetry holds for several pairs', () => {
      const pairs: Array<[Lab, Lab]> = [
        [{ L: 0, a: 0, b: 0 }, { L: 100, a: 0, b: 0 }],
        [{ L: 50, a: 50, b: -50 }, { L: 80, a: -80, b: 60 }],
        [{ L: 25, a: 25, b: 25 }, { L: 75, a: 75, b: 75 }],
      ]
      for (const [a, b] of pairs) {
        expect(labSquaredDistance(a, b)).toBe(labSquaredDistance(b, a))
      }
    })
  })

  describe('matches dL² + da² + db²', () => {
    it('matches the formula for (50,0,0) vs (53,80,67)', () => {
      const expected = 3 * 3 + 80 * 80 + 67 * 67
      expect(labSquaredDistance(A, B)).toBe(expected)
      expect(labSquaredDistance(A, B)).toBe(10898)
    })

    it('matches the formula per-channel', () => {
      const x: Lab = { L: 10, a: 20, b: 30 }
      const y: Lab = { L: 13, a: 25, b: 33 }
      const expected = (10 - 13) ** 2 + (20 - 25) ** 2 + (30 - 33) ** 2
      expect(labSquaredDistance(x, y)).toBe(expected)
    })
  })

  describe('channel-isolated behavior', () => {
    it('differs in L only — squared equals dL²', () => {
      const x: Lab = { L: 10, a: 50, b: 50 }
      const y: Lab = { L: 15, a: 50, b: 50 }
      expect(labSquaredDistance(x, y)).toBe(25)
    })

    it('differs in a only — squared equals da²', () => {
      const x: Lab = { L: 50, a: 10, b: 50 }
      const y: Lab = { L: 50, a: 14, b: 50 }
      expect(labSquaredDistance(x, y)).toBe(16)
    })

    it('differs in b only — squared equals db²', () => {
      const x: Lab = { L: 50, a: 50, b: 10 }
      const y: Lab = { L: 50, a: 50, b: 12 }
      expect(labSquaredDistance(x, y)).toBe(4)
    })

    it('sums channel contributions', () => {
      const x: Lab = { L: 10, a: 20, b: 30 }
      const y: Lab = { L: 13, a: 24, b: 35 }
      expect(labSquaredDistance(x, y)).toBe(9 + 16 + 25)
    })
  })

  describe('ordering preservation', () => {
    it('larger squared distance implies larger non-squared distance', () => {
      const near: Lab = { L: 50, a: 0, b: 0 }
      const far: Lab = { L: 80, a: 0, b: 0 }
      expect(labSquaredDistance(near, far)).toBeGreaterThan(labSquaredDistance(A, A))
    })
  })

  describe('type acceptance', () => {
    it('accepts the Lab interface from public types', () => {
      expectTypeOf<Lab>().toMatchTypeOf<Parameters<typeof labSquaredDistance>[0]>()
    })
  })
})

describe('labDistance', () => {
  describe('identity and symmetry', () => {
    it('distance from a color to itself is zero', () => {
      expect(labDistance(A, A)).toBe(0)
    })

    it('d(a, b) === d(b, a)', () => {
      expect(labDistance(A, B)).toBe(labDistance(B, A))
    })
  })

  describe('relation to squared', () => {
    it('labDistance² === labSquaredDistance for a known pair', () => {
      const squared = labSquaredDistance(A, B)
      const distance = labDistance(A, B)
      expect(distance * distance).toBeCloseTo(squared, 9)
    })

    it('labDistance === sqrt(labSquaredDistance)', () => {
      expect(labDistance(A, B)).toBeCloseTo(Math.sqrt(labSquaredDistance(A, B)), 12)
    })
  })

  describe('reference values', () => {
    it('(50,0,0) → (53,80,67) deltaE ≈ 104.39', () => {
      expect(labDistance(A, B)).toBeCloseTo(104.39, 1)
    })

    it('(0,0,0) → (100,0,0) deltaE === 100', () => {
      const black: Lab = { L: 0, a: 0, b: 0 }
      const white: Lab = { L: 100, a: 0, b: 0 }
      expect(labDistance(black, white)).toBe(100)
    })
  })

  describe('thresholds (for secondary contrast)', () => {
    it('can be compared against a threshold without conversion', () => {
      const candidate: Lab = { L: 50, a: 0, b: 0 }
      const primary: Lab = { L: 50, a: 19.9, b: 0 }
      const distance = labDistance(candidate, primary)
      expect(distance).toBeGreaterThanOrEqual(19.9)
      expect(distance).toBeLessThan(20)
    })
  })
})
