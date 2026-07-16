import { ColorExtractorError } from '../core/errors.js'
import type { Fetcher } from './fetch.js'
import { assertAllowedProtocol, parseRemoteUrl, type ParsedRemoteUrl } from './security.js'
import { assertPublicHostnameSync } from './security-private.js'
import type { RemoteOptions } from '../core/options.js'

const DEFAULT_MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type ProtocolValidator = (
  href: string,
  allowed?: readonly string[],
) => ParsedRemoteUrl

export type PublicHostValidator = (
  parsed: ParsedRemoteUrl,
  options: Pick<RemoteOptions, 'allowPrivateNetworks'>,
) => void

const defaultProtocolValidator: ProtocolValidator = (href, allowed) =>
  assertAllowedProtocol(href, allowed)
const defaultPublicHostValidator: PublicHostValidator = assertPublicHostnameSync

export interface FollowedRedirectsResult {
  readonly finalUrl: string
  readonly redirectChain: readonly string[]
}

export function parseLocationHeader(
  value: string | null,
  base: string,
): string | null {
  if (!value) return null
  try {
    return new URL(value, base).href
  } catch {
    return null
  }
}

export async function followRedirects(
  startUrl: string,
  options: Partial<Pick<RemoteOptions, 'maxRedirects' | 'allowPrivateNetworks' | 'allowedProtocols'>> = {},
  fetcher: Fetcher,
  validateProtocol: ProtocolValidator = defaultProtocolValidator,
  validatePublicHost: PublicHostValidator = defaultPublicHostValidator,
): Promise<FollowedRedirectsResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `remote.maxRedirects must be a non-negative integer, got ${maxRedirects}`,
      { cause: maxRedirects },
    )
  }

  let currentUrl = startUrl
  const chain: string[] = []
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = validateProtocol(currentUrl, options.allowedProtocols)
    validatePublicHost(parsed, { allowPrivateNetworks: options.allowPrivateNetworks ?? false })

    let response: Response
    try {
      response = await fetcher(parsed.href, { redirect: 'manual' })
    } catch (err) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_FETCH_FAILED',
        `Could not fetch ${parsed.href}: ${(err as Error).message ?? 'unknown'}.`,
        { cause: err },
      )
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { finalUrl: parsed.href, redirectChain: chain }
    }

    if (hop === maxRedirects) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSAFE_URL',
        `Redirect chain exceeded the ${maxRedirects}-hop limit at ${parsed.href}.`,
        { cause: { url: parsed.href, maxRedirects, chain } },
      )
    }

    const location = parseLocationHeader(response.headers.get('location'), parsed.href)
    if (!location) {
      throw new ColorExtractorError(
        'COLOR_EXTRACTOR_UNSAFE_URL',
        `Redirect from ${parsed.href} did not include a valid Location header.`,
        { cause: { url: parsed.href, status: response.status } },
      )
    }

    chain.push(parsed.href)
    currentUrl = location
  }

  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_UNSAFE_URL',
    'Redirect chain ended unexpectedly.',
    { cause: { chain } },
  )
}
