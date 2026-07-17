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

let smallPng: Buffer
let bigPng: Buffer

function startServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url?.includes('/redirect-loop')) {
        res.writeHead(302, { Location: `http://127.0.0.1:${(server.address() as { port: number }).port}/redirect-loop` })
        res.end()
      } else if (req.url?.includes('/redirect-bad-protocol')) {
        res.writeHead(302, { Location: 'file:///etc/passwd' })
        res.end()
      } else if (req.url?.includes('/svg-content')) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
        res.end('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>')
      } else if (req.url?.includes('/big-dimensions')) {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(bigPng)
      } else {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(smallPng)
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

describe('security end-to-end through extractColors (ADZ-76)', () => {
  let server: http.Server
  let port: number

  beforeAll(async () => {
    smallPng = await makePng(10, 10, { r: 180, g: 0, b: 0 })
    bigPng = await makePng(200, 200, { r: 0, g: 0, b: 180 })
    const s = await startServer()
    server = s.server
    port = s.port
  })

  afterAll(async () => {
    if (server) await stopServer(server)
  })

  describe('AC: private network is rejected by default', () => {
    it('throws COLOR_EXTRACTOR_UNSAFE_URL for localhost without allowPrivateNetworks', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      await expect(
        extractColors(`http://127.0.0.1:${port}/test.png`),
      ).rejects.toThrow(ColorExtractorError)
      try {
        await extractColors(`http://127.0.0.1:${port}/test.png`)
      } catch (e) {
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
    })
  })

  describe('AC: protocol validation', () => {
    it('throws COLOR_EXTRACTOR_UNSAFE_URL when allowedProtocols is empty', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/test.png`, {
          remote: { allowPrivateNetworks: true, allowedProtocols: [] },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
    })
  })

  describe('AC: redirect validation', () => {
    it('throws COLOR_EXTRACTOR_UNSAFE_URL for redirect to disallowed protocol', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/redirect-bad-protocol`, {
          remote: { allowPrivateNetworks: true },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
    })

    it('throws COLOR_EXTRACTOR_UNSAFE_URL for redirect loop', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/redirect-loop`, {
          remote: { allowPrivateNetworks: true },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSAFE_URL')
      }
    }, 10_000)
  })

  describe('AC: max pixel limit', () => {
    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when maxPixels is exceeded', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/big-dimensions`, {
          remote: { allowPrivateNetworks: true },
          decode: { maxPixels: 100 },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_IMAGE_TOO_LARGE')
      }
    })
  })

  describe('AC: SVG disabled by default', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_FORMAT for SVG content type', async () => {
      const { extractColors } = await import('../../src/node/index.js')
      try {
        await extractColors(`http://127.0.0.1:${port}/svg-content`, {
          remote: { allowPrivateNetworks: true },
        })
        expect.fail('Expected error')
      } catch (e) {
        expect((e as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_FORMAT')
      }
    })
  })
})
