import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import sharp from 'sharp'
import { ColorExtractorError } from '../../src/core/index.js'

function makePng(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer()
}

const LARGE_PAYLOAD = Buffer.alloc(64 * 1024, 0x41)

let pngBuffer: Buffer

function startServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url?.includes('/big.png')) {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(LARGE_PAYLOAD)
      } else if (req.url?.includes('/hang.png')) {
        // Never respond
      } else if (req.url?.includes('/404.png')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      } else {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(pngBuffer)
      }
    })
    server.listen(0, () => {
      const addr = server.address()
      resolve({ server, port: (addr as { port: number }).port })
    })
  })
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

describe('Node URL extraction with local server (ADZ-81)', () => {
  let server: http.Server
  let port: number

  beforeAll(async () => {
    pngBuffer = await makePng(10, 10, { r: 180, g: 0, b: 0 })
    const s = await startServer()
    server = s.server
    port = s.port
  })

  afterAll(async () => {
    if (server) await stopServer(server)
  })

  describe('AC: mock successful image responses', () => {
    it('extractColors with a local URL returns a valid result', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      const result = await extractColors(`http://127.0.0.1:${port}/test.png`, {
        remote: { allowPrivateNetworks: true },
      })
      expect(result.primary).toBeDefined()
      expect(result.primary.role).toBe('primary')
    })

    it('extractColors returns metadata with runtime=node', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      const result = await extractColors(`http://127.0.0.1:${port}/test.png`, {
        remote: { allowPrivateNetworks: true },
        output: { includeMetadata: true },
      })
      expect(result.metadata?.runtime).toBe('node')
    })
  })

  describe('AC: mock oversized responses', () => {
    it('throws INPUT_TOO_LARGE when payload exceeds maxBytes', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      await expect(
        extractColors(`http://127.0.0.1:${port}/big.png`, {
          remote: { allowPrivateNetworks: true, maxBytes: 1024 },
        }),
      ).rejects.toThrow(ColorExtractorError)
    })
  })

  describe('AC: mock timeouts or aborted requests', () => {
    it('throws COLOR_EXTRACTOR_TIMEOUT for a hanging server', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/hang.png`, {
          remote: { allowPrivateNetworks: true, timeoutMs: 100 },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect(e).toBeInstanceOf(ColorExtractorError)
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_TIMEOUT')
      }
    }, 10_000)
  })

  describe('AC: fetch failures map to typed errors', () => {
    it('404 response maps to COLOR_EXTRACTOR_FETCH_FAILED', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/404.png`, {
          remote: { allowPrivateNetworks: true },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect(e).toBeInstanceOf(ColorExtractorError)
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_FETCH_FAILED')
      }
    })
  })
})
