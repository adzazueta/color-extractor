import { type ResolvedOptions, resolveOptions } from '../core/defaults.js';
import { ColorExtractorError, checkAborted } from '../core/errors.js';
import {
    extractPaletteFromPixels,
    runExtractionPipeline,
} from '../core/extract.js';
import type {
    CoreExtractPaletteOptions,
    ExtractPaletteResult,
    NodeExtractPaletteOptions,
    ResolvedNodeExtractPaletteOptions,
} from '../core/index.js';
import { resolveNeutralOptions } from '../core/neutral-options.js';
import type { ExtractColorsOptions } from '../core/options.js';
import type { ExtractColorsResult } from '../core/result.js';
import { validateContentType } from './content-type.js';
import { decodeBufferToPixels } from './decode.js';
import { detectNodeInputKind } from './detect.js';
import { safeCancelBody } from './fetch.js';
import { defaultResolveAndFetch } from './http-client.js';
import { loadLocalPath } from './load.js';
import { followRedirects } from './redirects.js';
import type { NodeExtractColorsInput } from './types.js';

export type NodeExtractPaletteInput = NodeExtractColorsInput;

export type {
    AdvancedExtractionOptions,
    AnimatedHandling,
    BaseExtractPaletteOptions,
    ColorRole,
    ColorSource,
    DecodeOptions,
    ExtractColorsOptions,
    ExtractColorsResult,
    ExtractedColor,
    ExtractedSwatch,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionMetadata,
    ExtractionRuntime,
    ExtractPaletteOptions,
    ExtractPaletteResult,
    FilteringOptions,
    HSL,
    HslColor,
    KmeansOptions,
    Lab,
    LabColor,
    LabKmeansOptions,
    LightnessOptions,
    MinimalExtractColorsResult,
    NodeDecodeOptions,
    NodeExtractPaletteOptions,
    NodeRemoteOptions,
    OutputOptions,
    PaletteRankings,
    PaletteResultOptions,
    PerceptualRankingOptions,
    PrimaryOptions,
    PrimaryPreset,
    RemoteOptions,
    RGB,
    RgbColor,
    SamplingOptions,
    ScoringOptions,
    SecondaryFallbackMode,
    SecondaryOptions,
    SvgHandling,
    SwatchId,
} from '../core/index.js';
export {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
    type ColorExtractorErrorCode,
    DEFAULT_OPTIONS,
    type ResolvedOptions,
    resolveOptions,
} from '../core/index.js';
export { VERSION } from '../generated/version.js';
export type { NodeExtractColorsInput } from './types.js';

/** @deprecated Use `extractPalette` instead. Semantic role extraction moved out of the extractor in 0.2.0. See the migration guide in the README. Will be removed in 0.3.0. */
export async function extractColors(
    input: NodeExtractColorsInput,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
    const resolved = resolveOptions(options);

    let bytes: Buffer | Uint8Array;
    const kind = detectNodeInputKind(input);
    switch (kind) {
        case 'buffer':
            bytes = input as Buffer;
            break;
        case 'bytes':
            bytes = input as Uint8Array;
            break;
        case 'arrayBuffer':
            bytes = new Uint8Array(input as ArrayBuffer);
            break;
        case 'localPath':
            bytes = await loadLocalPath(
                input as string,
                resolved.remote.maxBytes!,
            );
            break;
        case 'remoteUrl':
            bytes = await fetchRemoteWithPipeline(input as string, resolved);
            break;
        default:
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                'Node input must be a Buffer, Uint8Array, ArrayBuffer, http(s) URL string, or local path string.',
                { cause: input },
            );
    }

    const pixels = await decodeBufferToPixels(bytes, resolved.sampleSize, {
        respectOrientation: resolved.decode.respectOrientation,
        maxPixels: resolved.decode.maxPixels,
        svg: resolved.decode.svg,
        animated: resolved.decode.animated,
        normalizeColorProfile: resolved.decode.normalizeColorProfile,
    });

    const result = runExtractionPipeline(
        { data: pixels.data, width: pixels.width, height: pixels.height },
        options,
    );

    // Override metadata for Node adapter
    if (result.metadata) {
        return {
            ...result,
            metadata: {
                ...result.metadata,
                runtime: 'node',
                decoder: 'sharp',
            },
        };
    }
    return result;
}

