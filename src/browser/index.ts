import { resolveOptions } from '../core/defaults.js';
import { ColorExtractorError } from '../core/errors.js';
import {
    extractColorsFromPixels,
    extractPaletteFromPixels,
} from '../core/extract.js';
import type {
    BrowserExtractPaletteOptions,
    ExtractPaletteResult,
} from '../core/index.js';
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

function resolveBrowserDecodeOptions(
    options: BrowserExtractPaletteOptions | undefined,
): { maxDimension: number; maxPixels: number } {
    const sampling = options?.sampling;
    const maxDimension = sampling?.maxDimension ?? 150;
    const decode = (options as Record<string, unknown>)?.decode as
        | Record<string, unknown>
        | undefined;
    const maxPixels = (decode?.maxPixels as number | undefined) ?? 25_000_000;
    if (!Number.isInteger(maxDimension) || maxDimension < 1) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_INVALID_OPTIONS',
            'sampling.maxDimension must be a positive integer.',
            { cause: maxDimension },
        );
    }
    if (!Number.isFinite(maxPixels) || maxPixels <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_INVALID_OPTIONS',
            'decode.maxPixels must be a positive finite number.',
            { cause: maxPixels },
        );
    }
    return { maxDimension, maxPixels };
}

export async function extractPalette(
    input: BrowserExtractPaletteInput,
    options?: BrowserExtractPaletteOptions,
): Promise<ExtractPaletteResult> {
    const kind = detectBrowserInputKind(input);
    const { maxDimension, maxPixels } = resolveBrowserDecodeOptions(options);

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
        );
    } else if (kind === 'image') {
        decoded = sampleImageElement(
            input as HTMLImageElement,
            maxDimension,
            maxPixels,
        );
    } else if (kind === 'bitmap') {
        decoded = sampleImageBitmap(
            input as ImageBitmap,
            maxDimension,
            maxPixels,
        );
    } else if (kind === 'canvas') {
        decoded = sampleCanvasElement(
            input as HTMLCanvasElement,
            maxDimension,
            maxPixels,
        );
    } else if (kind === 'imageData') {
        decoded = sampleImageDataInput(
            input as ImageData,
            maxDimension,
            maxPixels,
        );
    } else if (kind === 'url') {
        decoded = await decodeRemoteUrl(
            input as string,
            maxDimension,
            maxPixels,
            10_000,
            10_000_000,
        );
    } else {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `Browser input kind '${kind}' is not yet supported.`,
            { cause: input },
        );
    }

    const result = await extractPaletteFromPixels(
        {
            data: decoded.data,
            width: decoded.width,
            height: decoded.height,
            channels: decoded.channels,
        },
        options,
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

    const result = await extractPaletteFromPixels(
        {
            data: new Uint8Array(
                imageData.data.buffer,
                imageData.data.byteOffset,
                imageData.data.byteLength,
            ),
            width: imageData.width,
            height: imageData.height,
            channels: 4 as const,
        },
        options,
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
