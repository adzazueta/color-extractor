import { ColorExtractorError } from '../core/errors.js'
import type { Fetcher } from './fetch.js'
import { assertAllowedProtocol, parseRemoteUrl, type ParsedRemoteUrl } from './security.js'
import {
  assertPublicHostname,
  type ResolveHostname,
} from './security-private.js'
import type { RemoteOptions } from '../core/options.js'

const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 10_000
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type ProtocolValidator = (
  href: string,
  allowed?: readonly string[],
) => ParsedRemoteUrl

export interface FollowedRedirectsResult {
  readonly finalUrl: string
  readonly finalResponse: Response
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

export interface FollowRedirectsOptions {
  readonly maxRedirects?: number
  readonly timeoutMs?: number
  readonly allowPrivateNetworks?: boolean
  readonly allowedProtocols?: readonly string[]
  readonly resolveHostname?: ResolveHostname
  readonly fetcher?: Fetcher
}

const noopResolver: ResolveHostname = async (hostname: string) => {
  // Default: treat any unresolvable hostname as blocked (fail closed) when
  // the caller did not provide a real resolver. The Phase 7 wiring will inject
  // node:dns.lookup here.
  void hostname
  throw new ColorExtractorError(
    'COLOR_EXTRACTOR_UNSAFE_URL',
    'Hostname resolution is not configured for the redirect follow path. Pass resolveHostname in tests; production callers must supply a DNS resolver.',
  )
}

export async function followRedirects(
  startUrl: string,
  options: FollowRedirectsOptions,
): Promise<FollowedRedirectsResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `remote.maxRedirects must be a non-negative integer, got ${maxRedirects}`,
      { cause: maxRedirects },
    )
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
      `remote.timeoutMs must be a positive number, got ${timeoutMs}`,
      { cause: timeoutMs },
    )
  }

  const fetcher = options.fetcher
  if (!fetcher) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      'followRedirects requires a fetcher. Pass { fetcher } in production or in tests.',
    )
  }
  const resolver = options.resolveHostname ?? noopResolver

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => {
    controller.abort(
      new ColorExtractorError(
        'COLOR_EXTRACTOR_TIMEOUT',
        `Redirect walk exceeded the ${timeoutMs}ms timeout.`,
      ),
    )
  }, timeoutMs)

  const hostOptions = { allowPrivateNetworks: options.allowPrivateNetworks ?? false }

  try {
    let currentUrl = startUrl
    const chain: string[] = []
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const parsed = options.allowedProtocols
        ? assertAllowedProtocol(currentUrl, options.allowedProtocols)
        : assertAllowedProtocol(currentUrl)
      await assertPublicHostname(parsed, hostOptions, resolver)

      let response: Response
      try {
        response = await fetcher(parsed.href, { signal: controller.signal, redirect: 'manual' })
      } catch (err) {
        if (err instanceof ColorExtractorError) throw err
        if ((err as { name?: string })?.name === 'AbortError') {
          throw new ColorExtractorError(
            'COLOR_EXTRACTOR_TIMEOUT',
            `Redirect walk aborted: ${(err as Error).message ?? 'timeout'}.`,
            { cause: err },
          )
        }
        throw new ColorExtractorError(
          'COLOR_EXTRACTOR_FETCH_FAILED',
          `Could not fetch ${parsed.href}: ${(err as Error).message ?? 'unknown'}.`,
          { cause: err },
        )
      }

      if (!REDIRECT_STATUSES.has(response.status)) {
        return { finalUrl: parsed.href, finalResponse: response, redirectChain: chain }
      }

      if (hop === maxRedirects) {
        await safeCancelBody(response)
        throw new ColorExtractorError(
          'COLOR_EXTRACTOR_UNSAFE_URL',
          `Redirect chain exceeded the ${maxRedirects}-hop limit at ${parsed.href}.`,
          { cause: { url: parsed.href, maxRedirects, chain } },
        )
      }

      const location = parseLocationHeader(response.headers.get('location'), parsed.href)
      if (!location) {
        await safeCancelBody(response)
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
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export async function safeCancelBody(response: Response): Promise<void> {
  if (!response.body) return
  try {
    await response.body.cancel()
  } catch {
    // best effort
  }
}