export async function extractPalette(
    input: NodeExtractPaletteInput,
    options?: NodeExtractPaletteOptions,
): Promise<ExtractPaletteResult> {
    const resolved = resolveNeutralOptions(options, 'node');
    const signal = Object.hasOwn(
        (options ?? {}) as Record<string, unknown>,
        'signal',
    )
        ? options?.signal
        : undefined;

    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'Operation was aborted before it could start.',
            { cause: signal.reason },
        );
    }

    const { maxDimension } = resolved.sampling;

    let bytes: Buffer | Uint8Array;
    const kind = detectNodeInputKind(input);
    switch (kind) {
        case 'buffer':
            bytes = input as Buffer;
            break;
        case 'bytes':
            bytes = input as Uint8Array;
            break;
        case 'arrayBuffer':
            bytes = new Uint8Array(input as ArrayBuffer);
            break;
        case 'localPath':
            bytes = await loadLocalPath(
                input as string,
                resolved.remote.maxBytes,
                signal,
            );
            break;
        case 'remoteUrl':
            bytes = await fetchRemoteForPalette(
                input as string,
                resolved,
                signal,
            );
            break;
        default:
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                'Node input must be a Buffer, Uint8Array, ArrayBuffer, http(s) URL string, or local path string.',
                { cause: input },
            );
    }

    const pixels = await decodeBufferToPixels(
        bytes,
        maxDimension,
        {
            respectOrientation: resolved.decode.respectOrientation,
            maxPixels: resolved.decode.maxPixels,
            svg: resolved.decode.svg,
            animated: resolved.decode.animated,
            normalizeColorProfile: resolved.decode.normalizeColorProfile,
        },
        signal,
        'nearest',
    );

    const coreOptions: CoreExtractPaletteOptions = {
        algorithm: resolved.algorithm,
        sampling: resolved.sampling,
        filtering: resolved.filtering,
        result: resolved.result,
        advanced: {
            ...(resolved.algorithm === 'lab-kmeans'
                ? { labKmeans: resolved.advanced.labKmeans }
                : { mmcq: resolved.advanced.mmcq }),
            perceptualRanking: resolved.advanced.perceptualRanking,
        },
        signal,
    };

    const result = await extractPaletteFromPixels(
        {
            data: pixels.data,
            width: pixels.width,
            height: pixels.height,
            channels: 4,
        },
        coreOptions,
    );

    return {
        ...result,
        metadata: {
            ...result.metadata,
            runtime: 'node' as const,
            decoder: 'sharp' as const,
        },
    };
}

