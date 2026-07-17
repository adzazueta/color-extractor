import { ColorExtractorError } from '../core/errors.js'

export type BrowserInputKind =
  | 'file'
  | 'blob'
  | 'url'
  | 'imageData'
  | 'canvas'
  | 'image'
  | 'bitmap'
  | 'unsupported'

function isFile(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function isImageData(value: unknown): value is ImageData {
  return typeof ImageData !== 'undefined' && value instanceof ImageData
}

function isCanvas(value: unknown): value is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement
}

function isImage(value: unknown): value is HTMLImageElement {
  return typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement
}

function isBitmap(value: unknown): value is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

export function detectBrowserInputKind(input: unknown): BrowserInputKind {
  if (input === null || input === undefined) {
    return 'unsupported'
  }

  if (isFile(input)) {
    return 'file'
  }

  if (isBlob(input)) {
    return 'blob'
  }

  if (isImageData(input)) {
    return 'imageData'
  }

  if (isCanvas(input)) {
    return 'canvas'
  }

  if (isImage(input)) {
    return 'image'
  }

  if (isBitmap(input)) {
    return 'bitmap'
  }

  if (typeof input === 'string') {
    if (isHttpUrl(input)) {
      return 'url'
    }
    return 'unsupported'
  }

  return 'unsupported'
}

export function assertSupportedBrowserInput(
  input: unknown,
): asserts input is NonNullable<unknown> {
  const kind = detectBrowserInputKind(input)
  if (kind === 'unsupported') {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      'Browser input must be a File, Blob, URL string, ImageData, HTMLCanvasElement, HTMLImageElement, or ImageBitmap.',
      { cause: input },
    )
  }
}
