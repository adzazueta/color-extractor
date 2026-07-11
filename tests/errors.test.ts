import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../src/core/errors.js'

describe('ColorExtractorError', () => {
  it('is an instance of Error', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_TEST', 'msg')
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ColorExtractorError', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_TEST', 'msg')
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
    const err = new ColorExtractorError('COLOR_EXTRACTOR_TEST', 'msg')
    expect(err.cause).toBeUndefined()
  })

  it('preserves non-Error cause values', () => {
    const payload = { code: 'UPSTREAM', detail: 'bad gateway' }
    const err = new ColorExtractorError('COLOR_EXTRACTOR_FETCH_FAILED', 'fetch failed', { cause: payload })
    expect(err.cause).toBe(payload)
  })

  it('captures a stack trace', () => {
    const err = new ColorExtractorError('COLOR_EXTRACTOR_TEST', 'msg')
    expect(typeof err.stack).toBe('string')
    expect(err.stack).toContain('ColorExtractorError')
  })

  it('is catchable as Error', () => {
    try {
      throw new ColorExtractorError('COLOR_EXTRACTOR_TEST', 'boom')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ColorExtractorError)
      expect(caught).toBeInstanceOf(Error)
      expect((caught as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_TEST')
    }
  })
})