async function fetchRemoteForPalette(
    href: string,
    resolved: ResolvedNodeExtractPaletteOptions,
    signal?: AbortSignal,
): Promise<Buffer | Uint8Array> {
    const {
        timeoutMs,
        maxBytes,
        maxRedirects,
        allowPrivateNetworks,
        allowedProtocols,
        validateContentType: validateContentTypeFlag,
    } = resolved.remote;

    const { finalUrl, finalResponse } = await followRedirects(href, {
        maxRedirects,
        timeoutMs,
        allowPrivateNetworks,
        allowedProtocols,
        resolveAndFetch: (url, fetchSignal, hostOptions) =>
            defaultResolveAndFetch(url, fetchSignal, hostOptions),
        signal,
    });

    if (!finalResponse.ok) {
        await safeCancelBody(finalResponse);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Remote URL (${finalUrl}) returned HTTP ${finalResponse.status} ${finalResponse.statusText}.`,
            {
                cause: {
                    url: finalUrl,
                    status: finalResponse.status,
                    statusText: finalResponse.statusText,
                },
            },
        );
    }

    const contentType = finalResponse.headers.get('content-type');
    try {
        validateContentType(contentType, {
            validateContentType: validateContentTypeFlag,
            svg:
                resolved.decode.svg === 'enabled'
                    ? 'enabled'
                    : 'disabled-in-node',
        });
    } catch (err) {
        await safeCancelBody(finalResponse);
        throw err;
    }

    if (signal?.aborted) {
        await safeCancelBody(finalResponse);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'Operation was aborted during remote fetch.',
            { cause: signal.reason },
        );
    }

    const reader = finalResponse.body?.getReader();
    if (!reader) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Remote URL (${finalUrl}) returned an empty body.`,
            { cause: { url: finalUrl } },
        );
    }

    const bodyController = new AbortController();
    const bodyTimeout = setTimeout(() => {
        bodyController.abort(
            new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Body read from ${finalUrl} exceeded the ${timeoutMs}ms timeout.`,
                { cause: { url: finalUrl, timeoutMs } },
            ),
        );
        reader.cancel().catch(() => {});
    }, timeoutMs);

    let onExternalAbort: (() => void) | null = null;
    if (signal) {
        onExternalAbort = () => {
            clearTimeout(bodyTimeout);
            bodyController.abort(signal.reason);
            reader.cancel().catch(() => {});
        };
        signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
            checkAborted(signal);

            let result: ReadableStreamReadResult<Uint8Array>;
            try {
                result = await reader.read();
            } catch (err) {
                if (err instanceof ColorExtractorError) throw err;
                if (signal?.aborted) {
                    throw new ColorExtractorError(
                        'COLOR_EXTRACTOR_ABORTED',
                        'Operation was aborted while reading response body.',
                        { cause: signal.reason },
                    );
                }
                if (bodyController.signal.aborted) {
                    const reason = bodyController.signal.reason;
                    if (reason instanceof ColorExtractorError) throw reason;
                }
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_FETCH_FAILED',
                    `Failed to read response body from ${finalUrl}.`,
                    { cause: err },
                );
            }
            if (bodyController.signal.aborted) {
                if (signal?.aborted) {
                    throw new ColorExtractorError(
                        'COLOR_EXTRACTOR_ABORTED',
                        'Operation was aborted while reading response body.',
                        { cause: signal.reason },
                    );
                }
                const reason = bodyController.signal.reason;
                if (reason instanceof ColorExtractorError) throw reason;
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_TIMEOUT',
                    `Body read from ${finalUrl} exceeded the ${timeoutMs}ms timeout.`,
                );
            }
            if (result.done) break;
            if (!result.value) continue;

            received += result.value.byteLength;
            if (received > maxBytes) {
                reader.cancel();
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                    `Remote response from ${finalUrl} exceeded the ${maxBytes}-byte limit while streaming.`,
                    { cause: { url: finalUrl, maxBytes, received } },
                );
            }

            chunks.push(result.value);
        }

        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        return merged;
    } finally {
        clearTimeout(bodyTimeout);
        if (onExternalAbort) {
            signal?.removeEventListener('abort', onExternalAbort);
        }
        try {
            reader.releaseLock();
        } catch {
            // Reader lock may already be released if stream was cancelled
        }
    }
}

async function fetchRemoteWithPipeline(
    href: string,
    resolved: ResolvedOptions,
): Promise<Buffer | Uint8Array> {
    const timeoutMs = resolved.remote.timeoutMs ?? 10_000;

    // 1. Follow redirects with security validation to get the final URL and response
    const { finalUrl, finalResponse } = await followRedirects(href, {
        maxRedirects: resolved.remote.maxRedirects,
        timeoutMs,
        allowPrivateNetworks: resolved.remote.allowPrivateNetworks,
        allowedProtocols: resolved.remote.allowedProtocols,
        resolveAndFetch: (url, signal, hostOptions) =>
            defaultResolveAndFetch(url, signal, hostOptions),
    });

    // 1b. Reject non-2xx responses
    if (!finalResponse.ok) {
        await safeCancelBody(finalResponse);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Remote URL (${finalUrl}) returned HTTP ${finalResponse.status} ${finalResponse.statusText}.`,
            {
                cause: {
                    url: finalUrl,
                    status: finalResponse.status,
                    statusText: finalResponse.statusText,
                },
            },
        );
    }

    // 2. Validate content type — cancel body before throwing
    const contentType = finalResponse.headers.get('content-type');
    try {
        validateContentType(contentType, {
            validateContentType: resolved.remote.validateContentType ?? true,
            svg: resolved.decode.svg ?? 'disabled-in-node',
        });
    } catch (err) {
        await safeCancelBody(finalResponse);
        throw err;
    }

    // 3. Read response body with maxBytes enforcement and timeout
    const maxBytes = resolved.remote.maxBytes ?? 10_000_000;
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        await safeCancelBody(finalResponse);
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.maxBytes must be a positive finite number, got ${maxBytes}`,
            { cause: maxBytes },
        );
    }

    const reader = finalResponse.body?.getReader();
    if (!reader) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_FETCH_FAILED',
            `Remote URL (${finalUrl}) returned an empty body.`,
            { cause: { url: finalUrl } },
        );
    }

    const bodyController = new AbortController();
    const bodyTimeout = setTimeout(() => {
        bodyController.abort();
        reader.cancel().catch(() => {});
    }, timeoutMs);

    try {
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (bodyController.signal.aborted) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_TIMEOUT',
                    `Body read from ${finalUrl} exceeded the ${timeoutMs}ms timeout.`,
                    { cause: { url: finalUrl, timeoutMs } },
                );
            }
            if (done) break;
            if (!value) continue;

            received += value.byteLength;
            if (received > maxBytes) {
                reader.cancel();
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                    `Remote response from ${finalUrl} exceeded the ${maxBytes}-byte limit while streaming.`,
                    { cause: { url: finalUrl, maxBytes, received } },
                );
            }

            chunks.push(value);
        }

        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        return merged;
    } finally {
        clearTimeout(bodyTimeout);
        try {
            reader.releaseLock();
        } catch {
            // Reader lock may already be released if stream was cancelled
        }
    }
}

export { DEFAULT_NEUTRAL_OPTIONS } from '../core/neutral-options.js';
