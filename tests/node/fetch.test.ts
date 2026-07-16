import { describe, it, expect } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import { fetchRemoteBuffer, type Fetcher, type RemoteBufferResult } from '../../src/node/fetch.js'

function makeResponse(body: Uint8Array, init: { status?: number; contentLength?: number; contentType?: string } = {}): Response {
  const headers = new Headers()
  if (init.contentType !== undefined) headers.set('content-type', init.contentType)
  if (init.contentLength !== undefined) headers.set('content-length', String(init.contentLength))
  return new Response(Buffer.from(body), {
    status: init.status ?? 200,
    statusText: 'OK',
    headers,
  })
}

function okFetch(body: Uint8Array, init: { contentLength?: number; contentType?: string } = {}): Fetcher {
  return async () => makeResponse(body, init)
}

describe('fetchRemoteBuffer (ADZ-58)', () => {
  describe('AC: returns the response body and content type on success', () => {
    it('returns the body bytes for a small response', async () => {
      const body = new Uint8Array([1, 2, 3, 4, 5])
      const result = await fetchRemoteBuffer('https://x.com/y.png', {}, okFetch(body))
      expect(Array.from(result.body)).toEqual([1, 2, 3, 4, 5])
      expect(result.contentType).toBeNull()
    })

    it('returns the content-type header when present', async () => {
      const body = new Uint8Array([0xff, 0xd8, 0xff])
      const result = await fetchRemoteBuffer('https://x.com/y.jpg', {}, okFetch(body, { contentType: 'image/jpeg' }))
      expect(result.contentType).toBe('image/jpeg')
    })
  })

  describe('AC: enforces maxBytes via Content-Length header', () => {
    it('throws COLOR_EXTRACTOR_INPUT_TOO_LARGE when content-length > maxBytes', async () => {
      const body = new Uint8Array(10)
      const fetcher = okFetch(body, { contentLength: 1000 })
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', { maxBytes: 100 }, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_INPUT_TOO_LARGE')
        expect((e as Error).message).toMatch(/1000/)
        expect((e as Error).message).toMatch(/100/)
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: enforces maxBytes during streaming', () => {
    it('throws COLOR_EXTRACTOR_INPUT_TOO_LARGE when streamed bytes exceed maxBytes', async () => {
      const chunk1 = new Uint8Array(60)
      const chunk2 = new Uint8Array(60)
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk1)
          controller.enqueue(chunk2)
          controller.close()
        },
      })
      const fetcher: Fetcher = async () =>
        new Response(stream, { status: 200, statusText: 'OK', headers: { 'content-type': 'image/png' } })
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', { maxBytes: 100 }, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_INPUT_TOO_LARGE')
      }
      expect(threw).toBe(true)
    })

    it('accepts a response whose streamed total is below the limit', async () => {
      const chunk1 = new Uint8Array(40)
      const chunk2 = new Uint8Array(40)
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk1)
          controller.enqueue(chunk2)
          controller.close()
        },
      })
      const fetcher: Fetcher = async () =>
        new Response(stream, { status: 200, statusText: 'OK' })
      const result = await fetchRemoteBuffer('https://x.com/y', { maxBytes: 100 }, fetcher)
      expect(result.body.length).toBe(80)
    })
  })

  describe('AC: enforces timeoutMs', () => {
    it('throws COLOR_EXTRACTOR_TIMEOUT when the request hangs past timeoutMs', async () => {
      let aborted = false
      const fetcher: Fetcher = (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('aborted', 'AbortError'))
          })
        })
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', { timeoutMs: 20 }, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_TIMEOUT')
      }
      expect(threw).toBe(true)
      expect(aborted).toBe(true)
    })
  })

  describe('AC: non-OK responses map to typed errors', () => {
    it('404 maps to COLOR_EXTRACTOR_FETCH_FAILED', async () => {
      const fetcher: Fetcher = async () => makeResponse(new Uint8Array(0), { status: 404, contentType: 'text/plain' })
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
      }
      expect(threw).toBe(true)
    })

    it('redirects are not auto-followed and map to COLOR_EXTRACTOR_UNSAFE_URL', async () => {
      const fetcher: Fetcher = async () =>
        new Response(null, { status: 302, headers: { location: 'https://elsewhere' } })
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: network errors map to COLOR_EXTRACTOR_FETCH_FAILED', () => {
    it('throws COLOR_EXTRACTOR_FETCH_FAILED when the fetcher rejects', async () => {
      const fetcher: Fetcher = async () => {
        throw new TypeError('network unreachable')
      }
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
        expect((e as Error).message).toMatch(/network unreachable/)
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: empty body maps to COLOR_EXTRACTOR_FETCH_FAILED', () => {
    it('throws when the response has no body', async () => {
      const fetcher: Fetcher = async () => new Response(null, { status: 200 })
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', {}, fetcher)
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
      }
      expect(threw).toBe(true)
    })
  })

  describe('AC: invalid options are rejected', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for timeoutMs <= 0', async () => {
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', { timeoutMs: 0 })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
      expect(threw).toBe(true)
    })

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for maxBytes <= 0', async () => {
      let threw = false
      try {
        await fetchRemoteBuffer('https://x.com/y', { maxBytes: -1 })
      } catch (e) {
        threw = true
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
      expect(threw).toBe(true)
    })
  })
})

describe('RemoteBufferResult (ADZ-58)', () => {
  it('concatenates streamed chunks in order', async () => {
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6, 7, 8, 9])]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    })
    const fetcher: Fetcher = async () => new Response(stream, { status: 200 })
    const result: RemoteBufferResult = await fetchRemoteBuffer('https://x.com/y', {}, fetcher)
    expect(Array.from(result.body)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
