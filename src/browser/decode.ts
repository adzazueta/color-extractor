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

async function decodeViaImageElement(
  url: string,
  sampleSize: number,
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

  const result = sampleImageToCanvas(img, img.naturalWidth, img.naturalHeight, sampleSize)
  return decodeCanvasResult(result)
}

async function decodeViaCreateImageBitmap(
  input: File | Blob,
  sampleSize: number,
): Promise<DecodedPixels> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(input)
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
): Promise<DecodedPixels> {
  const url = URL.createObjectURL(input)
  try {
    return await decodeViaImageElement(url, sampleSize)
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
): DecodedPixels {
  if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'HTMLImageElement is not fully loaded or has zero dimensions.',
    )
  }
  const result = sampleImageToCanvas(img, img.naturalWidth, img.naturalHeight, sampleSize)
  return decodeCanvasResult(result)
}

export function sampleImageBitmap(
  bitmap: ImageBitmap,
  sampleSize: number,
): DecodedPixels {
  if (bitmap.width === 0 || bitmap.height === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'ImageBitmap has zero dimensions and cannot be decoded.',
    )
  }
  const result = sampleImageToCanvas(bitmap, bitmap.width, bitmap.height, sampleSize)
  bitmap.close()
  return decodeCanvasResult(result)
}

export function sampleCanvasElement(
  canvas: HTMLCanvasElement,
  sampleSize: number,
): DecodedPixels {
  if (canvas.width === 0 || canvas.height === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'Canvas has zero dimensions and cannot be decoded.',
    )
  }
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
): DecodedPixels {
  if (imageData.width === 0 || imageData.height === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'ImageData has zero dimensions and cannot be decoded.',
    )
  }
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

export async function decodeRemoteUrl(
  url: string,
  sampleSize: number,
): Promise<DecodedPixels> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
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

  let blob: Blob
  try {
    blob = await response.blob()
  } catch (cause) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      `Failed to read response body from ${url} as blob.`,
      { cause },
    )
  }

  if (blob.size === 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_FETCH_FAILED',
      `Remote fetch to ${url} returned an empty body.`,
    )
  }

  return decodeFileOrBlob(blob, sampleSize)
}

export async function decodeFileOrBlob(
  input: File | Blob,
  sampleSize: number,
): Promise<DecodedPixels> {
  if (isCreateImageBitmapAvailable()) {
    try {
      return await decodeViaCreateImageBitmap(input, sampleSize)
    } catch (cause) {
      if (isImageConstructorAvailable()) {
        return await decodeViaObjectUrl(input, sampleSize)
      }
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_DECODE_FAILED',
        'Failed to decode File or Blob input.',
        { cause },
      )
    }
  }

  if (isImageConstructorAvailable()) {
    return await decodeViaObjectUrl(input, sampleSize)
  }

  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_DECODE_FAILED',
    'No decoding method available for File or Blob input in this environment.',
  )
}
