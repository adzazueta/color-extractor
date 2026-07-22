import { describe, expect, it } from 'vitest';
import {
    ColorExtractorError,
    type ExtractionAlgorithm,
    extractPaletteFromPixels,
    resolveNeutralOptions,
} from '../../src/core/index.js';

describe('Algorithm Selector and Metadata', () => {
    const mockPixels = {
        data: new Uint8Array([
            200, 50, 50, 255, 50, 200, 50, 255, 50, 50, 200, 255, 200, 200, 50,
            255,
        ]),
        width: 2,
        height: 2,
        channels: 4 as const,
    };

    it('defaults algorithm to "lab-kmeans"', () => {
        const resolved = resolveNeutralOptions({}, 'core');
        expect(resolved.algorithm).toBe('lab-kmeans');
    });

    it('produces identical output when algorithm is omitted vs explicitly "lab-kmeans"', async () => {
        const resultOmitted = await extractPaletteFromPixels(mockPixels);
        const resultExplicit = await extractPaletteFromPixels(mockPixels, {
            algorithm: 'lab-kmeans',
        });

        expect(resultOmitted.metadata.algorithm).toBe('lab-kmeans');
        expect(resultExplicit.metadata.algorithm).toBe('lab-kmeans');
        expect(resultExplicit.metadata.algorithmVersion).toBe(
            resultOmitted.metadata.algorithmVersion,
        );
        expect(resultExplicit.swatches).toEqual(resultOmitted.swatches);
        expect(resultExplicit.metadata.algorithmDetails).toEqual({
            requestedClusters: 4,
            producedCandidates: 4,
            iterations: 7,
        });
    });

    it('throws COLOR_EXTRACTOR_INVALID_OPTIONS for unknown algorithm string', () => {
        expect(() =>
            resolveNeutralOptions(
                { algorithm: 'invalid-algo' as unknown as ExtractionAlgorithm },
                'core',
            ),
        ).toThrowError(ColorExtractorError);

        try {
            resolveNeutralOptions(
                { algorithm: 'invalid-algo' as unknown as ExtractionAlgorithm },
                'core',
            );
        } catch (err: unknown) {
            const error = err as ColorExtractorError;
            expect(error.code).toBe('COLOR_EXTRACTOR_INVALID_OPTIONS');
            expect(error.message).toContain('algorithm');
        }
    });

    it('throws COLOR_EXTRACTOR_INVALID_OPTIONS when advanced.mmcq is passed while algorithm is "lab-kmeans"', () => {
        expect(() =>
            resolveNeutralOptions(
                {
                    algorithm: 'lab-kmeans',
                    advanced: { mmcq: { boxes: 10 } },
                },
                'core',
            ),
        ).toThrowError(ColorExtractorError);

        try {
            resolveNeutralOptions(
                {
                    algorithm: 'lab-kmeans',
                    advanced: { mmcq: { boxes: 10 } },
                },
                'core',
            );
        } catch (err: unknown) {
            const error = err as ColorExtractorError;
            expect(error.code).toBe('COLOR_EXTRACTOR_INVALID_OPTIONS');
            expect(error.message).toContain('advanced.mmcq');
        }
    });

    it('throws COLOR_EXTRACTOR_INVALID_OPTIONS when advanced.labKmeans is passed while algorithm is "mmcq"', () => {
        expect(() =>
            resolveNeutralOptions(
                {
                    algorithm: 'mmcq',
                    advanced: { labKmeans: { clusters: 10 } },
                },
                'core',
            ),
        ).toThrowError(ColorExtractorError);

        try {
            resolveNeutralOptions(
                {
                    algorithm: 'mmcq',
                    advanced: { labKmeans: { clusters: 10 } },
                },
                'core',
            );
        } catch (err: unknown) {
            const error = err as ColorExtractorError;
            expect(error.code).toBe('COLOR_EXTRACTOR_INVALID_OPTIONS');
            expect(error.message).toContain('advanced.labKmeans');
        }
    });

    it('allows algorithm-independent option groups for both algorithms', () => {
        const resolved = resolveNeutralOptions(
            {
                algorithm: 'lab-kmeans',
                result: { maxColors: 6 },
                advanced: {
                    perceptualRanking: { chromaFloor: 15 },
                },
            },
            'core',
        );

        expect(resolved.algorithm).toBe('lab-kmeans');
        expect(resolved.result.maxColors).toBe(6);
        expect(resolved.advanced.perceptualRanking.chromaFloor).toBe(15);
    });
});
