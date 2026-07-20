import { VERSION } from '../generated/version.js';
import { runLabKmeans } from './algorithms/lab-kmeans/run.js';
import { labSquaredDistance } from './color/lab.js';
import { resolveOptions } from './defaults.js';
import { ColorExtractorError } from './errors.js';
import { passesFilter } from './filter.js';
import { candidatesToClusters } from './legacy/adapter.js';
import { normalizePalette } from './neutral/normalize.js';
import type {
    CoreExtractPaletteOptions,
    ResolvedCoreExtractPaletteOptions,
} from './neutral-options.js';
import { resolveNeutralOptions } from './neutral-options.js';
import type { ExtractColorsOptions } from './options.js';
import { applyOutputFlags, type FullExtractionResult } from './output.js';
import type { ExtractPaletteResult } from './palette-types.js';
import { normalizePixels } from './pixels.js';
import type { ExtractColorsResult, ExtractionMetadata } from './result.js';
import {
    applyLightnessGap,
    buildPalette,
    buildPrimaryColor,
    findPrimaryIndex,
    scoreSecondary,
    selectSecondary,
} from './role.js';
import { convertRgbSamplesToLab, sampleSquareGrid } from './sample.js';
import type { ExtractedColor } from './types.js';
import type { PixelInput } from './validation.js';
import { validateCoreInput } from './validation.js';

export interface ImageDataLike {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}

export type PalettePixelInput = {
    readonly data: Uint8Array | Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly channels: 3 | 4;
};

const NEUTRAL_ALGORITHM_VERSION = '1.0.0';

function validatePalettePixelInput(
    input: unknown,
): asserts input is PalettePixelInput {
    if (input === null || typeof input !== 'object') {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'Input must be a pixel object with data, width, height, and channels.',
            { cause: input },
        );
    }
    const obj = input as Record<string, unknown>;

    if (
        !(obj.data instanceof Uint8Array) &&
        !(obj.data instanceof Uint8ClampedArray)
    ) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'data must be a Uint8Array or Uint8ClampedArray.',
            { cause: obj.data },
        );
    }

    if (!Number.isInteger(obj.width) || (obj.width as number) <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'width must be a positive integer.',
            { cause: obj.width },
        );
    }

    if (!Number.isInteger(obj.height) || (obj.height as number) <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'height must be a positive integer.',
            { cause: obj.height },
        );
    }

    if (obj.channels !== 3 && obj.channels !== 4) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'channels must be 3 or 4.',
            { cause: obj.channels },
        );
    }

    const w = obj.width as number;
    const h = obj.height as number;
    const c = obj.channels as number;
    const expected = w * h * c;

    if (!Number.isSafeInteger(expected)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'Pixel data size exceeds safe integer bounds.',
            { cause: { width: w, height: h, channels: c } },
        );
    }

    if (obj.data.length !== expected) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `data length must equal width * height * channels (expected ${expected}, got ${obj.data.length}).`,
            { cause: { expected, actual: obj.data.length } },
        );
    }
}

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'The operation was aborted.',
            { cause: signal.reason },
        );
    }
}

