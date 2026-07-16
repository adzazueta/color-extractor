import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { followRedirects, parseLocationHeader } from '../../src/node/redirects.js'
import type { Fetcher } from '../../src/node/fetch.js'
import type { ResolveHostname } from '../../src/node/security-private.js'

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

function publicResolver(): ResolveHostname {
  return async (hostname: string) => [{ hostname, address: '93.184.216.34', family: 4 }]
}

function privateResolver(): ResolveHostname {
  return async (hostname: string) => [{ hostname, address: '127.0.0.1', family: 4 }]
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
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'https://b.com/img.png' },
        'https://b.com/img.png': { status: 200, body: new Uint8Array([1, 2, 3]) },
      })
      const result = await followRedirects('https://a.com/', { fetcher, resolveHostname: publicResolver() })
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
      await expectUnsafe(followRedirects('https://a.com/', { fetcher: redirectFetch(map), resolveHostname: publicResolver(), maxRedirects: 2 }))
    })
  })

  describe('AC: redirects to disallowed protocols fail', () => {
    it('throws when a redirect points to file://', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'file:///etc/passwd' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: publicResolver() }))
    })

    it('throws when a redirect points to ftp://', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'ftp://b.com/x' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: publicResolver() }))
    })
  })

  describe('AC: redirects to private networks fail by default (review #2)', () => {
    it('throws when a redirect points to 127.0.0.1 (literal IP)', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://127.0.0.1/img.png' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: publicResolver() }))
    })

    it('throws when a redirect hostname resolves to 127.0.0.1 via DNS (review #2)', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://attacker.example.com/img.png' },
        'http://attacker.example.com/img.png': { status: 200, body: new Uint8Array([1]) },
      })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: privateResolver() }))
    })

    it('throws when a redirect hostname resolves to 169.254.169.254 via DNS (review #2)', async () => {
      const metaResolver: ResolveHostname = async (hostname) => [
        { hostname, address: '169.254.169.254', family: 4 },
      ]
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://meta.evil.com/' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: metaResolver }))
    })

    it('throws when a redirect points to localhost', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://localhost/img.png' },
      })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: publicResolver() }))
    })
  })

  describe('AC: redirects to private networks are allowed with opt-in', () => {
    it('permits localhost redirect when allowPrivateNetworks=true', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'http://localhost/img.png' },
        'http://localhost/img.png': { status: 200, body: new Uint8Array([1]) },
      })
      const result = await followRedirects('https://a.com/', {
        fetcher,
        resolveHostname: publicResolver(),
        allowPrivateNetworks: true,
      })
      expect(result.finalUrl).toBe('http://localhost/img.png')
    })
  })

  describe('AC: redirect without a valid Location header fails', () => {
    it('throws when a 302 has no Location header', async () => {
      const fetcher: Fetcher = async () => new Response(null, { status: 302, headers: {} })
      await expectUnsafe(followRedirects('https://a.com/', { fetcher, resolveHostname: publicResolver() }))
    })
  })

  describe('AC: maxRedirects of 0 disables redirect following', () => {
    it('returns the original URL on a 302 when maxRedirects=0', async () => {
      const fetcher = redirectFetch({
        'https://a.com/': { status: 302, location: 'https://b.com/' },
      })
      await expectUnsafe(followRedirects('https://a.com/', {
        fetcher,
        resolveHostname: publicResolver(),
        maxRedirects: 0,
      }))
    })
  })

  describe('AC: a non-redirect response terminates the chain', () => {
    it('returns the final URL on a 200', async () => {
      const fetcher = redirectFetch({
        'https://a.com/img.png': { status: 200, body: new Uint8Array([0xff]) },
      })
      const result = await followRedirects('https://a.com/img.png', {
        fetcher,
        resolveHostname: publicResolver(),
      })
      expect(result.finalUrl).toBe('https://a.com/img.png')
      expect(result.redirectChain).toEqual([])
    })
  })

  describe('AC: invalid maxRedirects is rejected', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for negative maxRedirects', async () => {
      let threw = false
      try {
        await followRedirects('https://a.com/', {
          fetcher: redirectFetch({}),
          resolveHostname: publicResolver(),
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
        fetcher: redirectFetch({}) as Fetcher,
        resolveHostname: publicResolver(),
      }))
    })
  })

  describe('AC: review #3 — fetcher receives an AbortSignal with timeout', () => {
    it('aborts the fetcher when a redirect never responds past timeoutMs', async () => {
      let observedSignal: AbortSignal | null = null
      const fetcher: Fetcher = (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          observedSignal = init?.signal ?? null
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        })
      let threw = false
      try {
        await followRedirects('https://a.com/', {
          fetcher,
          resolveHostname: publicResolver(),
          timeoutMs: 20,
          maxRedirects: 0,
        })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_TIMEOUT')
      }
      expect(threw).toBe(true)
      expect(observedSignal).not.toBeNull()
    })
  })

  describe('AC: review #4 — body is cancelled on redirect overshoot and bad status', () => {
    it('cancels the redirect response body when maxRedirects is exceeded', async () => {
      let bodyCancelled = false
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(10))
        },
        cancel() {
          bodyCancelled = true
        },
      })
      const map: Map = {
        'https://a.com/': {
          status: 302,
          location: 'https://b.com/',
        },
        'https://b.com/': { status: 200, body: new Uint8Array(1) },
      }
      void map
      const fetcher: Fetcher = async (url) => {
        const href = typeof url === 'string' ? url : url.toString()
        if (href === 'https://a.com/') {
          return new Response(stream, { status: 302, headers: { location: 'https://b.com/' } })
        }
        return new Response(Buffer.from(new Uint8Array(1)), { status: 200 })
      }
      let threw = false
      try {
        await followRedirects('https://a.com/', {
          fetcher,
          resolveHostname: publicResolver(),
          maxRedirects: 0,
        })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
      expect(bodyCancelled).toBe(true)
    })

    it('cancels the response body when a redirect is missing the Location header', async () => {
      let bodyCancelled = false
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(10))
        },
        cancel() {
          bodyCancelled = true
        },
      })
      const fetcher: Fetcher = async () =>
        new Response(stream, { status: 302, headers: {} })
      let threw = false
      try {
        await followRedirects('https://a.com/', {
          fetcher,
          resolveHostname: publicResolver(),
        })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
      expect(bodyCancelled).toBe(true)
    })
  })

  describe('AC: requires a fetcher', () => {
    it('throws COLOR_EXTRACTOR_DECODE_FAILED when fetcher is missing', async () => {
      let threw = false
      try {
        await followRedirects('https://a.com/', { resolveHostname: publicResolver() })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
      }
      expect(threw).toBe(true)
    })
  })
})
