import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  ColorExtractorError,
  COLOR_EXTRACTOR_ERROR_CODES,
  type ColorExtractorErrorCode,
} from '../../src/core/errors.js'

describe('COLOR_EXTRACTOR_ERROR_CODES', () => {
  it('contains the 11 documented package error codes', () => {
    expect(COLOR_EXTRACTOR_ERROR_CODES.length).toBe(11)
  })

  it('matches the documentation exactly', () => {
    expect(COLOR_EXTRACTOR_ERROR_CODES).toEqual([
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'COLOR_EXTRACTOR_CORS_ERROR',
      'COLOR_EXTRACTOR_FETCH_FAILED',
      'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
      'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
      'COLOR_EXTRACTOR_TIMEOUT',
      'COLOR_EXTRACTOR_UNSAFE_URL',
      'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
      'COLOR_EXTRACTOR_SHARP_MISSING',
      'COLOR_EXTRACTOR_NO_VALID_PIXELS',
    ])
  })

  it('is a readonly tuple of literal types', () => {
    expectTypeOf(COLOR_EXTRACTOR_ERROR_CODES).toEqualTypeOf<
      readonly [
        'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
        'COLOR_EXTRACTOR_DECODE_FAILED',
        'COLOR_EXTRACTOR_CORS_ERROR',
        'COLOR_EXTRACTOR_FETCH_FAILED',
        'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
        'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
        'COLOR_EXTRACTOR_TIMEOUT',
        'COLOR_EXTRACTOR_UNSAFE_URL',
        'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
        'COLOR_EXTRACTOR_SHARP_MISSING',
        'COLOR_EXTRACTOR_NO_VALID_PIXELS',
      ]
    >()
  })
})

describe('ColorExtractorErrorCode union', () => {
  it('covers every entry in COLOR_EXTRACTOR_ERROR_CODES', () => {
    for (const code of COLOR_EXTRACTOR_ERROR_CODES) {
      const typed: ColorExtractorErrorCode = code
      expectTypeOf(typed).toEqualTypeOf<ColorExtractorErrorCode>()
    }
  })

  it('rejects codes outside the documented set', () => {
    expectTypeOf<'COLOR_EXTRACTOR_TYPO'>().not.toEqualTypeOf<ColorExtractorErrorCode>()
  })
})

describe('ColorExtractorError', () => {
  it('is an instance of Error', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_UNSUPPORTED_INPUT', 'msg')
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ColorExtractorError', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_UNSUPPORTED_INPUT', 'msg')
    expect(err).toBeInstanceOf(ColorExtractorError)
  })

  it('exposes the code passed to the constructor', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_DECODE_FAILED', 'decode failed')
    expect(err.code).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
    expect(err.name).toBe('ColorExtractorError')
    expect(err.message).toBe('decode failed')
  })

  it('preserves the cause when provided', () => {
    const original = new Error('original failure')
    const err = new ColorExtractorError('COLOR_EXTRACTOR_DECODE_FAILED', 'wrapper', { cause: original })
    expect(err.cause).toBe(original)
  })

  it('cause is undefined when not provided', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_UNSUPPORTED_INPUT', 'msg')
    expect(err.cause).toBeUndefined()
  })

  it('preserves non-Error cause values', () => {
    const payload = { code: 'UPSTREAM', detail: 'bad gateway' }
    const err = new ColorExtractorError('COLOR_EXTRACTOR_FETCH_FAILED', 'fetch failed', { cause: payload })
    expect(err.cause).toBe(payload)
  })

  it('captures a stack trace', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_UNSUPPORTED_INPUT', 'msg')
    expect(typeof err.stack).toBe('string')
    expect(err.stack).toContain('ColorExtractorError')
  })

  it('is catchable as Error', () => {
    try {
      throw new ColorExtractorError('COLOR_EXTRACTOR_UNSUPPORTED_INPUT', 'boom')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ColorExtractorError)
      expect(caught).toBeInstanceOf(Error)
      expect((caught as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
    }
  })

  it('accepts every documented code', () => {
    for (const code of COLOR_EXTRACTOR_ERROR_CODES) {
      const err = new ColorExtractorError(code, `test for ${code}`)
      expect(err.code).toBe(code)
    }
  })
})
