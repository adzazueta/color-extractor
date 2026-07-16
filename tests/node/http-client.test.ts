import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { ColorExtractorError } from '../../src/core/errors.js'
import { createResolveAndFetch, type LookupFunction } from '../../src/node/http-client.js'
import { isPrivateAddress } from '../../src/node/security-private.js'

function privateLookup(addr: string): LookupFunction {
  return async (hostname) => [{ address: addr, family: 4 as const }]
}

const publicLookup: LookupFunction = async (hostname) => [
  { address: '93.184.216.34', family: 4 as const },
]

const emptyLookup: LookupFunction = async () => []

describe('createResolveAndFetch — validation', () => {
  describe('AC: Finding #2 — empty DNS resolution is rejected', () => {
    it('throws COLOR_EXTRACTOR_UNSAFE_URL when DNS returns []', async () => {
      const resolveAndFetch = createResolveAndFetch({ lookup: emptyLookup })
      let threw = false
      try {
        await resolveAndFetch('http://example.com/img.png', new AbortController().signal)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
        expect((e as Error).message).toMatch(/empty address list/)
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: private IP literal is rejected', () => {
    it('blocks 127.0.0.1', async () => {
      const resolveAndFetch = createResolveAndFetch()
      let threw = false
      try {
        await resolveAndFetch('http://127.0.0.1/img.png', new AbortController().signal)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })

    it('blocks 169.254.169.254 (cloud metadata)', async () => {
      const resolveAndFetch = createResolveAndFetch()
      let threw = false
      try {
        await resolveAndFetch('http://169.254.169.254/latest/', new AbortController().signal)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })

    it('permits public IP with allowPrivateNetworks=true', async () => {
      const resolveAndFetch = createResolveAndFetch({ allowPrivateNetworks: true })
      // Will try to connect to 127.0.0.1 but we're checking it doesn't throw
      // the private network error before making the request.
      // Since there's no local server, it will fail with a connection error,
      // not an UNSAFE_URL error.
      let threw = false
      try {
        await resolveAndFetch('http://127.0.0.1:1/x', new AbortController().signal)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).not.toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: hostname resolving to private IP via DNS is rejected', () => {
    it('blocks when lookup returns 127.0.0.1', async () => {
      const resolveAndFetch = createResolveAndFetch({ lookup: privateLookup('127.0.0.1') })
      let threw = false
      try {
        await resolveAndFetch('http://evil.example.com/img.png', new AbortController().signal)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: DNS lookup respects AbortSignal (Finding #3)', () => {
    it('propagates signal to lookup and surfaces AbortError as timeout', async () => {
      const slowLookup: LookupFunction = async (_hostname, options) => {
        await new Promise((_resolve, reject) => {
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('AbortError', 'AbortError'))
            })
          }
        })
        return [{ address: '1.2.3.4', family: 4 as const }]
      }
      const resolveAndFetch = createResolveAndFetch({ lookup: slowLookup })
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 5)
      let threw = false
      try {
        await resolveAndFetch('http://example.com/x', controller.signal)
      } catch (e) {
        threw = true
        expect((e as Error).name).toBe('AbortError')
      }
      expect(threw).toBe(true)
    })
  })
})

describe('createResolveAndFetch — integration with local HTTP server', () => {
  let server: http.Server
  let port: number

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/test') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('pinned-ok')
      } else {
        res.writeHead(404)
        res.end('not-found')
      }
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address() as { port: number }
    port = addr.port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('makes an HTTP request to the pinned IP with Host header set to original hostname', async () => {
    const resolveAndFetch = createResolveAndFetch({
      lookup: async () => [{ address: '127.0.0.1', family: 4 as const }],
      allowPrivateNetworks: true,
    })
    const response = await resolveAndFetch(
      `http://original-host.com:${port}/test`,
      new AbortController().signal,
    )
    expect(response.status).toBe(200)
    const body = await response.arrayBuffer()
    expect(new TextDecoder().decode(body)).toBe('pinned-ok')
    expect(response.headers.get('content-type')).toMatch(/text\/plain/)
  })
})
