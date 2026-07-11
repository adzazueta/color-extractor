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
      expectUnsupportedInput(() => validateCoreInput({ width: 10, height: 10 }))
    })

    it('throws when `width` is missing', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(40) }),
      )
    })

    it('throws when `height` is missing', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(40), width: 10 }),
      )
    })
  })

  describe('rejects wrong-typed fields', () => {
    it('throws when `data` is not a typed array or number[]', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: 'not pixels', width: 10, height: 10 }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: { 0: 0, length: 1 }, width: 10, height: 10 }),
      )
    })

    it('throws when `width` is not a positive integer', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(4), width: 0, height: 10 }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(4), width: -1, height: 10 }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(4), width: 1.5, height: 10 }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(4), width: '10', height: 10 }),
      )
    })

    it('throws when `height` is not a positive integer', () => {
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(4), width: 10, height: 0 }),
      )
      expectUnsupportedInput(() =>
        validateCoreInput({ data: new Uint8Array(4), width: 10, height: 1.5 }),
      )
    })
  })

  describe('accepts valid pixel inputs', () => {
    it('accepts a Uint8Array payload', () => {
      const input: PixelInput = { data: new Uint8Array(40), width: 10, height: 10 }
      expect(() => validateCoreInput(input)).not.toThrow()
    })

    it('accepts a Uint8ClampedArray payload', () => {
      const input: PixelInput = { data: new Uint8ClampedArray(40), width: 10, height: 10 }
      expect(() => validateCoreInput(input)).not.toThrow()
    })

    it('accepts a number[] payload', () => {
      const input: PixelInput = { data: [0, 0, 0, 255], width: 1, height: 1 }
      expect(() => validateCoreInput(input)).not.toThrow()
    })

    it('accepts an empty array as data (content checks are separate)', () => {
      const input = { data: [] as number[], width: 1, height: 1 }
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

    it('error message is actionable', () => {
      try {
        validateCoreInput({ data: 'bad', width: 10, height: 10 })
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('data')
      }
    })
  })

  describe('type narrowing', () => {
    it('narrows the input to PixelInput after the call', () => {
      const input: unknown = { data: new Uint8Array(40), width: 10, height: 10 }
      validateCoreInput(input)
      expectTypeOf(input).toEqualTypeOf<PixelInput>()
      expectTypeOf(input.data).toEqualTypeOf<PixelInput['data']>()
      expectTypeOf(input.width).toEqualTypeOf<number>()
      expectTypeOf(input.height).toEqualTypeOf<number>()
    })
  })
})
