import { ColorExtractorError } from '../core/errors.js'
import { sampleImageToCanvas } from './canvas.js'

export interface DecodedPixels {
  readonly width: number
  readonly height: number
  readonly channels: 4
  readonly data: Uint8Array
}

function isCreateImageBitmapAvailable(): boolean {
  return typeof createImageBitmap === 'function'
}

function isImageConstructorAvailable(): boolean {
  return typeof Image === 'function'
}

function validateMaxPixels(width: number, height: number, maxPixels: number): void {
  if (!Number.isFinite(maxPixels) || maxPixels <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `decode.maxPixels must be a positive finite number, got ${maxPixels}`,
      { cause: maxPixels },
    )
  }
  const total = width * height
  if (total > maxPixels) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
      `Image is too large (${total} pixels, max ${maxPixels}).`,
      { cause: { width, height, maxPixels } },
    )
  }
}

async function decodeViaImageElement(
  url: string,
  sampleSize: number,
  maxPixels: number,
): Promise<DecodedPixels> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(
        new ColorExtractorError(
          'COLOR_EXTRACTOR_DECODE_FAILED',
          'Failed to decode image from blob.',
        ),
      )
    image.src = url
  })

  validateMaxPixels(img.naturalWidth, img.naturalHeight, maxPixels)
  const result = sampleImageToCanvas(img, img.naturalWidth, img.naturalHeight, sampleSize)
  return decodeCanvasResult(result)
}

async function decodeViaCreateImageBitmap(
  input: File | Blob,
  sampleSize: number,
  maxPixels: number,
): Promise<DecodedPixels> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(input)
    validateMaxPixels(bitmap.width, bitmap.height, maxPixels)
    const result = sampleImageToCanvas(bitmap, bitmap.width, bitmap.height, sampleSize)
    return decodeCanvasResult(result)
  } finally {
    if (bitmap !== null) {
      bitmap.close()
    }
  }
}

async function decodeViaObjectUrl(
  input: File | Blob,
  sampleSize: number,
  maxPixels: number,
): Promise<DecodedPixels> {
  const url = URL.createObjectURL(input)
  try {
    return await decodeViaImageElement(url, sampleSize, maxPixels)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function decodeCanvasResult(
  result: { pixels: Uint8ClampedArray; width: number; height: number },
): DecodedPixels {
  return {
    width: result.width,
    height: result.height,
    channels: 4 as const,
    data: new Uint8Array(
      result.pixels.buffer,
      result.pixels.byteOffset,
      result.pixels.byteLength,
    ),
  }
}

export function sampleImageElement(
  img: HTMLImageElement,
  sampleSize: number,
  maxPixels: number,
): DecodedPixels {
  if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'HTMLImageElement is not fully loaded or has zero dimensions.',
    )
  }
  validateMaxPixels(img.naturalWidth, img.naturalHeight, maxPixels)
  try {
    const result = sampleImageToCanvas(img, img.naturalWidth, img.naturalHeight, sampleSize)
    return decodeCanvasResult(result)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'SecurityError') {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_CORS_ERROR',
        'HTMLImageElement is tainted by cross-origin content and cannot be read.',
        { cause },
      )
    }
    throw cause
  }
}

export function sampleImageBitmap(
  bitmap: ImageBitmap,
  sampleSize: number,
  maxPixels: number,
): DecodedPixels {
  if (bitmap.width === 0 || bitmap.height === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'ImageBitmap has zero dimensions and cannot be decoded.',
    )
  }
  validateMaxPixels(bitmap.width, bitmap.height, maxPixels)
  try {
    const result = sampleImageToCanvas(bitmap, bitmap.width, bitmap.height, sampleSize)
    return decodeCanvasResult(result)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'SecurityError') {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_CORS_ERROR',
        'ImageBitmap originates from cross-origin content and cannot be read.',
        { cause },
      )
    }
    throw cause
  } finally {
    bitmap.close()
  }
}

export function sampleCanvasElement(
  canvas: HTMLCanvasElement,
  sampleSize: number,
  maxPixels: number,
): DecodedPixels {
  if (canvas.width === 0 || canvas.height === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Canvas has zero dimensions and cannot be decoded.',
    )
  }
  validateMaxPixels(canvas.width, canvas.height, maxPixels)
  try {
    const result = sampleImageToCanvas(canvas, canvas.width, canvas.height, sampleSize)
    return decodeCanvasResult(result)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'SecurityError') {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_CORS_ERROR',
        'Canvas is tainted by cross-origin content and cannot be read.',
        { cause },
      )
    }
    throw cause
  }
}

export function sampleImageDataInput(
  imageData: ImageData,
  sampleSize: number,
  maxPixels: number,
): DecodedPixels {
  if (imageData.width === 0 || imageData.height === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'ImageData has zero dimensions and cannot be decoded.',
    )
  }
  validateMaxPixels(imageData.width, imageData.height, maxPixels)
  return {
    width: imageData.width,
    height: imageData.height,
    channels: 4 as const,
    data: new Uint8Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength,
    ),
  }
}

