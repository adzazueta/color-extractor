import { describe, it, expect, expectTypeOf } from 'vitest'
import { ColorExtractorError } from '../src/core/errors.js'
import {
  validateCoreInput,
  type PixelInput,
} from '../src/core/validation.js'

function expectUnsupportedInput(fn: () => unknown): void {
  try {
    fn()
    expect.fail('expected validateCoreInput to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError)
    expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
  }
}

const W = 10
const H = 10
const PIXELS = W * H
const BYTES = PIXELS * 4

describe('validateCoreInput', () => {
  describe('rejects non-object inputs', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['number', 42],
      ['string', 'image'],
      ['boolean', true],
      ['array', [1, 2, 3]],
    ])('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for %s', (_label, value) => {
      expectUnsupportedInput(() => validateCoreInput(value))
    })
  })

  describe('rejects objects missing required fields', () => {
    it('throws for an empty object', () => {
      expectUnsupportedInput(() => validateCoreInput({}))
    })

    it('throws when `data` is missing', () => {
      expectUnsupportedInput(() => validateCoreInput({ width: W, height: H }))
    })

    it('throws when `width` is missing', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES) }),
      )
    })

    it('throws when `height` is missing', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: W }),
      )
    })
  })

  describe('rejects wrong-typed fields', () => {
    it('throws when `data` is not a typed array or byte number[]', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: 'not pixels', width: W, height: H }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: { 0: 0, length: 1 }, width: W, height: H }),
      )
    })

    it('throws when `width` is not a positive integer', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: 0, height: H }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: -1, height: H }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: 1.5, height: H }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: '10', height: H }),
      )
    })

    it('throws when `height` is not a positive integer', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: W, height: 0 }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: W, height: 1.5 }),
      )
    })
  })

  describe('rejects data with mismatched length', () => {
    it('throws when data length is less than width * height * 4', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(40), width: W, height: H }),
      )
    })

    it('throws when data length is more than width * height * 4', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(BYTES + 4), width: W, height: H }),
      )
    })

    it('throws when number[] length is less than expected', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: [0, 0, 0], width: 1, height: 1 }),
      )
    })

    it('accepts exact match for 1x1 (4 bytes)', () => {
      expect(() =>
        validateCoreInput({ data: new Uint8Array(4), width: 1, height: 1 }),
      ).not.toThrow()
    })

    it('accepts exact match for 10x10 (400 bytes)', () => {
      expect(() =>
        validateCoreInput({ data: new Uint8Array(BYTES), width: W, height: H }),
      ).not.toThrow()
    })
  })

  describe('rejects number[] with out-of-range or non-integer values', () => {
    it('throws for negative values', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: [-1, 0, 0, 255], width: 1, height: 1 }),
      )
    })

    it('throws for values above 255', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: [256, 0, 0, 255], width: 1, height: 1 }),
      )
    })

    it('throws for fractional values', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: [1.5, 0, 0, 255], width: 1, height: 1 }),
      )
    })

    it('throws for NaN', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: [Number.NaN, 0, 0, 255], width: 1, height: 1 }),
      )
    })

    it('throws for Infinity', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: [Number.POSITIVE_INFINITY, 0, 0, 255], width: 1, height: 1 }),
      )
    })

    it('accepts a valid byte number[] (all values in [0, 255])', () => {
      expect(() =>
        validateCoreInput({ data: [0, 128, 255, 0], width: 1, height: 1 }),
      ).not.toThrow()
    })
  })

  describe('accepts valid pixel inputs', () => {
    it('accepts a Uint8Array payload of correct size', () => {
      const input: PixelInput = { data: new Uint8Array(BYTES), width: W, height: H }
      expect(() => validateCoreInput(input)).not.toThrow()
    })

    it('accepts a Uint8ClampedArray payload of correct size', () => {
      const input: PixelInput = { data: new Uint8ClampedArray(BYTES), width: W, height: H }
      expect(() => validateCoreInput(input)).not.toThrow()
    })

    it('accepts a number[] payload of correct size with valid bytes', () => {
      const input: PixelInput = { data: [0, 0, 0, 255], width: 1, height: 1 }
      expect(() => validateCoreInput(input)).not.toThrow()
    })
  })

  describe('error metadata', () => {
    it('error code is COLOR_EXTRACTOR_UNSUPPORTED_INPUT', () => {
      try {
        validateCoreInput(null)
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
    })

    it('error preserves the offending value as cause', () => {
      try {
        validateCoreInput(42)
      } catch (error) {
        expect((error as ColorExtractorError).cause).toBe(42)
      }
    })

    it('error message is actionable for shape errors', () => {
      try {
        validateCoreInput({ data: 'bad', width: W, height: H })
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('data')
      }
    })

    it('error message is actionable for length errors', () => {
      try {
        validateCoreInput({ data: new Uint8Array(40), width: W, height: H })
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('length')
        expect(message).toContain('width')
        expect(message).toContain('height')
      }
    })
  })

  describe('type narrowing', () => {
    it('narrows the input to PixelInput after the call', () => {
      const input: unknown = { data: new Uint8Array(BYTES), width: W, height: H }
      validateCoreInput(input)
      expectTypeOf(input).toEqualTypeOf<PixelInput>()
      expectTypeOf(input.data).toEqualTypeOf<PixelInput['data']>()
      expectTypeOf(input.width).toEqualTypeOf<number>()
      expectTypeOf(input.height).toEqualTypeOf<number>()
    })
  })
})
