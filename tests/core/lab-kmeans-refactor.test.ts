import { describe, expect, it } from 'vitest';
import type { ExtractionSampleSet } from '../../src/core/algorithms/contract.js';
import {
    getAlgorithm,
    LAB_KMEANS_ALGORITHM_VERSION,
    labKmeansAlgorithm,
} from '../../src/core/algorithms/index.js';
import { runLabKmeans } from '../../src/core/algorithms/lab-kmeans/run.js';
import { ColorExtractorError } from '../../src/core/errors.js';

describe('Lab K-Means Refactor behind Neutral Algorithm Contract (ADZ-111)', () => {
    const mockSampleSet: ExtractionSampleSet = {
        samples: [
            {
                rgb: { r: 255, g: 0, b: 0 },
                lab: { L: 53.24, a: 80.09, b: 67.2 },
            },
            {
                rgb: { r: 0, g: 255, b: 0 },
                lab: { L: 87.73, a: -86.18, b: 83.18 },
            },
            {
                rgb: { r: 0, g: 0, b: 255 },
                lab: { L: 32.3, a: 79.19, b: -107.86 },
            },
        ],
        validPixels: 3,
    };

    it('has id "lab-kmeans" and matches registry lookup', () => {
        expect(labKmeansAlgorithm.id).toBe('lab-kmeans');
        expect(labKmeansAlgorithm.version).toBe(LAB_KMEANS_ALGORITHM_VERSION);
        expect(getAlgorithm('lab-kmeans')).toBe(labKmeansAlgorithm);
    });

    it('emits required diagnostics shape', () => {
        const result = labKmeansAlgorithm.run(
            mockSampleSet,
            { clusters: 2, iterations: 10 },
            {},
        );

        expect(result.algorithm).toBe('lab-kmeans');
        expect(result.algorithmVersion).toBe(LAB_KMEANS_ALGORITHM_VERSION);
        expect(result.diagnostics).toEqual({
            requestedClusters: 2,
            producedCandidates: result.candidates.length,
            iterations: 10,
        });
    });

    it('produces identical candidates to legacy runLabKmeans', () => {
        const contractResult = labKmeansAlgorithm.run(
            mockSampleSet,
            { clusters: 2, iterations: 10 },
            {},
        );

        const legacySamples = mockSampleSet.samples.map((s, index) => ({
            rgb: s.rgb,
            lab: s.lab,
            index,
        }));
        const legacyResult = runLabKmeans(legacySamples, {
            clusters: 2,
            iterations: 10,
            useObservedRgb: true,
        });

        expect(contractResult.candidates.length).toBe(
            legacyResult.candidates.length,
        );
        for (let i = 0; i < contractResult.candidates.length; i++) {
            expect(contractResult.candidates[i]?.rgb).toEqual(
                legacyResult.candidates[i]?.rgb,
            );
            expect(contractResult.candidates[i]?.lab).toEqual(
                legacyResult.candidates[i]?.lab,
            );
            expect(contractResult.candidates[i]?.population).toBe(
                legacyResult.candidates[i]?.population,
            );
            expect(contractResult.candidates[i]?.sourceIndex).toBe(
                legacyResult.candidates[i]?.sourceIndex,
            );
        }
    });

    it('supports cancellation via AbortSignal', () => {
        const controller = new AbortController();
        controller.abort('User cancellation');

        expect(() =>
            labKmeansAlgorithm.run(
                mockSampleSet,
                { clusters: 2, iterations: 10 },
                { signal: controller.signal },
            ),
        ).toThrowError(ColorExtractorError);

        try {
            labKmeansAlgorithm.run(
                mockSampleSet,
                { clusters: 2, iterations: 10 },
                { signal: controller.signal },
            );
        } catch (err: unknown) {
            const error = err as ColorExtractorError;
            expect(error.code).toBe('COLOR_EXTRACTOR_ABORTED');
            expect(error.cause).toBe('User cancellation');
        }
    });
});
