import { ColorExtractorError } from '../core/errors.js';
import { extractColorFromPixels } from '../core/extract.js';
import type {
    BrowserExtractColorOptions,
    CoreExtractColorOptions,
    ExtractColorResult,
} from '../core/index.js';
import { resolveNeutralOptions } from '../core/neutral-options.js';
import {
    decodeFileOrBlob,
    decodeRemoteUrl,
    sampleCanvasElement,
    sampleImageBitmap,
    sampleImageDataInput,
    sampleImageElement,
} from './decode.js';
import { detectBrowserInputKind } from './detect.js';
import type { BrowserExtractColorInput } from './types.js';

export type {
    AdvancedExtractionOptions,
    BaseExtractColorOptions,
    BrowserDecodeOptions,
    BrowserExtractColorOptions,
    ColorId,
    ExtractColorOptions,
    ExtractColorResult,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionMetadata,
    ExtractionRuntime,
    HslColor,
    LabColor,
    LabKmeansOptions,
    ObservedColor,
    PaletteRankings,
    PerceptualRankingOptions,
    ResultOptions,
    RgbColor,
    SamplingOptions,
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
export type { BrowserExtractColorInput } from './types.js';

export async function extractColor(
    input: BrowserExtractColorInput,
    options?: BrowserExtractColorOptions,
): Promise<ExtractColorResult> {
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

    const coreOptions: CoreExtractColorOptions = {
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

    const result = await extractColorFromPixels(
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

export async function extractColorFromImageData(
    imageData: ImageData,
    options?: BrowserExtractColorOptions,
): Promise<ExtractColorResult> {
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

    const coreOptions: CoreExtractColorOptions = {
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

    const result = await extractColorFromPixels(
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

export { DEFAULT_NEUTRAL_OPTIONS } from '../core/neutral-options.js';
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
