import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractColors } from '../../src/node/index.js'
import { ColorExtractorError } from '../../src/core/index.js'
import type { NodeExtractColorsInput } from '../../src/node/index.js'

const rootDir = resolve(import.meta.dirname, '../..')

function readDist(relPath: string): string {
  return readFileSync(resolve(rootDir, 'dist', relPath), 'utf-8')
}

describe('Node extractColors (Phase 5)', () => {
  describe('AC: input kind detection rejects unsupported inputs', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for null', async () => {
      await expect(extractColors(null as unknown as NodeExtractColorsInput)).rejects.toThrow(
        ColorExtractorError,
      )
    })

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for undefined', async () => {
      await expect(extractColors(undefined as unknown as NodeExtractColorsInput)).rejects.toThrow(
        ColorExtractorError,
      )
    })

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for a number', async () => {
      await expect(extractColors(42 as unknown as NodeExtractColorsInput)).rejects.toMatchObject({
        code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      })
    })

    it('thrown error has code COLOR_EXTRACTOR_UNSUPPORTED_INPUT', async () => {
      try {
        await extractColors(null as unknown as NodeExtractColorsInput)
        expect.fail('expected throw')
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
    })
  })

  describe('AC: detected input kinds are accepted and reach the decode wiring boundary (review #3)', () => {
    it('Buffer input is accepted by kind detection and reaches the not-yet-wired decode boundary', async () => {
      try {
        await extractColors(Buffer.from([0, 0, 0, 0]))
        expect.fail('expected throw (decode not wired in this phase)')
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
        expect((error as Error).message).toMatch(/not implemented/i)
      }
    })

    it('Uint8Array input is accepted by kind detection and reaches the decode wiring boundary', async () => {
      try {
        await extractColors(new Uint8Array(4))
        expect.fail('expected throw (decode not wired in this phase)')
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
    })

    it('ArrayBuffer input is accepted by kind detection and reaches the decode wiring boundary', async () => {
      try {
        await extractColors(new ArrayBuffer(4))
        expect.fail('expected throw (decode not wired in this phase)')
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
    })

    it('string URL input is accepted by kind detection and reaches the decode wiring boundary', async () => {
      try {
        await extractColors('https://example.com/image.png')
        expect.fail('expected throw (decode not wired in this phase)')
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
    })

    it('local path string is accepted by kind detection and reaches the decode wiring boundary', async () => {
      try {
        await extractColors('/path/to/image.png')
        expect.fail('expected throw (decode not wired in this phase)')
      } catch (error) {
        expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
      }
    })
  })
})

describe('dist entrypoint shape', () => {
  it('dist/node/index.js exports extractColors', () => {
    const js = readDist('node/index.js')
    expect(js).toMatch(/extractColors/)
  })

  it('dist/browser/index.js exports extractColors', () => {
    const js = readDist('browser/index.js')
    expect(js).toMatch(/extractColors/)
  })

  it('dist/index.d.ts declares extractColors at the root', () => {
    const dts = readDist('index.d.ts')
    expect(dts).toMatch(/extractColors/)
  })

  it('dist/browser/index.d.ts declares BrowserExtractColorsInput', () => {
    const dts = readDist('browser/index.d.ts')
    expect(dts).toMatch(/BrowserExtractColorsInput/)
  })

  it('dist/node/index.d.ts declares NodeExtractColorsInput', () => {
    const dts = readDist('node/index.d.ts')
    expect(dts).toMatch(/NodeExtractColorsInput/)
  })
})
