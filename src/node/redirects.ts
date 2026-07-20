import { ColorExtractorError } from '../core/errors.js';
import { safeCancelBody } from './fetch.js';
import { defaultResolveAndFetch, type ResolveAndFetch } from './http-client.js';
import { assertAllowedProtocol, type ParsedRemoteUrl } from './security.js';

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type ProtocolValidator = (
    href: string,
    allowed?: readonly string[],
) => ParsedRemoteUrl;

export interface FollowedRedirectsResult {
    readonly finalUrl: string;
    readonly finalResponse: Response;
    readonly redirectChain: readonly string[];
}

export function parseLocationHeader(
    value: string | null,
    base: string,
): string | null {
    if (!value) return null;
    try {
        return new URL(value, base).href;
    } catch {
        return null;
    }
}

export interface FollowRedirectsOptions {
    readonly maxRedirects?: number;
    readonly timeoutMs?: number;
    readonly allowPrivateNetworks?: boolean;
    readonly allowedProtocols?: readonly string[];
    readonly resolveAndFetch?: ResolveAndFetch;
    readonly signal?: AbortSignal;
}

export async function followRedirects(
    startUrl: string,
    options: FollowRedirectsOptions,
): Promise<FollowedRedirectsResult> {
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.maxRedirects must be a non-negative integer, got ${maxRedirects}`,
            { cause: maxRedirects },
        );
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.timeoutMs must be a positive number, got ${timeoutMs}`,
            { cause: timeoutMs },
        );
    }

    const resolveAndFetch = options.resolveAndFetch ?? defaultResolveAndFetch;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
        controller.abort(
            new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Redirect walk exceeded the ${timeoutMs}ms timeout.`,
            ),
        );
    }, timeoutMs);

    let onExternalAbort: (() => void) | null = null;
    if (options.signal) {
        if (options.signal.aborted) {
            clearTimeout(timeoutHandle);
            controller.abort(options.signal.reason);
        } else {
            onExternalAbort = () => {
                clearTimeout(timeoutHandle);
                controller.abort(options.signal!.reason);
            };
            options.signal.addEventListener('abort', onExternalAbort, {
                once: true,
            });
        }
    }

    try {
        let currentUrl = startUrl;
        const chain: string[] = [];
        for (let hop = 0; hop <= maxRedirects; hop++) {
            if (options.signal?.aborted) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_ABORTED',
                    'Operation was aborted during redirect walk.',
                    { cause: options.signal.reason },
                );
            }

            const parsed = options.allowedProtocols
                ? assertAllowedProtocol(currentUrl, options.allowedProtocols)
                : assertAllowedProtocol(currentUrl);

            let response: Response;
            try {
                response = await resolveAndFetch(
                    parsed.href,
                    controller.signal,
                    {
                        allowPrivateNetworks: options.allowPrivateNetworks,
                    },
                );
            } catch (err) {
                if (options.signal?.aborted) {
                    throw new ColorExtractorError(
                        'COLOR_EXTRACTOR_ABORTED',
                        'Operation was aborted during redirect fetch.',
                        { cause: options.signal.reason },
                    );
                }
                if (err instanceof ColorExtractorError) throw err;
                if ((err as { name?: string })?.name === 'AbortError') {
                    throw new ColorExtractorError(
                        'COLOR_EXTRACTOR_TIMEOUT',
                        `Redirect walk aborted: ${(err as Error).message ?? 'timeout'}.`,
                        { cause: err },
                    );
                }
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_FETCH_FAILED',
                    `Could not fetch ${parsed.href}: ${(err as Error).message ?? 'unknown'}.`,
                    { cause: err },
                );
            }

            if (!REDIRECT_STATUSES.has(response.status)) {
                return {
                    finalUrl: parsed.href,
                    finalResponse: response,
                    redirectChain: chain,
                };
            }

            if (hop === maxRedirects) {
                await safeCancelBody(response);
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_UNSAFE_URL',
                    `Redirect chain exceeded the ${maxRedirects}-hop limit at ${parsed.href}.`,
                    { cause: { url: parsed.href, maxRedirects, chain } },
                );
            }

            const location = parseLocationHeader(
                response.headers.get('location'),
                parsed.href,
            );
            if (!location) {
                await safeCancelBody(response);
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_UNSAFE_URL',
                    `Redirect from ${parsed.href} did not include a valid Location header.`,
                    { cause: { url: parsed.href, status: response.status } },
                );
            }

            await safeCancelBody(response);
            chain.push(parsed.href);
            currentUrl = location;
        }

        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSAFE_URL',
            'Redirect chain ended unexpectedly.',
            { cause: { chain } },
        );
    } finally {
        clearTimeout(timeoutHandle);
        if (onExternalAbort) {
            options.signal?.removeEventListener('abort', onExternalAbort);
        }
    }
}
