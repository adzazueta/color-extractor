import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { followRedirects, parseLocationHeader } from '../../src/node/redirects.js'
import type { ResolveAndFetch } from '../../src/node/http-client.js'

type RedirectEntry = { status: number; location: string }
type BodyEntry = { status: number; body: Uint8Array; contentType?: string }
type RouteMap = Record<string, RedirectEntry | BodyEntry>

function routeResolveAndFetch(map: RouteMap): ResolveAndFetch {
  return async (url) => {
    const entry = map[url]
    if (!entry) throw new Error(`unexpected URL: ${url}`)
    if ('location' in entry) {
      return new Response(null, { status: entry.status, headers: { location: entry.location } })
    }
    return new Response(Buffer.from(entry.body), {
      status: entry.status,
      headers: entry.contentType ? { 'content-type': entry.contentType } : undefined,
    })
  }
}

async function expectUnsafe(promise: Promise<unknown>): Promise<void> {
  try {
    await promise
    expect.fail('expected throw')
  } catch (e) {
    expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
  }
}

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
      const resolveAndFetch = routeResolveAndFetch({
        'https://a.com/': { status: 302, location: 'https://b.com/img.png' },
        'https://b.com/img.png': { status: 200, body: new Uint8Array([1, 2, 3]) },
      })
      const result = await followRedirects('https://a.com/', { resolveAndFetch })
      expect(result.finalUrl).toBe('https://b.com/img.png')
      expect(result.redirectChain).toEqual(['https://a.com/'])
    })
  })

  describe('AC: redirect chains beyond the limit fail with typed error', () => {
    it('throws COLOR_EXTRACTOR_UNSAFE_URL after maxRedirects hops', async () => {
      const map: RouteMap = {
        'https://a.com/': { status: 302, location: 'https://b.com/' },
        'https://b.com/': { status: 302, location: 'https://c.com/' },
        'https://c.com/': { status: 302, location: 'https://d.com/' },
        'https://d.com/': { status: 200, body: new Uint8Array([1]) },
      }
      await expectUnsafe(followRedirects('https://a.com/', { resolveAndFetch: routeResolveAndFetch(map), maxRedirects: 2 }))
    })
  })

  describe('AC: redirects to disallowed protocols fail', () => {
    it('throws when a redirect points to file://', async () => {
      const resolveAndFetch = routeResolveAndFetch({
        'https://a.com/': { status: 302, location: 'file:///etc/passwd' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { resolveAndFetch }))
    })

    it('throws when a redirect points to ftp://', async () => {
      const resolveAndFetch = routeResolveAndFetch({
        'https://a.com/': { status: 302, location: 'ftp://b.com/x' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { resolveAndFetch }))
    })
  })

  describe('AC: redirect without a valid Location header fails', () => {
    it('throws when a 302 has no Location header', async () => {
      const resolveAndFetch: ResolveAndFetch = async () => new Response(null, { status: 302, headers: {} })
      await expectUnsafe(followRedirects('https://a.com/', { resolveAndFetch }))
    })
  })

  describe('AC: maxRedirects of 0 disables redirect following', () => {
    it('throws on a 302 when maxRedirects=0', async () => {
      const resolveAndFetch = routeResolveAndFetch({
        'https://a.com/': { status: 302, location: 'https://b.com/' },
      })
      await expectUnsafe(followRedirects('https://a.com/', {
        resolveAndFetch,
        maxRedirects: 0,
      }))
    })
  })

  describe('AC: a non-redirect response terminates the chain', () => {
    it('returns the final URL on a 200', async () => {
      const resolveAndFetch = routeResolveAndFetch({
        'https://a.com/img.png': { status: 200, body: new Uint8Array([0xff]) },
      })
      const result = await followRedirects('https://a.com/img.png', { resolveAndFetch })
      expect(result.finalUrl).toBe('https://a.com/img.png')
      expect(result.redirectChain).toEqual([])
    })
  })

  describe('AC: invalid maxRedirects is rejected', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for negative maxRedirects', async () => {
      let threw = false
      try {
        await followRedirects('https://a.com/', {
          resolveAndFetch: routeResolveAndFetch({}),
          maxRedirects: -1,
        })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: protocol check runs on the start URL too', () => {
    it('throws when the start URL has a disallowed protocol', async () => {
      await expectUnsafe(followRedirects('file:///x.png', {
        resolveAndFetch: async () => new Response(new Uint8Array(1), { status: 200 }),
      }))
    })
  })

  describe('AC: review #3 — timeout bounds DNS+fetch atomically (Finding #3)', () => {
    it('aborts when resolveAndFetch never responds past timeoutMs', async () => {
      const resolveAndFetch: ResolveAndFetch = (_url, signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        })
      let threw = false
      try {
        await followRedirects('https://a.com/', {
          resolveAndFetch,
          timeoutMs: 20,
          maxRedirects: 0,
        })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_TIMEOUT')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: review #4 — body is cancelled on redirect overshoot, bad status, and intermediate hops', () => {
    function trackingStream(): { stream: ReadableStream<Uint8Array>; cancelled: boolean } {
      let cancelled = false
      return {
        stream: new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(new Uint8Array(10)) },
          cancel() { cancelled = true },
        }),
        get cancelled() { return cancelled },
      }
    }

    it('cancels the response body when maxRedirects is exceeded', async () => {
      const hop1 = trackingStream()
      const resolveAndFetch: ResolveAndFetch = async (url) => {
        if (url === 'https://a.com/') {
          return new Response(hop1.stream, { status: 302, headers: { location: 'https://b.com/' } })
        }
        return new Response(Buffer.from(new Uint8Array(1)), { status: 200 })
      }
      let threw = false
      try {
        await followRedirects('https://a.com/', { resolveAndFetch, maxRedirects: 0 })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
      expect(hop1.cancelled).toBe(true)
    })

    it('cancels the response body when a redirect is missing the Location header', async () => {
      const hop1 = trackingStream()
      const resolveAndFetch: ResolveAndFetch = async () =>
        new Response(hop1.stream, { status: 302, headers: {} })
      let threw = false
      try {
        await followRedirects('https://a.com/', { resolveAndFetch })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
      expect(hop1.cancelled).toBe(true)
    })

    it('cancels the intermediate response body before following a valid redirect (Finding #4)', async () => {
      const hop1 = trackingStream()
      const resolveAndFetch: ResolveAndFetch = async (url) => {
        if (url === 'https://a.com/') {
          return new Response(hop1.stream, { status: 302, headers: { location: 'https://b.com/' } })
        }
        return new Response(Buffer.from(new Uint8Array([1])), { status: 200 })
      }
      const result = await followRedirects('https://a.com/', { resolveAndFetch })
      expect(result.finalUrl).toBe('https://b.com/')
      expect(result.redirectChain).toEqual(['https://a.com/'])
      expect(hop1.cancelled).toBe(true)
    })

    it('cancels intermediate body on multi-hop redirect chain (Finding #4)', async () => {
      const hop1 = trackingStream()
      const hop2 = trackingStream()
      const resolveAndFetch: ResolveAndFetch = async (url) => {
        if (url === 'https://a.com/') {
          return new Response(hop1.stream, { status: 302, headers: { location: 'https://b.com/' } })
        }
        if (url === 'https://b.com/') {
          return new Response(hop2.stream, { status: 302, headers: { location: 'https://c.com/' } })
        }
        return new Response(Buffer.from(new Uint8Array([1])), { status: 200 })
      }
      const result = await followRedirects('https://a.com/', { resolveAndFetch })
      expect(result.finalUrl).toBe('https://c.com/')
      expect(hop1.cancelled).toBe(true)
      expect(hop2.cancelled).toBe(true)
    })
  })

  describe('AC: resolveAndFetch defaults to defaultResolveAndFetch', () => {
    it('does not throw DECODE_FAILED when resolveAndFetch is omitted', async () => {
      // 0.0.0.0 is blocked synchronously by defaultResolveAndFetch, no
      // network I/O needed — deterministic assertion.
      let threw = false
      try {
        await followRedirects('http://0.0.0.0:1/', { maxRedirects: 0 })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).not.toBe('COLOR_EXTRACTOR_DECODE_FAILED')
      }
      expect(threw).toBe(true)
    })
  })
})
