import { ColorExtractorError } from '../core/errors.js'
import type { SvgHandling } from '../core/options.js'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
  'image/bmp',
  'image/x-icon',
])

function normalizeContentType(contentType: string): string {
  const semi = contentType.indexOf(';')
  return (semi >= 0 ? contentType.slice(0, semi) : contentType).trim().toLowerCase()
}

export function validateContentType(
  contentType: string | null | undefined,
  options: { validateContentType: boolean; svg: SvgHandling },
): void {
  if (!options.validateContentType) return
  if (!contentType) return

  const normalized = normalizeContentType(contentType)

  if (normalized === 'image/svg+xml') {
    const svgDisabled = options.svg === 'disabled-in-node' || options.svg === 'disabled'
    if (svgDisabled) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
        'SVG content type is not supported in Node by default. Set decode.svg to "enabled-in-node" to allow SVG.',
        { cause: { contentType: normalized, svg: options.svg } },
      )
    }
    return
  }

  if (!ALLOWED_IMAGE_TYPES.has(normalized)) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
      `Unsupported content type: ${normalized}. Allowed types: ${[...ALLOWED_IMAGE_TYPES].join(', ')}.`,
      { cause: { contentType: normalized } },
    )
  }
}
