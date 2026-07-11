import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractColors } from '../src/node/index.js'
import { ColorExtractorError } from '../src/core/index.js'
import type { NodeExtractColorsInput } from '../src/node/index.js'

const rootDir = resolve(import.meta.dirname, '..')

function readDist(relPath: string): string {
  return readFileSync(resolve(rootDir, 'dist', relPath), 'utf-8')
}

describe('Node extractColors', () => {
  it('returns a result for a Buffer input', async () => {
    const result = await extractColors(Buffer.from([0, 0, 0, 0]))
    expect(result.primary).toBeDefined()
    expect(result.primary.hex).toBe('#808080')
    expect(result.secondary).toBeNull()
  })

  it('returns a result for a Uint8Array input', async () => {
    const result = await extractColors(new Uint8Array(4))
    expect(result.primary).toBeDefined()
  })

  it('returns a result for an ArrayBuffer input', async () => {
    const result = await extractColors(new ArrayBuffer(4))
    expect(result.primary).toBeDefined()
  })

  it('returns a result for a string (URL or path) input', async () => {
    const result = await extractColors('/path/to/image.png')
    expect(result.primary).toBeDefined()
  })

  it('returns a result for a string URL input', async () => {
    const result = await extractColors('https://example.com/image.png')
    expect(result.primary).toBeDefined()
  })

  it('accepts options without error (stub ignores them for now)', async () => {
    const result = await extractColors(Buffer.from([0, 0, 0, 0]), {
      sampleSize: 200,
      output: { includePalette: true },
    })
    expect(result).toBeDefined()
  })

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

  it('thrown error has code COLOR_EXTRACTOR_UNSUPPORTED_INPUT', async () => {
    try {
      await extractColors(null as unknown as NodeExtractColorsInput)
      expect.fail('expected throw')
    } catch (error) {
      expect((error as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_UNSUPPORTED_INPUT')
    }
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
