import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { decodeFileOrBlob } from '../../src/browser/decode.js'
import { ColorExtractorError } from '../../src/core/errors.js'

class MockImageData {
  data: Uint8ClampedArray
  width: number
  height: number

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

type MockBitmap = {
  width: number
  height: number
  close: ReturnType<typeof vi.fn>
}

type MockDrawCall = {
  image: unknown
  dx: number
  dy: number
  dw: number
  dh: number
}

let drawCalls: MockDrawCall[] = []

function createMockOffscreenCanvas() {
  return class {
    _width: number
    _height: number

    constructor(width: number, height: number) {
      this._width = width
      this._height = height
    }

    get width() {
      return this._width
    }
    get height() {
      return this._height
    }

    getContext(type: string) {
      if (type !== '2d') return null
      return {
        drawImage: vi.fn((image: unknown, dx: number, dy: number, dw: number, dh: number) => {
          drawCalls.push({ image, dx, dy, dw, dh })
        }),
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
          return new MockImageData(new Uint8ClampedArray(w * h * 4), w, h)
        }),
      }
    }
  } as unknown as typeof OffscreenCanvas
}

describe('decodeFileOrBlob (ADZ-54)', () => {
  let bitmapClose: ReturnType<typeof vi.fn>
  let mockCreateImageBitmap: ReturnType<typeof vi.fn>
  let mockCreateObjectURL: ReturnType<typeof vi.fn>
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>

  beforeAll(() => {
    drawCalls = []
    bitmapClose = vi.fn()

    mockCreateImageBitmap = vi.fn()

    mockCreateObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url')
    mockRevokeObjectURL = vi.fn()

    vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas())
    vi.stubGlobal('ImageData', MockImageData)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  describe('primary path: createImageBitmap succeeds', () => {
    beforeAll(() => {
      drawCalls = []
      mockCreateImageBitmap = vi.fn()
      vi.stubGlobal('createImageBitmap', mockCreateImageBitmap)
    })

    afterAll(() => {
      vi.stubGlobal('createImageBitmap', undefined)
    })

    it('decodes a blob via createImageBitmap and canvas downsample', async () => {
      const bitmap: MockBitmap = {
        width: 3000,
        height: 2000,
        close: bitmapClose,
      }
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['fake-image-data'], { type: 'image/png' })
      const result = await decodeFileOrBlob(blob, 150)

      expect(mockCreateImageBitmap).toHaveBeenCalledWith(blob)
      expect(result.width).toBe(150)
      expect(result.height).toBe(100)
      expect(result.channels).toBe(4)
      expect(result.data).toBeInstanceOf(Uint8Array)
      expect(result.data.length).toBe(150 * 100 * 4)
    })

    it('closes the bitmap after use', async () => {
      bitmapClose.mockClear()
      const bitmap: MockBitmap = {
        width: 100,
        height: 100,
        close: bitmapClose,
      }
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['x'], { type: 'image/png' })
      await decodeFileOrBlob(blob, 150)

      expect(bitmapClose).toHaveBeenCalledOnce()
    })

    it('draws the bitmap to canvas at target size', async () => {
      drawCalls = []
      const bitmap: MockBitmap = {
        width: 2000,
        height: 1000,
        close: vi.fn(),
      }
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['y'], { type: 'image/png' })
      await decodeFileOrBlob(blob, 100)

      expect(drawCalls).toHaveLength(1)
      expect(drawCalls[0]!.image).toBe(bitmap)
      expect(drawCalls[0]!.dw).toBe(100)
      expect(drawCalls[0]!.dh).toBe(50)
    })
  })

  describe('primary path: createImageBitmap unavailable', () => {
    beforeAll(() => {
      vi.stubGlobal('createImageBitmap', undefined)
    })

    afterAll(() => {
      vi.stubGlobal('createImageBitmap', undefined)
    })

    it('falls back to Image element when createImageBitmap is not available', async () => {
      const mockImage = vi.fn()
      let onloadCallback: (() => void) | null = null
      let currentSrc = ''

      function MockImageConstructor() {
        const img = {
          get src() {
            return currentSrc
          },
          set src(val: string) {
            currentSrc = val
            setTimeout(() => {
              if (onloadCallback) onloadCallback()
            }, 0)
          },
          onload: null as (() => void) | null,
          onerror: null as (() => void) | null,
          naturalWidth: 100,
          naturalHeight: 80,
        }
        Object.defineProperty(img, 'onload', {
          get() {
            return onloadCallback
          },
          set(fn: (() => void) | null) {
            onloadCallback = fn
          },
        })
        mockImage()
        return img
      }

      vi.stubGlobal('Image', MockImageConstructor as unknown as typeof Image)
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL })

      const blob = new Blob(['fake'], { type: 'image/png' })
      const result = await decodeFileOrBlob(blob, 150)

      expect(result.width).toBe(100)
      expect(result.height).toBe(80)
      expect(result.channels).toBe(4)
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })
  })

  describe('error handling', () => {
    beforeAll(() => {
      vi.stubGlobal('createImageBitmap', undefined)
      vi.stubGlobal('Image', undefined)
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL })
    })

    afterAll(() => {
      vi.stubGlobal('createImageBitmap', undefined)
    })

    it('throws ColorExtractorError when no decoding method is available', async () => {
      const blob = new Blob(['fake'], { type: 'image/png' })

      await expect(decodeFileOrBlob(blob, 150)).rejects.toThrow(ColorExtractorError)
    })
  })
})
