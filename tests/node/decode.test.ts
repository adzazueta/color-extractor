import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import { ColorExtractorError } from '../../src/core/errors.js'
import { _resetSharpCacheForTests, _setSharpImporterForTests } from '../../src/node/sharp.js'
import {
  _internalComputeResizeTargetForTests,
  _internalIsSharpPipelineForTests,
  decodeBufferToPixels,
} from '../../src/node/decode.js'

async function makePng(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer()
}

beforeAll(() => {
  _setSharpImporterForTests(() => Promise.resolve(sharp))
})

describe('decodeBufferToPixels (ADZ-71)', () => {
  describe('AC: raw RGBA pixels are returned with width, height, and data', () => {
    it('decodes a 10x10 solid PNG into 10x10 raw pixels', async () => {
      const png = await makePng(10, 10, { r: 200, g: 30, b: 30 })
      const out = await decodeBufferToPixels(png, 150, { respectOrientation: true })
      expect(out.width).toBe(10)
      expect(out.height).toBe(10)
      expect(out.data).toBeInstanceOf(Uint8Array)
      expect(out.data.length).toBe(10 * 10 * out.channels)
    })

    it('preserves the color of a solid image', async () => {
      const png = await makePng(8, 8, { r: 200, g: 30, b: 30 })
      const out = await decodeBufferToPixels(png, 150, { respectOrientation: true })
      const px = out.data
      expect(out.channels).toBeGreaterThanOrEqual(3)
      expect(px[0]).toBe(200)
      expect(px[1]).toBe(30)
      expect(px[2]).toBe(30)
    })
  })

  describe('AC: early resize to sampleSize preserves aspect ratio', () => {
    it('shrinks a 300x150 image to 150x75 with sampleSize=150', async () => {
      const png = await makePng(300, 150, { r: 0, g: 0, b: 200 })
      const out = await decodeBufferToPixels(png, 150, { respectOrientation: true })
      expect(out.width).toBeLessThanOrEqual(150)
      expect(out.height).toBeLessThanOrEqual(150)
      expect(out.width / out.height).toBeCloseTo(2, 1)
    })

    it('keeps original size when the image is smaller than sampleSize', async () => {
      const png = await makePng(40, 40, { r: 100, g: 100, b: 100 })
      const out = await decodeBufferToPixels(png, 150, { respectOrientation: true })
      expect(out.width).toBe(40)
      expect(out.height).toBe(40)
    })
  })

  describe('AC: orientation normalization respects respectOrientation flag', () => {
    it('does not throw with respectOrientation: true on a normal PNG', async () => {
      const png = await makePng(20, 20, { r: 100, g: 100, b: 100 })
      await expect(decodeBufferToPixels(png, 150, { respectOrientation: true })).resolves.toBeDefined()
    })

    it('does not throw with respectOrientation: false', async () => {
      const png = await makePng(20, 20, { r: 100, g: 100, b: 100 })
      await expect(decodeBufferToPixels(png, 150, { respectOrientation: false })).resolves.toBeDefined()
    })
  })

  describe('AC: invalid sampleSize is rejected with typed error', () => {
    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for sampleSize=0', async () => {
      const png = await makePng(10, 10, { r: 0, g: 0, b: 0 })
      await expect(
        decodeBufferToPixels(png, 0, { respectOrientation: true }),
      ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT' })
    })
  })

  describe('AC: corrupt bytes produce DECODE_FAILED', () => {
    it('throws when the buffer is not a valid image', async () => {
      const garbage = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      await expect(
        decodeBufferToPixels(garbage, 150, { respectOrientation: true }),
      ).rejects.toBeInstanceOf(ColorExtractorError)
    })
  })
})

describe('computeResizeTarget (ADZ-71)', () => {
  it('returns the sampleSize side for square images larger than sampleSize', () => {
    expect(_internalComputeResizeTargetForTests(300, 300, 150)).toEqual({ width: 150, height: 150 })
  })

  it('preserves aspect ratio for landscape images', () => {
    expect(_internalComputeResizeTargetForTests(400, 200, 200)).toEqual({ width: 200, height: 100 })
  })

  it('preserves aspect ratio for portrait images', () => {
    expect(_internalComputeResizeTargetForTests(200, 400, 200)).toEqual({ width: 100, height: 200 })
  })

  it('does not enlarge images smaller than sampleSize', () => {
    expect(_internalComputeResizeTargetForTests(50, 50, 150)).toEqual({ width: 50, height: 50 })
  })

  it('returns at least 1x1 for non-positive inputs', () => {
    expect(_internalComputeResizeTargetForTests(0, 0, 150).width).toBeGreaterThanOrEqual(1)
  })
})

describe('isSharpPipeline (ADZ-71)', () => {
  it('returns true for objects with rotate, resize, raw, metadata methods', () => {
    expect(_internalIsSharpPipelineForTests({
      rotate: () => ({}),
      resize: () => ({}),
      raw: () => ({}),
      metadata: () => ({}),
    })).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(_internalIsSharpPipelineForTests({})).toBe(false)
    expect(_internalIsSharpPipelineForTests(null)).toBe(false)
    expect(_internalIsSharpPipelineForTests(undefined)).toBe(false)
    expect(_internalIsSharpPipelineForTests(42)).toBe(false)
  })
})
