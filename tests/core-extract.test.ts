import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  extractColorsFromPixels,
  extractColorsFromImageData,
} from '../src/core/extract.js'
import { ColorExtractorError } from '../src/core/index.js'
import type { PixelInput } from '../src/core/validation.js'

function makePixels(width: number, height: number, fill: number = 128): PixelInput {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill
    data[i + 1] = fill
    data[i + 2] = fill
    data[i + 3] = 255
  }
  return { data, width, height }
}

describe('extractColorsFromPixels', () => {
  it('returns a result for a valid PixelInput', async () => {
    const result = await extractColorsFromPixels(makePixels(10, 10))
    expect(result.primary).toBeDefined()
    expect(result.primary.hex).toBe('#808080')
    expect(result.secondary).toBeNull()
  })

  it('accepts Uint8ClampedArray', async () => {
    const result = await extractColorsFromPixels({
      data: new Uint8ClampedArray(400),
      width: 10,
      height: 10,
    })
    expect(result.primary).toBeDefined()
  })

  it('accepts number[] payload', async () => {
    const result = await extractColorsFromPixels({
      data: [0, 0, 0, 255],
      width: 1,
      height: 1,
    })
    expect(result.primary).toBeDefined()
  })

  it('accepts options without error', async () => {
    const result = await extractColorsFromPixels(makePixels(10, 10), {
      sampleSize: 200,
      output: { includePalette: true },
    })
    expect(result).toBeDefined()
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid input (no data)', async () => {
    await expect(
      extractColorsFromPixels({} as unknown as PixelInput),
    ).rejects.toThrow(ColorExtractorError)
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for null', async () => {
    await expect(
      extractColorsFromPixels(null as unknown as PixelInput),
    ).rejects.toThrow(ColorExtractorError)
  })

  it('returns the same result shape as the root API', async () => {
    const result = await extractColorsFromPixels(makePixels(10, 10))
    expect(result).toHaveProperty('primary')
    expect(result).toHaveProperty('secondary')
  })
})

describe('extractColorsFromImageData', () => {
  it('accepts an ImageData input (type-level)', () => {
    expectTypeOf<Parameters<typeof extractColorsFromImageData>[0]>().toEqualTypeOf<ImageData>()
  })

  it('rejects non-ImageData inputs at the type level', () => {
    expectTypeOf<File>().not.toMatchTypeOf<Parameters<typeof extractColorsFromImageData>[0]>()
    expectTypeOf<Buffer>().not.toMatchTypeOf<Parameters<typeof extractColorsFromImageData>[0]>()
  })
})

describe('core entrypoint shape', () => {
  it('dist/core/index.js exports extractColorsFromPixels and extractColorsFromImageData', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const rootDir = path.resolve(import.meta.dirname, '..')
    const js = await fs.readFile(path.resolve(rootDir, 'dist/core/index.js'), 'utf-8')
    expect(js).toMatch(/extractColorsFromPixels/)
    expect(js).toMatch(/extractColorsFromImageData/)
  })

  it('dist/core/index.d.ts does not reference Buffer or File globals', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const rootDir = path.resolve(import.meta.dirname, '..')
    const dts = await fs.readFile(path.resolve(rootDir, 'dist/core/index.d.ts'), 'utf-8')
    expect(dts).not.toMatch(/\bBuffer\b/)
    expect(dts).not.toMatch(/\bFile\b/)
    expect(dts).not.toMatch(/\bBlob\b/)
  })
})
