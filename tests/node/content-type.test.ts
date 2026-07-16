import { describe, it, expect } from 'vitest'
import { validateContentType } from '../../src/node/content-type.js'
import { ColorExtractorError } from '../../src/core/errors.js'

function opts(overrides?: Partial<{ validateContentType: boolean; svg: 'disabled-in-node' | 'enabled-in-node' | 'disabled' | 'enabled' }>) {
  return {
    validateContentType: true,
    svg: 'disabled-in-node' as const,
    ...overrides,
  }
}

describe('validateContentType (ADZ-63)', () => {
  describe('AC: non-image content types are rejected when validation is enabled', () => {
    it('rejects text/html', () => {
      expect(() => validateContentType('text/html', opts())).toThrow(ColorExtractorError)
      try {
        validateContentType('text/html', opts())
      } catch (err) {
        expect((err as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_FORMAT')
      }
    })

    it('rejects application/json', () => {
      expect(() => validateContentType('application/json', opts())).toThrow(ColorExtractorError)
    })

    it('rejects text/plain', () => {
      expect(() => validateContentType('text/plain', opts())).toThrow(ColorExtractorError)
    })
  })

  describe('AC: allowed image types are accepted', () => {
    it('accepts image/jpeg', () => {
      expect(() => validateContentType('image/jpeg', opts())).not.toThrow()
    })

    it('accepts image/png', () => {
      expect(() => validateContentType('image/png', opts())).not.toThrow()
    })

    it('accepts image/webp', () => {
      expect(() => validateContentType('image/webp', opts())).not.toThrow()
    })

    it('accepts image/gif', () => {
      expect(() => validateContentType('image/gif', opts())).not.toThrow()
    })

    it('accepts image/avif', () => {
      expect(() => validateContentType('image/avif', opts())).not.toThrow()
    })
  })

  describe('AC: content type with charset is normalized', () => {
    it('accepts image/png; charset=utf-8', () => {
      expect(() => validateContentType('image/png; charset=utf-8', opts())).not.toThrow()
    })

    it('rejects text/html; charset=utf-8', () => {
      expect(() => validateContentType('text/html; charset=utf-8', opts())).toThrow(ColorExtractorError)
    })
  })

  describe('AC: missing content type is allowed', () => {
    it('allows null content type', () => {
      expect(() => validateContentType(null, opts())).not.toThrow()
    })

    it('allows undefined content type', () => {
      expect(() => validateContentType(undefined, opts())).not.toThrow()
    })

    it('allows empty string content type', () => {
      expect(() => validateContentType('', opts())).not.toThrow()
    })
  })

  describe('AC: validation can be disabled', () => {
    it('allows any content type when validateContentType is false', () => {
      expect(() => validateContentType('text/html', opts({ validateContentType: false }))).not.toThrow()
    })
  })

  describe('AC: SVG content type follows Node SVG policy', () => {
    it('rejects image/svg+xml when svg is disabled-in-node', () => {
      expect(() => validateContentType('image/svg+xml', opts({ svg: 'disabled-in-node' }))).toThrow(ColorExtractorError)
    })

    it('rejects image/svg+xml when svg is disabled', () => {
      expect(() => validateContentType('image/svg+xml', opts({ svg: 'disabled' }))).toThrow(ColorExtractorError)
    })

    it('allows image/svg+xml when svg is enabled-in-node', () => {
      expect(() => validateContentType('image/svg+xml', opts({ svg: 'enabled-in-node' }))).not.toThrow()
    })

    it('allows image/svg+xml when svg is enabled', () => {
      expect(() => validateContentType('image/svg+xml', opts({ svg: 'enabled' }))).not.toThrow()
    })
  })
})
