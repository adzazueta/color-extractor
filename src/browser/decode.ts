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