export function runNeutralPalettePipeline(
    input: PalettePixelInput,
    options: ResolvedCoreExtractPaletteOptions,
    signal?: AbortSignal,
): ExtractPaletteResult {
    checkAborted(signal);
    validatePalettePixelInput(input);
    checkAborted(signal);

    const pixels = normalizePixels(
        input.data,
        input.width,
        input.height,
        input.channels,
    );
    const samples = sampleSquareGrid(pixels, options.sampling.maxDimension);

    const criteria = {
        alphaThreshold: options.filtering.alphaThreshold,
        minBrightness: options.filtering.minBrightness,
        maxBrightness: options.filtering.maxBrightness,
        minSaturation: options.filtering.minSaturation,
    };

    const validSamples = samples.filter((p) => passesFilter(p, criteria));

    if (validSamples.length === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            'No valid pixels remain after filtering. The image may be fully transparent, fully out of the configured brightness or saturation range, or smaller than the sample grid can cover.',
            { cause: { sampled: samples.length, passed: 0 } },
        );
    }

    checkAborted(signal);

    const labSamples = convertRgbSamplesToLab(validSamples);
    const k = Math.min(options.advanced.labKmeans.clusters, labSamples.length);
    const candidateResult = runLabKmeans(labSamples, {
        clusters: k,
        iterations: options.advanced.labKmeans.iterations,
    });

    checkAborted(signal);

    return normalizePalette({
        candidateResult,
        validPixels: validSamples.length,
        sampledWidth: pixels.width,
        sampledHeight: pixels.height,
        sampledPixels: samples.length,
        runtime: 'core',
        decoder: 'pixels',
        packageVersion: PACKAGE_VERSION,
        algorithmVersion: NEUTRAL_ALGORITHM_VERSION,
        options,
        signal,
    });
}

export async function extractPaletteFromPixels(
    input: PalettePixelInput,
    options?: CoreExtractPaletteOptions,
): Promise<ExtractPaletteResult> {
    const resolved = resolveNeutralOptions(options ?? {}, 'core');
    return runNeutralPalettePipeline(input, resolved);
}

function emptyResult(): ExtractColorsResult {
    return {
        primary: {
            hex: '#808080',
            rgb: { r: 128, g: 128, b: 128 },
            role: 'primary',
            source: 'fallback',
        },
        secondary: null,
    };
}

function toUint8Array(
    data: PixelInput['data'],
): Uint8Array | Uint8ClampedArray {
    if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
        return data;
    }
    return Uint8Array.from(data);
}

const PACKAGE_VERSION = VERSION;

