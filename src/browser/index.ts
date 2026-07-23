import { resolveOptions } from '../core/defaults.js';
import { ColorExtractorError } from '../core/errors.js';
import {
    extractColorsFromPixels,
    extractPaletteFromPixels,
} from '../core/extract.js';
import type {
    BrowserExtractPaletteOptions,
    CoreExtractPaletteOptions,
    ExtractPaletteResult,
} from '../core/index.js';
import { resolveNeutralOptions } from '../core/neutral-options.js';
import type { ExtractColorsOptions } from '../core/options.js';
import type { ExtractColorsResult } from '../core/result.js';
import {
    decodeFileOrBlob,
    decodeRemoteUrl,
    sampleCanvasElement,
    sampleImageBitmap,
    sampleImageDataInput,
    sampleImageElement,
} from './decode.js';
import type { BrowserInputKind } from './detect.js';
import { detectBrowserInputKind } from './detect.js';
import type { BrowserExtractColorsInput } from './types.js';

export type BrowserExtractPaletteInput = BrowserExtractColorsInput;

export type {
    AdvancedExtractionOptions,
    AnimatedHandling,
    BaseExtractPaletteOptions,
    BrowserDecodeOptions,
    BrowserExtractPaletteOptions,
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
export type { BrowserExtractColorsInput } from './types.js';

function decoderForKind(kind: BrowserInputKind): 'canvas' | 'image-data' {
    return kind === 'imageData' ? 'image-data' : 'canvas';
}

function overrideMetadata(
    result: ExtractColorsResult,
    kind: BrowserInputKind,
): ExtractColorsResult {
    if (!result.metadata) return result;
    return {
        ...result,
        metadata: {
            ...result.metadata,
            runtime: 'browser',
            decoder: decoderForKind(kind),
        },
    };
}

/** @deprecated Use `extractPalette` instead. Semantic role extraction moved out of the extractor in 0.2.0. See the migration guide in the README. Will be removed in 0.4.0. */
export async function extractColors(
    input: BrowserExtractColorsInput,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
    try {
        const resolved = resolveOptions(options);
        const kind = detectBrowserInputKind(input);
        const maxPixels = resolved.decode.maxPixels ?? 25_000_000;
        const timeoutMs = resolved.remote.timeoutMs ?? 10_000;
        const maxBytes = resolved.remote.maxBytes ?? 10_000_000;

        if (kind === 'file' || kind === 'blob') {
            const decoded = await decodeFileOrBlob(
                input as File | Blob,
                resolved.sampleSize,
                maxPixels,
            );
            const result = await extractColorsFromPixels(
                {
                    data: decoded.data,
                    width: decoded.width,
                    height: decoded.height,
                },
                options,
            );
            return overrideMetadata(result, kind);
        }

        if (kind === 'image') {
            const decoded = sampleImageElement(
                input as HTMLImageElement,
                resolved.sampleSize,
                maxPixels,
            );
            const result = await extractColorsFromPixels(
                {
                    data: decoded.data,
                    width: decoded.width,
                    height: decoded.height,
                },
                options,
            );
            return overrideMetadata(result, kind);
        }

        if (kind === 'bitmap') {
            const decoded = sampleImageBitmap(
                input as ImageBitmap,
                resolved.sampleSize,
                maxPixels,
            );
            const result = await extractColorsFromPixels(
                {
                    data: decoded.data,
                    width: decoded.width,
                    height: decoded.height,
                },
                options,
            );
            return overrideMetadata(result, kind);
        }

        if (kind === 'canvas') {
            const decoded = sampleCanvasElement(
                input as HTMLCanvasElement,
                resolved.sampleSize,
                maxPixels,
            );
            const result = await extractColorsFromPixels(
                {
                    data: decoded.data,
                    width: decoded.width,
                    height: decoded.height,
                },
                options,
            );
            return overrideMetadata(result, kind);
        }

        if (kind === 'imageData') {
            const decoded = sampleImageDataInput(
                input as ImageData,
                resolved.sampleSize,
                maxPixels,
            );
            const result = await extractColorsFromPixels(
                {
                    data: decoded.data,
                    width: decoded.width,
                    height: decoded.height,
                },
                options,
            );
            return overrideMetadata(result, kind);
        }

        if (kind === 'url') {
            const decoded = await decodeRemoteUrl(
                input as string,
                resolved.sampleSize,
                maxPixels,
                timeoutMs,
                maxBytes,
            );
            const result = await extractColorsFromPixels(
                {
                    data: decoded.data,
                    width: decoded.width,
                    height: decoded.height,
                },
                options,
            );
            return overrideMetadata(result, kind);
        }

        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `Browser input kind '${kind}' is not yet supported.`,
            { cause: input },
        );
    } catch (cause) {
        if (cause instanceof ColorExtractorError) {
            throw cause;
        }
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'Unexpected error during color extraction.',
            { cause },
        );
    }
}