function isAbortError(cause: unknown): boolean {
  return (
    cause instanceof DOMException &&
    (cause.name === 'AbortError' || cause.name === 'TimeoutError')
  )
}

export async function decodeRemoteUrl(
  url: string,
  sampleSize: number,
  maxPixels: number,
  timeoutMs: number,
  maxBytes: number,
): Promise<DecodedPixels> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `remote.timeoutMs must be a positive number, got ${timeoutMs}`,
      { cause: timeoutMs },
    )
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `remote.maxBytes must be a positive number, got ${maxBytes}`,
      { cause: maxBytes },
    )
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => {
    controller.abort(
      new ColorExtractorError(
        'COLOR_EXTRACTOR_TIMEOUT',
        `Remote fetch to ${url} exceeded ${timeoutMs}ms timeout.`,
      ),
    )
  }, timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } catch (cause) {
      if (isAbortError(cause)) {
        throw new ColorExtractorError(
          'COLOR_EXTRACTOR_TIMEOUT',
          `Remote fetch to ${url} aborted after ${timeoutMs}ms.`,
          { cause },
        )
      }
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_FETCH_FAILED',
        `Failed to fetch remote URL: ${url}.`,
        { cause },
      )
    }

    if (!response.ok) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_FETCH_FAILED',
        `Remote fetch to ${url} failed with status ${response.status}.`,
      )
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel()
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
        `Remote response from ${url} advertises ${contentLength} bytes which exceeds the ${maxBytes}-byte limit.`,
        { cause: { url, contentLength, maxBytes } },
      )
    }

    let blob: Blob
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      try {
        while (true) {
          let result: ReadableStreamReadResult<Uint8Array>
          try {
            result = await reader.read()
          } catch (cause) {
            if (isAbortError(cause)) {
              throw new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Remote fetch to ${url} timed out while reading body after ${timeoutMs}ms.`,
                { cause },
              )
            }
            throw cause
          }
          if (result.done) break
          if (result.value) {
            received += result.value.byteLength
            if (received > maxBytes) {
              await reader.cancel()
              throw new ColorExtractorError(
                'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                `Remote response from ${url} exceeded the ${maxBytes}-byte limit while streaming.`,
                { cause: { url, maxBytes, received } },
              )
            }
            chunks.push(result.value)
          }
        }
      } finally {
        try { reader.releaseLock() } catch { /* already released */ }
      }
      blob = new Blob(chunks as BlobPart[])
    } else {
      blob = await response.blob()
      if (blob.size > maxBytes) {
        throw new ColorExtractorError(
          'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
          `Remote response from ${url} is ${blob.size} bytes which exceeds the ${maxBytes}-byte limit.`,
          { cause: { url, size: blob.size, maxBytes } },
        )
      }
    }

    if (blob.size === 0) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_FETCH_FAILED',
        `Remote fetch to ${url} returned an empty body.`,
      )
    }

    return decodeFileOrBlob(blob, sampleSize, maxPixels)
  } finally {
    clearTimeout(timeoutHandle)
  }
}

/**
 * Decodes a File or Blob into raw pixel data.
 *
 * **Platform limitation — `maxPixels` cannot be enforced before decode:**
 * No browser API provides image dimensions without first decoding (or at least
 * partially decoding) the image. `createImageBitmap` only surfaces `width` and
 * `height` after the full bitmap has been allocated, and there is no portable
 * way to parse format headers (PNG, JPEG, WebP, etc.) for pre-decode validation.
 * As a result, `maxPixels` is checked *after* `createImageBitmap` completes;
 * a highly-compressible image (e.g. uniform 10 000×10 000 PNG) will still be
 * fully decoded into memory before the check rejects it. This is an accepted
 * trade-off of the browser decode pipeline.
 */
export async function decodeFileOrBlob(
  input: File | Blob,
  sampleSize: number,
  maxPixels: number,
): Promise<DecodedPixels> {
  if (isCreateImageBitmapAvailable()) {
    try {
      return await decodeViaCreateImageBitmap(input, sampleSize, maxPixels)
    } catch (cause) {
      if (cause instanceof ColorExtractorError) {
        throw cause
      }
      if (isImageConstructorAvailable()) {
        return await decodeViaObjectUrl(input, sampleSize, maxPixels)
      }
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_DECODE_FAILED',
        'Failed to decode File or Blob input.',
        { cause },
      )
    }
  }

  if (isImageConstructorAvailable()) {
    return await decodeViaObjectUrl(input, sampleSize, maxPixels)
  }

  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_DECODE_FAILED',
    'No decoding method available for File or Blob input in this environment.',
  )
}