export function runExtractionPipeline(
    input: PixelInput,
    options?: ExtractColorsOptions,
): ExtractColorsResult {
    validateCoreInput(input);
    const resolved = resolveOptions(options);
    const criteria = {
        alphaThreshold: resolved.filtering.alphaThreshold!,
        minBrightness: resolved.filtering.minBrightness!,
        maxBrightness: resolved.filtering.maxBrightness!,
        minSaturation: resolved.filtering.minSaturation!,
    };

    const pixels = normalizePixels(
        toUint8Array(input.data),
        input.width,
        input.height,
        4,
    );
    const samples = sampleSquareGrid(pixels, resolved.sampleSize);
    const validSamples = samples.filter((p) => passesFilter(p, criteria));

    if (validSamples.length === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            'No valid pixels remain after filtering. The image may be fully transparent, fully out of the configured brightness or saturation range, or smaller than the sample grid can cover.',
            { cause: { sampled: samples.length, passed: 0 } },
        );
    }

    const labSamples = convertRgbSamplesToLab(validSamples);

    const k = Math.min(resolved.kmeans.clusters!, labSamples.length);
    const candidateResult = runLabKmeans(labSamples, {
        clusters: k,
        iterations: resolved.kmeans.iterations!,
    });

    const singleColor =
        candidateResult.candidates.length <= 1 ||
        candidateResult.candidates.every((c, i) => {
            if (i === 0) return true;
            return (
                labSquaredDistance(c.lab, candidateResult.candidates[0]!.lab) <
                1
            );
        });

    const clusters = candidatesToClusters(
        candidateResult,
        labSamples.length,
        resolved.primary.preset!,
    );
    if (singleColor) {
        const primaryCluster =
            clusters[findPrimaryIndex(clusters, resolved.primary.preset!)]!;
        const primary = buildPrimaryColor(primaryCluster);
        const palette = buildPalette([], resolved);
        return applyOutputFlags(
            {
                primary,
                secondary: null,
                accents: [],
                palette,
                metadata: {
                    algorithm: 'lab-kmeans-chroma-weighted',
                    packageVersion: PACKAGE_VERSION,
                    cacheVersion: '1.0',
                    sampleSize: resolved.sampleSize,
                    sampledPixels: samples.length,
                    validPixels: validSamples.length,
                    clusters: clusters.length,
                    iterations: resolved.kmeans.iterations!,
                    primaryPreset: resolved.primary.preset!,
                    secondaryFallback: resolved.secondary.fallback!,
                    fallbackUsed: false,
                    runtime: 'core',
                    decoder: 'pixels',
                } satisfies ExtractionMetadata,
            },
            resolved.output,
        );
    }
    if (clusters.length === 0) {
        return emptyResult();
    }

    const primaryIdx = findPrimaryIndex(clusters, resolved.primary.preset!);
    const primaryCluster = clusters[primaryIdx]!;
    const primary = buildPrimaryColor(primaryCluster);
    const others = clusters.filter((c) => c.index !== primaryCluster.index);
    const secondaryResult = selectSecondary(primaryCluster, others, resolved);
    let secondaryColor: ExtractedColor | null = null;
    if (secondaryResult) {
        const clusterScore =
            secondaryResult.sourceClusterIndex !== null
                ? scoreSecondary(
                      primaryCluster,
                      clusters.find(
                          (c) => c.index === secondaryResult.sourceClusterIndex,
                      )!,
                      resolved,
                  )
                : secondaryResult.color.score;
        secondaryColor = {
            ...applyLightnessGap(
                primaryCluster,
                secondaryResult.color,
                resolved,
            ),
            score: clusterScore,
        };
    }

    const excludeIndices: number[] = [primaryCluster.index];
    if (
        secondaryResult?.sourceClusterIndex !== null &&
        secondaryResult?.sourceClusterIndex !== undefined
    ) {
        excludeIndices.push(secondaryResult.sourceClusterIndex);
    }
    const palette = buildPalette(clusters, resolved, { excludeIndices });

    const accentsCount = resolved.accents ?? 0;
    const accentPool = clusters
        .filter(
            (c) =>
                c.index !== primaryCluster.index &&
                (secondaryResult?.sourceClusterIndex ?? -1) !== c.index,
        )
        .slice(0, accentsCount);
    const accents = accentPool.map((c) => ({
        ...buildPrimaryColor(c),
        role: 'accent' as const,
    }));

    const fallbackUsed = secondaryColor?.source === 'fallback';

    const fullResult: FullExtractionResult = {
        primary,
        secondary: secondaryColor,
        accents,
        palette,
        metadata: {
            algorithm: 'lab-kmeans-chroma-weighted',
            packageVersion: PACKAGE_VERSION,
            cacheVersion: '1.0',
            sampleSize: resolved.sampleSize,
            sampledPixels: samples.length,
            validPixels: validSamples.length,
            clusters: clusters.length,
            iterations: resolved.kmeans.iterations!,
            primaryPreset: resolved.primary.preset!,
            secondaryFallback: resolved.secondary.fallback!,
            fallbackUsed,
            runtime: 'core',
            decoder: 'pixels',
        } satisfies ExtractionMetadata,
    };

    return applyOutputFlags(fullResult, resolved.output);
}

/** @deprecated Use `extractPaletteFromPixels` instead. Semantic role extraction moved out of the extractor in 0.2.0. See the migration guide in the README. Will be removed in 0.4.0. */
export async function extractColorsFromPixels(
    input: PixelInput,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
    return runExtractionPipeline(input, options);
}

/** @deprecated Use `extractPaletteFromImageData` (browser) or `extractPaletteFromPixels` (core) instead. Will be removed in 0.4.0. */
export async function extractColorsFromImageData(
    imageData: ImageDataLike,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
    if (imageData === null || imageData === undefined) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'ImageData input is required.',
            { cause: imageData },
        );
    }
    const input: PixelInput = {
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
    };
    return extractColorsFromPixels(input, options);
}
