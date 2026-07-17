import { ColorExtractorError } from '../core/errors.js';
import type { RemoteOptions } from '../core/options.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10_000_000;

export type Fetcher = typeof globalThis.fetch;

const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init);

export interface RemoteBufferResult {
    readonly body: Uint8Array;
    readonly contentType: string | null;
}

export class FetchAbortedError extends Error {
    readonly code:
        | 'COLOR_EXTRACTOR_TIMEOUT'
        | 'COLOR_EXTRACTOR_INPUT_TOO_LARGE'
        | 'COLOR_EXTRACTOR_FETCH_FAILED'
        | 'COLOR_EXTRACTOR_UNSAFE_URL';
    constructor(code: FetchAbortedError['code'], message: string) {
        super(message);
        this.name = 'FetchAbortedError';
        this.code = code;
    }
}

function isAbortError(err: unknown): boolean {
    if (err === null || typeof err !== 'object') return false;
    const name = (err as { name?: unknown }).name;
    return name === 'AbortError' || name === 'TimeoutError';
}

function headersToObject(
    headers: HeadersInit | undefined,
): Record<string, string> {
    if (!headers) return {};
    if (headers instanceof Headers) {
        const out: Record<string, string> = {};
        headers.forEach((v, k) => {
            out[k.toLowerCase()] = v;
        });
        return out;
    }
    if (Array.isArray(headers)) {
        const out: Record<string, string> = {};
        for (const [k, v] of headers) {
            out[k.toLowerCase()] = String(v);
        }
        return out;
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        out[k.toLowerCase()] = String(v);
    }
    return out;
}

export async function safeCancelBody(response: Response): Promise<void> {
    if (!response.body) return;
    try {
        await response.body.cancel();
    } catch {
        // best effort
    }
}

export async function fetchRemoteBuffer(
    url: string,
    options: Partial<Pick<RemoteOptions, 'timeoutMs' | 'maxBytes'>> = {},
    fetcher: Fetcher = defaultFetcher,
): Promise<RemoteBufferResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.timeoutMs must be a positive number, got ${timeoutMs}`,
            { cause: timeoutMs },
        );
    }
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.maxBytes must be a positive number, got ${maxBytes}`,
            { cause: maxBytes },
        );
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
        controller.abort(
            new FetchAbortedError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Remote fetch exceeded ${timeoutMs}ms timeout.`,
            ),
        );
    }, timeoutMs);

    let response: Response;
    try {
        response = await fetcher(url, {
            signal: controller.signal,
            redirect: 'manual',
        });
    } catch (err) {
        clearTimeout(timeoutHandle);
        if (isAbortError(err)) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Remote fetch to ${url} exceeded the ${timeoutMs}ms timeout.`,
                { cause: err },
            );
        }
        if (err instanceof FetchAbortedError) {
            throw new ColorExtractorError(err.code, err.message, {
                cause: err,
            });
        }
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Could not fetch ${url}: ${(err as Error).message ?? 'unknown error'}.`,
            { cause: err },
        );
    }

    if (!response.ok) {
        clearTimeout(timeoutHandle);
        const status = response.status;
        const statusText = response.statusText || '';
        if (
            status === 301 ||
            status === 302 ||
            status === 303 ||
            status === 307 ||
            status === 308
        ) {
            await safeCancelBody(response);
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSAFE_URL',
                `Remote URL returned redirect (${status} ${statusText}); redirects must be followed explicitly.`,
                { cause: { url, status, statusText } },
            );
        }
        await safeCancelBody(response);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Remote fetch to ${url} failed with ${status} ${statusText}.`,
            { cause: { url, status, statusText } },
        );
    }

    if (!response.body) {
        clearTimeout(timeoutHandle);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Remote fetch to ${url} returned an empty body.`,
            { cause: { url } },
        );
    }

    const contentLength = Number.parseInt(
        headersToObject(response.headers)['content-length'] ?? '',
        10,
    );
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        clearTimeout(timeoutHandle);
        await safeCancelBody(response);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
            `Remote response from ${url} advertises ${contentLength} bytes which exceeds the ${maxBytes}-byte limit.`,
            { cause: { url, contentLength, maxBytes } },
        );
    }

    const contentType =
        headersToObject(response.headers)['content-type'] ?? null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            received += value.byteLength;
            if (received > maxBytes) {
                controller.abort(
                    new FetchAbortedError(
                        'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                        `Remote response from ${url} exceeded the ${maxBytes}-byte limit while streaming.`,
                    ),
                );
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                    `Remote response from ${url} exceeded the ${maxBytes}-byte limit while streaming.`,
                    { cause: { url, maxBytes, received } },
                );
            }
            chunks.push(value);
        }
    } catch (err) {
        clearTimeout(timeoutHandle);
        if (err instanceof ColorExtractorError) throw err;
        if (isAbortError(err)) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Remote fetch to ${url} aborted.`,
                { cause: err },
            );
        }
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Failed while reading response body from ${url}: ${(err as Error).message ?? 'unknown'}.`,
            { cause: err },
        );
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // already released
        }
    }

    clearTimeout(timeoutHandle);

    const body = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
        body.set(c, offset);
        offset += c.byteLength;
    }

    return { body, contentType };
}
