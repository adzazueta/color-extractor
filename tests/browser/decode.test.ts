import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  decodeFileOrBlob,
  decodeRemoteUrl,
  sampleImageBitmap,
  sampleImageElement,
  sampleCanvasElement,
  sampleImageDataInput,
} from '../../src/browser/decode.js'
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

const MAX_PIXELS = 25_000_000
const TIMEOUT_MS = 10_000
const MAX_BYTES = 10_000_000

describe('sampleImageBitmap (ADZ-59)', () => {
  beforeAll(() => {
    drawCalls = []
    vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas())
    vi.stubGlobal('ImageData', MockImageData)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('decodes a valid ImageBitmap', () => {
    const bitmap = { width: 2000, height: 1000, close: vi.fn() } as unknown as ImageBitmap
    const result = sampleImageBitmap(bitmap, 100, MAX_PIXELS)

    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
    expect(result.channels).toBe(4)
    expect(result.data).toBeInstanceOf(Uint8Array)
  })

  it('does not close the caller-owned bitmap after sampling', () => {
    const close = vi.fn()
    const bitmap = { width: 100, height: 100, close } as unknown as ImageBitmap
    sampleImageBitmap(bitmap, 150, MAX_PIXELS)
    expect(close).not.toHaveBeenCalled()
  })

  it('throws for zero-width bitmap', () => {
    const bitmap = { width: 0, height: 100, close: vi.fn() } as unknown as ImageBitmap
    expect(() => sampleImageBitmap(bitmap, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws for zero-height bitmap', () => {
    const bitmap = { width: 100, height: 0, close: vi.fn() } as unknown as ImageBitmap
    expect(() => sampleImageBitmap(bitmap, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when bitmap exceeds maxPixels', () => {
    const bitmap = { width: 10000, height: 10000, close: vi.fn() } as unknown as ImageBitmap
    expect(() => sampleImageBitmap(bitmap, 150, 1_000_000)).toThrow(ColorExtractorError)
  })
})

describe('sampleImageElement (ADZ-59)', () => {
  beforeAll(() => {
    drawCalls = []
    vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas())
    vi.stubGlobal('ImageData', MockImageData)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('decodes a loaded image element', () => {
    const img = {
      complete: true,
      naturalWidth: 3000,
      naturalHeight: 2000,
    } as unknown as HTMLImageElement

    const result = sampleImageElement(img, 150, MAX_PIXELS)

    expect(result.width).toBe(150)
    expect(result.height).toBe(100)
    expect(result.channels).toBe(4)
    expect(result.data).toBeInstanceOf(Uint8Array)
  })

  it('throws for incomplete image element', () => {
    const img = {
      complete: false,
      naturalWidth: 100,
      naturalHeight: 100,
    } as unknown as HTMLImageElement

    expect(() => sampleImageElement(img, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws for image with zero naturalWidth', () => {
    const img = {
      complete: true,
      naturalWidth: 0,
      naturalHeight: 100,
    } as unknown as HTMLImageElement

    expect(() => sampleImageElement(img, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws for image with zero naturalHeight', () => {
    const img = {
      complete: true,
      naturalWidth: 100,
      naturalHeight: 0,
    } as unknown as HTMLImageElement

    expect(() => sampleImageElement(img, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when image exceeds maxPixels', () => {
    const small = {
      complete: true,
      naturalWidth: 1000,
      naturalHeight: 1000,
    } as unknown as HTMLImageElement

    const large = {
      complete: true,
      naturalWidth: 10000,
      naturalHeight: 10000,
    } as unknown as HTMLImageElement

    expect(() => sampleImageElement(small, 150, 50_000_000)).not.toThrow()
    expect(() => sampleImageElement(large, 150, 1_000_000)).toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE' }),
    )
  })
})

describe('sampleCanvasElement (ADZ-61)', () => {
  beforeAll(() => {
    drawCalls = []
    vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas())
    vi.stubGlobal('ImageData', MockImageData)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('decodes a canvas element with downsampling', () => {
    const canvas = { width: 2000, height: 1000 } as HTMLCanvasElement
    const result = sampleCanvasElement(canvas, 100, MAX_PIXELS)

    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
    expect(result.channels).toBe(4)
    expect(result.data).toBeInstanceOf(Uint8Array)
  })

  it('throws for zero-width canvas', () => {
    const canvas = { width: 0, height: 100 } as HTMLCanvasElement
    expect(() => sampleCanvasElement(canvas, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws for zero-height canvas', () => {
    const canvas = { width: 100, height: 0 } as HTMLCanvasElement
    expect(() => sampleCanvasElement(canvas, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when canvas exceeds maxPixels', () => {
    const canvas = { width: 10000, height: 10000 } as HTMLCanvasElement
    expect(() => sampleCanvasElement(canvas, 150, 1_000_000)).toThrow(
      ColorExtractorError,
    )
  })
})

describe('sampleImageDataInput (ADZ-61)', () => {
  it('returns pixels from ImageData directly', () => {
    const data = new Uint8ClampedArray(100 * 80 * 4)
    const imageData = { data, width: 100, height: 80 } as ImageData
    const result = sampleImageDataInput(imageData, 150, MAX_PIXELS)

    expect(result.width).toBe(100)
    expect(result.height).toBe(80)
    expect(result.channels).toBe(4)
    expect(result.data).toBeInstanceOf(Uint8Array)
    expect(result.data.length).toBe(100 * 80 * 4)
  })

  it('returns pixel data with same buffer content', () => {
    const buffer = new Uint8ClampedArray(16)
    buffer[0] = 255
    buffer[1] = 128
    buffer[2] = 64
    buffer[3] = 32
    const imageData = { data: buffer, width: 2, height: 2 } as ImageData
    const result = sampleImageDataInput(imageData, 150, MAX_PIXELS)

    expect(result.data[0]).toBe(255)
    expect(result.data[1]).toBe(128)
    expect(result.data[2]).toBe(64)
    expect(result.data[3]).toBe(32)
  })

  it('throws for zero-width ImageData', () => {
    const imageData = { data: new Uint8ClampedArray(0), width: 0, height: 100 } as ImageData
    expect(() => sampleImageDataInput(imageData, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws for zero-height ImageData', () => {
    const imageData = { data: new Uint8ClampedArray(0), width: 100, height: 0 } as ImageData
    expect(() => sampleImageDataInput(imageData, 150, MAX_PIXELS)).toThrow(ColorExtractorError)
  })

  it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when ImageData exceeds maxPixels', () => {
    const imageData = {
      data: new Uint8ClampedArray(50000 * 50000 * 4),
      width: 50000,
      height: 50000,
    } as ImageData
    expect(() => sampleImageDataInput(imageData, 150, 1_000_000)).toThrow(ColorExtractorError)
  })
})

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
      const bitmap = {
        width: 3000,
        height: 2000,
        close: bitmapClose,
      } as unknown as ImageBitmap
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['fake-image-data'], { type: 'image/png' })
      const result = await decodeFileOrBlob(blob, 150, MAX_PIXELS)

      expect(mockCreateImageBitmap).toHaveBeenCalledWith(blob)
      expect(result.width).toBe(150)
      expect(result.height).toBe(100)
      expect(result.channels).toBe(4)
      expect(result.data).toBeInstanceOf(Uint8Array)
      expect(result.data.length).toBe(150 * 100 * 4)
    })

    it('closes the bitmap after use', async () => {
      bitmapClose.mockClear()
      const bitmap = {
        width: 100,
        height: 100,
        close: bitmapClose,
      } as unknown as ImageBitmap
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['x'], { type: 'image/png' })
      await decodeFileOrBlob(blob, 150, MAX_PIXELS)

      expect(bitmapClose).toHaveBeenCalledOnce()
    })

    it('draws the bitmap to canvas at target size', async () => {
      drawCalls = []
      const bitmap = {
        width: 2000,
        height: 1000,
        close: vi.fn(),
      } as unknown as ImageBitmap
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['y'], { type: 'image/png' })
      await decodeFileOrBlob(blob, 100, MAX_PIXELS)

      expect(drawCalls).toHaveLength(1)
      expect(drawCalls[0]!.image).toBe(bitmap)
      expect(drawCalls[0]!.dw).toBe(100)
      expect(drawCalls[0]!.dh).toBe(50)
    })

    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when bitmap exceeds maxPixels', async () => {
      const bitmap = {
        width: 10000,
        height: 10000,
        close: vi.fn(),
      } as unknown as ImageBitmap
      mockCreateImageBitmap.mockResolvedValue(bitmap)

      const blob = new Blob(['x'], { type: 'image/png' })
      const err = await decodeFileOrBlob(blob, 150, 1_000_000).catch(e => e)
      expect(err).toBeInstanceOf(ColorExtractorError)
      expect((err as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_IMAGE_TOO_LARGE')
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
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })

      const blob = new Blob(['fake'], { type: 'image/png' })
      const result = await decodeFileOrBlob(blob, 150, MAX_PIXELS)

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
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })
    })

    afterAll(() => {
      vi.stubGlobal('createImageBitmap', undefined)
    })

    it('throws ColorExtractorError when no decoding method is available', async () => {
      const blob = new Blob(['fake'], { type: 'image/png' })

      await expect(decodeFileOrBlob(blob, 150, MAX_PIXELS)).rejects.toThrow(
        ColorExtractorError,
      )
    })
  })
})

describe('decodeRemoteUrl (ADZ-50)', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let mockCreateImageBitmap: ReturnType<typeof vi.fn>

  beforeAll(() => {
    drawCalls = []
    vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas())
    vi.stubGlobal('ImageData', MockImageData)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  function stubAbortableFetch(resolvedValue: unknown) {
    mockFetch = vi.fn().mockImplementation((url: string, init?: { signal?: AbortSignal }) => {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {})
      }
      return Promise.resolve(resolvedValue)
    })
    vi.stubGlobal('fetch', mockFetch)
  }

  it('fetches a URL with timeout and decodes the blob', async () => {
    const mockBlob = new Blob(['fake-image'], { type: 'image/png' })
    const mockResponse = {
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      body: null,
      blob: vi.fn().mockResolvedValue(mockBlob),
    }
    mockCreateImageBitmap = vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    } as unknown as ImageBitmap)
    vi.stubGlobal('createImageBitmap', mockCreateImageBitmap)
    stubAbortableFetch(mockResponse)

    const result = await decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, MAX_BYTES)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/image.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result.width).toBe(100)
    expect(result.height).toBe(100)
    expect(result.channels).toBe(4)
  })

  it('throws on fetch failure', async () => {
    mockFetch = vi.fn().mockRejectedValue(new TypeError('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, MAX_BYTES),
    ).rejects.toThrow(ColorExtractorError)
  })

  it('throws on non-2xx status', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      headers: { get: vi.fn().mockReturnValue(null) },
      body: null,
      blob: vi.fn(),
    }
    stubAbortableFetch(mockResponse)

    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, MAX_BYTES),
    ).rejects.toThrow(ColorExtractorError)
  })

  it('throws on Content-Length exceeding maxBytes', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue('99999999999') },
      body: { cancel: vi.fn() },
      blob: vi.fn(),
    }
    stubAbortableFetch(mockResponse)

    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, 100),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_INPUT_TOO_LARGE' }),
    )
  })

  it('throws on empty body', async () => {
    const mockBlob = new Blob([], { type: '' })
    const mockResponse = {
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      body: null,
      blob: vi.fn().mockResolvedValue(mockBlob),
    }
    stubAbortableFetch(mockResponse)

    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, MAX_BYTES),
    ).rejects.toThrow(ColorExtractorError)
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid timeoutMs (0)', async () => {
    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, 0, MAX_BYTES),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT' }),
    )
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid timeoutMs (negative)', async () => {
    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, -1, MAX_BYTES),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT' }),
    )
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid timeoutMs (NaN)', async () => {
    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, Number.NaN, MAX_BYTES),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT' }),
    )
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid maxBytes (0)', async () => {
    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, 0),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT' }),
    )
  })

  it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid maxBytes (negative)', async () => {
    await expect(
      decodeRemoteUrl('https://example.com/image.png', 150, MAX_PIXELS, TIMEOUT_MS, -1),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT' }),
    )
  })
})

describe('decode.maxPixels enforced post-decode (platform limitation)', () => {
  beforeAll(() => {
    drawCalls = []
    vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas())
    vi.stubGlobal('ImageData', MockImageData)
    vi.stubGlobal('createImageBitmap', vi.fn())
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('validates maxPixels after createImageBitmap decodes the image', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 100,
        height: 100,
        close: vi.fn(),
      } as unknown as ImageBitmap),
    )

    await expect(decodeFileOrBlob(new Blob(['x'.repeat(100)]), 150, 10)).rejects.toThrowError(
      expect.objectContaining({ code: 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE' }),
    )
  })
})
