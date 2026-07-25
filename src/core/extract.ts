import { VERSION } from '../generated/version.js';
import type { ExtractionSampleSet } from './algorithms/contract.js';
import { getAlgorithm } from './algorithms/registry.js';
import { ColorExtractorError } from './errors.js';
import { passesFilter } from './filter.js';
import { normalizePalette } from './neutral/normalize.js';
import type {
    CoreExtractColorOptions,
    ResolvedCoreExtractColorOptions,
} from './neutral-options.js';
import { resolveNeutralOptions } from './neutral-options.js';
import type { ExtractColorResult } from './palette-types.js';
import { normalizePixels } from './pixels.js';
import { convertRgbSamplesToLab, sampleSquareGrid } from './sample.js';

export interface ImageDataLike {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}

export type ColorPixelInput = {
    readonly data: Uint8Array | Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly channels: 3 | 4;
};

function validateColorPixelInput(
    input: unknown,
): asserts input is ColorPixelInput {
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

const PACKAGE_VERSION = VERSION;

export function runNeutralColorPipeline(
    input: ColorPixelInput,
    options: ResolvedCoreExtractColorOptions,
    signal?: AbortSignal,
): ExtractColorResult {
    checkAborted(signal);
    validateColorPixelInput(input);
    checkAborted(signal);

    const pixels = normalizePixels(
        input.data,
        input.width,
        input.height,
        input.channels,
    );
    const maxDim = options.sampling.maxDimension;
    const step = Math.max(
        1,
        Math.ceil(Math.max(pixels.width, pixels.height) / maxDim),
    );
    const sampledWidth = Math.ceil(pixels.width / step);
    const sampledHeight = Math.ceil(pixels.height / step);
    const samples = sampleSquareGrid(pixels, maxDim);

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
    const sampleSet: ExtractionSampleSet = {
        samples: labSamples,
        validPixels: validSamples.length,
    };

    const algorithmImpl = getAlgorithm(options.algorithm);
    const algoOptions =
        options.algorithm === 'lab-kmeans'
            ? {
                  clusters: Math.min(
                      options.advanced.labKmeans.clusters,
                      labSamples.length,
                  ),
                  iterations: options.advanced.labKmeans.iterations,
              }
            : {
                  boxes: Math.min(
                      options.advanced.mmcq.boxes,
                      labSamples.length,
                  ),
              };

    const candidateResult = algorithmImpl.run(sampleSet, algoOptions, {
        signal,
    });

    checkAborted(signal);

    return normalizePalette({
        candidateResult,
        validPixels: validSamples.length,
        sampledWidth,
        sampledHeight,
        sampledPixels: samples.length,
        runtime: 'core',
        decoder: 'pixels',
        packageVersion: PACKAGE_VERSION,
        algorithmVersion: candidateResult.algorithmVersion,
        options,
        signal,
    });
}

export async function extractColorsFromPixels(
    input: ColorPixelInput,
    options?: CoreExtractColorOptions,
): Promise<ExtractColorResult> {
    const signal = Object.hasOwn(
        (options ?? {}) as Record<string, unknown>,
        'signal',
    )
        ? options?.signal
        : undefined;
    const resolved = resolveNeutralOptions(options, 'core');
    return runNeutralColorPipeline(input, resolved, signal);
}
