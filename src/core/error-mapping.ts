import { ColorExtractorError } from './errors.js'
import type { ColorExtractorErrorCode } from './errors.js'

interface MappingContext {
  readonly operation: string
  readonly url?: string
  readonly cause?: unknown
}

interface MappingResult {
  readonly code: ColorExtractorErrorCode
  readonly message: string
}

const TIMEOUT_PATTERNS: readonly RegExp[] = [
  /timeout/i,
  /aborted/i,
  /timed out/i,
  /AbortError/,
  /TimeoutError/,
]

const FETCH_PATTERNS: readonly RegExp[] = [
  /ENOTFOUND/,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /EAI_AGAIN/,
  /EHOSTUNREACH/,
  /ENETUNREACH/,
  /fetch failed/i,
  /network/i,
  /dns/i,
  /ENETDOWN/,
]

const DECODE_PATTERNS: readonly RegExp[] = [
  /unsupported/i,
  /decode/i,
  /corrupt/i,
  /Sharp/,
  /sharp/,
]

const UNSAFE_URL_PATTERNS: readonly RegExp[] = [
  /protocol/i,
  /private network/i,
  /redirect chain/i,
  /SSRF/i,
  /Unsafe URL/i,
]

function matchAny(haystack: string, patterns: readonly RegExp[]): boolean {
  for (const p of patterns) {
    if (p.test(haystack)) return true
  }
  return false
}

function detectCode(message: string, fallback: ColorExtractorErrorCode): ColorExtractorErrorCode {
  if (matchAny(message, TIMEOUT_PATTERNS)) return 'COLOR_EXTRACTOR_TIMEOUT'
  if (matchAny(message, UNSAFE_URL_PATTERNS)) return 'COLOR_EXTRACTOR_UNSAFE_URL'
  if (matchAny(message, FETCH_PATTERNS)) return 'COLOR_EXTRACTOR_FETCH_FAILED'
  if (matchAny(message, DECODE_PATTERNS)) return 'COLOR_EXTRACTOR_DECODE_FAILED'
  return fallback
}

export function toColorExtractorError(
  err: unknown,
  context: MappingContext,
  fallback: ColorExtractorErrorCode = 'COLOR_EXTRACTOR_DECODE_FAILED',
): ColorExtractorError {
  if (err instanceof ColorExtractorError) return err
  let rawMessage: string
  if (err instanceof Error) {
    rawMessage = err.message
  } else if (err === null || err === undefined) {
    rawMessage = 'unknown error'
  } else {
    rawMessage = String(err)
  }
  const code = detectCode(rawMessage, fallback)
  const prefix = context.url ? `${context.operation} of ${context.url}` : context.operation
  const message = `${prefix} failed: ${rawMessage}.`
  return new ColorExtractorError(code, message, { cause: err })
}

export function detectErrorCode(
  err: unknown,
  fallback: ColorExtractorErrorCode = 'COLOR_EXTRACTOR_DECODE_FAILED',
): ColorExtractorErrorCode {
  if (err instanceof ColorExtractorError) return err.code
  const rawMessage = err instanceof Error ? err.message : String(err)
  return detectCode(rawMessage, fallback)
}