export async function extractPalette(
    input: BrowserExtractPaletteInput,
    options?: BrowserExtractPaletteOptions,
): Promise<ExtractPaletteResult> {
    const resolved = resolveNeutralOptions(options, 'browser');
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

    const kind = detectBrowserInputKind(input);
    const { maxDimension } = resolved.sampling;
    const { maxPixels } = resolved.decode;

    let decoded: {
        data: Uint8Array;
        width: number;
        height: number;
        channels: 4;
    };

    if (kind === 'file' || kind === 'blob') {
        decoded = await decodeFileOrBlob(
            input as File | Blob,
            maxDimension,
            maxPixels,
            signal,
            false,
        );
    } else if (kind === 'image') {
        decoded = sampleImageElement(
            input as HTMLImageElement,
            maxDimension,
            maxPixels,
            false,
        );
    } else if (kind === 'bitmap') {
        decoded = sampleImageBitmap(
            input as ImageBitmap,
            maxDimension,
            maxPixels,
            false,
        );
    } else if (kind === 'canvas') {
        decoded = sampleCanvasElement(
            input as HTMLCanvasElement,
            maxDimension,
            maxPixels,
            false,
        );
    } else if (kind === 'imageData') {
        decoded = sampleImageDataInput(
            input as ImageData,
            maxDimension,
            maxPixels,
            false,
        );
    } else if (kind === 'url') {
        decoded = await decodeRemoteUrl(
            input as string,
            maxDimension,
            maxPixels,
            10_000,
            10_000_000,
            signal,
            false,
        );
    } else {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `Browser input kind '${kind}' is not yet supported.`,
            { cause: input },
        );
    }

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
            data: decoded.data,
            width: decoded.width,
            height: decoded.height,
            channels: decoded.channels,
        },
        coreOptions,
    );

    return {
        ...result,
        metadata: {
            ...result.metadata,
            runtime: 'browser' as const,
            decoder:
                kind === 'imageData'
                    ? ('image-data' as const)
                    : ('canvas' as const),
        },
    };
}

export async function extractPaletteFromImageData(
    imageData: ImageData,
    options?: BrowserExtractPaletteOptions,
): Promise<ExtractPaletteResult> {
    if (imageData === null || imageData === undefined) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'ImageData input is required.',
            { cause: imageData },
        );
    }

    const resolved = resolveNeutralOptions(options, 'browser');
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

    const decoded = sampleImageDataInput(
        imageData,
        resolved.sampling.maxDimension,
        resolved.decode.maxPixels,
        false,
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
            data: decoded.data,
            width: decoded.width,
            height: decoded.height,
            channels: decoded.channels,
        },
        coreOptions,
    );

    return {
        ...result,
        metadata: {
            ...result.metadata,
            runtime: 'browser' as const,
            decoder: 'image-data' as const,
        },
    };
}

export type { DecodedPixels } from './decode.js';
export {
    decodeFileOrBlob,
    decodeRemoteUrl,
    sampleCanvasElement,
    sampleImageBitmap,
    sampleImageDataInput,
    sampleImageElement,
} from './decode.js';
export { type BrowserInputKind, detectBrowserInputKind } from './detect.js';
