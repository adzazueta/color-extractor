import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { followRedirects, parseLocationHeader } from '../../src/node/redirects.js'
import type { Fetcher } from '../../src/node/fetch.js'

type RedirectEntry = { status: number; location: string }
type BodyEntry = { status: number; body: Uint8Array; contentType?: string }
type Map = Record<string, RedirectEntry | BodyEntry>

function redirectFetch(map: Map): Fetcher {
  return async (url) => {
    const href = typeof url === 'string' ? url : url.toString()
    const entry = map[href]
    if (!entry) throw new Error(`unexpected URL: ${href}`)
    if ('location' in entry) {
      return new Response(null, { status: entry.status, headers: { location: entry.location } })
    }
    return new Response(Buffer.from(entry.body), {
      status: entry.status,
      headers: entry.contentType ? { 'content-type': entry.contentType } : undefined,
    })
  }
}

function expectUnsafe(fn: () => unknown): void {
  try {
    fn()
    expect.fail('expected throw')
  } catch (e) {
    expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
  }
}

async function expectUnsafeAsync(promise: Promise<unknown>): Promise<void> {
  try {
    await promise
    expect.fail('expected throw')
  } catch (e) {
    expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
  }
}

// Avoids an "async function not awaited" lint when the test author only
// cares about the rejection.
void expectUnsafeAsync

describe('parseLocationHeader (ADZ-57)', () => {
  it('returns absolute URLs as-is', () => {
    expect(parseLocationHeader('https://x.com/y', 'https://base.com/')).toBe('https://x.com/y')
  })

  it('resolves relative URLs against the base', () => {
    expect(parseLocationHeader('/y', 'https://base.com/a/b')).toBe('https://base.com/y')
  })

  it('returns null for null', () => {
    expect(parseLocationHeader(null, 'https://base.com')).toBeNull()
  })

  it('returns null for unparseable values', () => {
    expect(parseLocationHeader('http://[invalid', 'https://base.com')).toBeNull()
  })
})

describe('followRedirects (ADZ-57)', () => {
  describe('AC: a single hop is followed when under the limit', () => {
    it('returns the final URL after one 302', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'https://b.com/img.png' },
        'https://b.com/img.png': { status: 200, body: new Uint8Array([1, 2, 3]) },
      })
      const result = await followRedirects('https://a.com/', {}, fetcher)
      expect(result.finalUrl).toBe('https://b.com/img.png')
      expect(result.redirectChain).toEqual(['https://a.com/'])
    })
  })

  describe('AC: redirect chains beyond the limit fail with typed error', () => {
    it('throws COLOR_EXTRACTOR_UNSAFE_URL after maxRedirects hops', async () => {
      const map: Map = {
        'https://a.com/': { status: 302, location: 'https://b.com/' },
        'https://b.com/': { status: 302, location: 'https://c.com/' },
        'https://c.com/': { status: 302, location: 'https://d.com/' },
        'https://d.com/': { status: 200, body: new Uint8Array([1]) },
      }
      const fetcher = redirectFetch(map)
      let threw = false
      try {
        await followRedirects('https://a.com/', { maxRedirects: 2 }, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: redirects to disallowed protocols fail', () => {
    it('throws when a redirect points to file://', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'file:///etc/passwd' },
      })
      let threw = false
      try {
        await followRedirects('https://a.com/', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })

    it('throws when a redirect points to ftp://', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'ftp://b.com/x' },
      })
      let threw = false
      try {
        await followRedirects('https://a.com/', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: redirects to private networks fail by default', () => {
    it('throws when a redirect points to 127.0.0.1', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://127.0.0.1/img.png' },
      })
      let threw = false
      try {
        await followRedirects('https://a.com/', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })

    it('throws when a redirect points to localhost', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://localhost/img.png' },
      })
      let threw = false
      try {
        await followRedirects('https://a.com/', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: redirects to private networks are allowed with opt-in', () => {
    it('permits localhost redirect when allowPrivateNetworks=true', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://localhost/img.png' },
        'http://localhost/img.png': { status: 200, body: new Uint8Array([1]) },
      })
      const result = await followRedirects(
        'https://a.com/',
        { allowPrivateNetworks: true },
        fetcher,
      )
      expect(result.finalUrl).toBe('http://localhost/img.png')
    })
  })

  describe('AC: redirect without a valid Location header fails', () => {
    it('throws when a 302 has no Location header', async () => {
      const fetcher: Fetcher = async () => new Response(null, { status: 302, headers: {} })
      let threw = false
      try {
        await followRedirects('https://a.com/', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: maxRedirects of 0 disables redirect following', () => {
    it('returns the original URL on a 302 when maxRedirects=0', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'https://b.com/' },
      })
      let threw = false
      try {
        await followRedirects('https://a.com/', { maxRedirects: 0 }, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: a non-redirect response terminates the chain', () => {
    it('returns the final URL on a 200', async () => {
      const fetcher = redirectFetch({
        'https://a.com/img.png': { status: 200, body: new Uint8Array([0xff]) },
      })
      const result = await followRedirects('https://a.com/img.png', {}, fetcher)
      expect(result.finalUrl).toBe('https://a.com/img.png')
      expect(result.redirectChain).toEqual([])
    })
  })

  describe('AC: invalid maxRedirects is rejected', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for negative maxRedirects', async () => {
      let threw = false
      try {
        await followRedirects('https://a.com/', { maxRedirects: -1 }, redirectFetch({}))
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: protocol check runs on the start URL too', () => {
    it('throws when the start URL has a disallowed protocol', async () => {
      let threw = false
      try {
        await followRedirects('file:///x.png', {}, redirectFetch({}) as Fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })
})
