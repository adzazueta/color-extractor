import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { detectErrorCode, toColorExtractorError } from '../../src/core/error-mapping.js'

describe('toColorExtractorError (ADZ-74)', () => {
  describe('AC: existing ColorExtractorError instances pass through unchanged', () => {
    it('returns the original error when input is already a ColorExtractorError', () => {
      const original = new ColorExtractorError('COLOR_EXTRACTOR_TIMEOUT', 'preset error')
      const mapped = toColorExtractorError(original, { operation: 'fetch' })
      expect(mapped).toBe(original)
    })
  })

  describe('AC: timeout-like errors map to COLOR_EXTRACTOR_TIMEOUT', () => {
    it('maps an AbortError', () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      const mapped = toColorExtractorError(err, { operation: 'fetch' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_TIMEOUT')
    })

    it('maps a timeout message', () => {
      const err = new Error('request timed out after 10000ms')
      const mapped = toColorExtractorError(err, { operation: 'fetch' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_TIMEOUT')
    })
  })

  describe('AC: fetch failures map to COLOR_EXTRACTOR_FETCH_FAILED', () => {
    it('maps ENOTFOUND', () => {
      const err = new Error('getaddrinfo ENOTFOUND example.com')
      const mapped = toColorExtractorError(err, { operation: 'fetch' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
    })

    it('maps ECONNREFUSED', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:443')
      const mapped = toColorExtractorError(err, { operation: 'fetch' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
    })
  })

  describe('AC: decode failures map to COLOR_EXTRACTOR_DECODE_FAILED', () => {
    it('maps a sharp error', () => {
      const err = new Error('Sharp encountered an error while decoding')
      const mapped = toColorExtractorError(err, { operation: 'decode' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
    })

    it('maps a generic unsupported error', () => {
      const err = new Error('unsupported image format')
      const mapped = toColorExtractorError(err, { operation: 'decode' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
    })
  })

  describe('AC: URL and security failures map to COLOR_EXTRACTOR_UNSAFE_URL', () => {
    it('maps a private network message', () => {
      const err = new Error('hostname resolves to a private network address')
      const mapped = toColorExtractorError(err, { operation: 'fetch' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
    })

    it('maps a redirect chain message', () => {
      const err = new Error('redirect chain exceeded the 3-hop limit')
      const mapped = toColorExtractorError(err, { operation: 'fetch' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
    })
  })

  describe('AC: unknown errors fall back to the provided code', () => {
    it('falls back to the default when no pattern matches', () => {
      const err = new Error('something weird happened')
      const mapped = toColorExtractorError(err, { operation: 'unknown operation' })
      expect(mapped.code).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
    })

    it('honors a custom fallback', () => {
      const err = new Error('foo bar baz')
      const mapped = toColorExtractorError(err, { operation: 'x' }, 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE')
      expect(mapped.code).toBe('COLOR_EXTRACTOR_IMAGE_TOO_LARGE')
    })
  })

  describe('AC: error message is actionable', () => {
    it('includes the operation and url in the message when provided', () => {
      const err = new Error('oops')
      const mapped = toColorExtractorError(err, {
        operation: 'fetch',
        url: 'https://x.com/y',
      })
      expect(mapped.message).toMatch(/fetch/)
      expect(mapped.message).toMatch(/https:\/\/x\.com\/y/)
      expect(mapped.message).toMatch(/oops/)
    })

    it('preserves the original cause', () => {
      const cause = new Error('inner')
      const mapped = toColorExtractorError(cause, { operation: 'decode' })
      expect(mapped.cause).toBe(cause)
    })
  })

  describe('AC: non-Error values are handled', () => {
    it('handles string errors', () => {
      const mapped = toColorExtractorError('just a string', { operation: 'decode' })
      expect(mapped.message).toMatch(/just a string/)
    })

    it('handles null', () => {
      const mapped = toColorExtractorError(null, { operation: 'decode' })
      expect(mapped.message).toMatch(/unknown error/)
    })

    it('handles undefined', () => {
      const mapped = toColorExtractorError(undefined, { operation: 'decode' })
      expect(mapped.message).toMatch(/unknown error/)
    })
  })
})

describe('detectErrorCode (ADZ-74)', () => {
  it('returns the code of an existing ColorExtractorError', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_TIMEOUT', 'x')
    expect(detectErrorCode(err)).toBe('COLOR_EXTRACTOR_TIMEOUT')
  })

  it('detects COLOR_EXTRACTOR_TIMEOUT from a TimeoutError', () => {
    const err = new Error('timed out')
    err.name = 'TimeoutError'
    expect(detectErrorCode(err)).toBe('COLOR_EXTRACTOR_TIMEOUT')
  })

  it('detects COLOR_EXTRACTOR_FETCH_FAILED from ECONNREFUSED', () => {
    expect(detectErrorCode(new Error('ECONNREFUSED'))).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
  })

  it('detects COLOR_EXTRACTOR_DECODE_FAILED from a sharp message', () => {
    expect(detectErrorCode(new Error('sharp decode failed'))).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
  })

  it('detects COLOR_EXTRACTOR_UNSAFE_URL from a protocol message', () => {
    expect(detectErrorCode(new Error('disallowed protocol file:'))).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
  })

  it('returns the fallback for unknown errors', () => {
    expect(detectErrorCode(new Error('???'), 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE')).toBe(
      'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
    )
  })

  it('uses the default fallback when none is given', () => {
    expect(detectErrorCode(new Error('???'))).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
  })
})
