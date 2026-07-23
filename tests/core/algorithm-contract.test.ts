import { describe, expect, it } from 'vitest';
import type {
    AlgorithmCandidateResult,
    AlgorithmDiagnostics,
    ExtractionCandidate,
    ExtractionSample,
    ExtractionSampleSet,
    NeutralExtractionAlgorithm,
} from '../../src/core/algorithms/contract.js';
import { labKmeansAlgorithm } from '../../src/core/algorithms/lab-kmeans/algorithm.js';
import { mmcqAlgorithm } from '../../src/core/algorithms/mmcq/algorithm.js';

/**
 * Reusable contract test suite runner for 0.3 neutral extraction algorithms.
 * Verifies that any algorithm implementation satisfies all contract invariants.
 */
function verifyAlgorithmContract<T = unknown>(
    algorithm: NeutralExtractionAlgorithm<T>,
    options: Readonly<T>,
) {
    describe(`Algorithm Contract Invariants: ${algorithm.id} v${algorithm.version}`, () => {
        const createSampleSet = (): ExtractionSampleSet => ({
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
                {
                    rgb: { r: 255, g: 255, b: 0 },
                    lab: { L: 97.14, a: -21.55, b: 94.48 },
                },
                {
                    rgb: { r: 255, g: 0, b: 255 },
                    lab: { L: 60.32, a: 98.23, b: -60.82 },
                },
            ],
            validPixels: 1000,
        });

        it('preserves input sample objects without mutation', () => {
            const input = createSampleSet();
            const originalSamplesJson = JSON.stringify(input.samples);
            algorithm.run(input, options, {});
            expect(JSON.stringify(input.samples)).toBe(originalSamplesJson);
        });

        it('conserves population across candidates', () => {
            const input = createSampleSet();
            const result = algorithm.run(input, options, {});
            const totalPop = result.candidates.reduce(
                (sum, c) => sum + c.population,
                0,
            );
            expect(totalPop).toBe(input.samples.length);
        });

        it('produces sequential 0-indexed sourceIndex values', () => {
            const input = createSampleSet();
            const result = algorithm.run(input, options, {});
            result.candidates.forEach((cand, idx) => {
                expect(cand.sourceIndex).toBe(idx);
            });
        });

        it('ensures all candidate RGB and Lab values are finite numbers', () => {
            const input = createSampleSet();
            const result = algorithm.run(input, options, {});
            result.candidates.forEach((cand) => {
                expect(Number.isInteger(cand.rgb.r)).toBe(true);
                expect(cand.rgb.r).toBeGreaterThanOrEqual(0);
                expect(cand.rgb.r).toBeLessThanOrEqual(255);
                expect(Number.isInteger(cand.rgb.g)).toBe(true);
                expect(cand.rgb.g).toBeGreaterThanOrEqual(0);
                expect(cand.rgb.g).toBeLessThanOrEqual(255);
                expect(Number.isInteger(cand.rgb.b)).toBe(true);
                expect(cand.rgb.b).toBeGreaterThanOrEqual(0);
                expect(cand.rgb.b).toBeLessThanOrEqual(255);

                expect(Number.isFinite(cand.lab.L)).toBe(true);
                expect(Number.isFinite(cand.lab.a)).toBe(true);
                expect(Number.isFinite(cand.lab.b)).toBe(true);
            });
        });

        it('returns valid diagnostics metadata matching output', () => {
            const input = createSampleSet();
            const result = algorithm.run(input, options, {});
            expect(result.diagnostics.producedCandidates).toBe(
                result.candidates.length,
            );
            expect(result.diagnostics.producedCandidates).toBeGreaterThan(0);
        });

        it('handles AbortSignal cancellation before/during execution', () => {
            const input = createSampleSet();
            const controller = new AbortController();
            controller.abort();

            expect(() => {
                algorithm.run(input, options, { signal: controller.signal });
            }).toThrow();
        });
    });
}

describe('Neutral Algorithm Contract (ADZ-116)', () => {
    it('defines rigid structural invariants for ExtractionSampleSet', () => {
        const sample: ExtractionSample = {
            rgb: { r: 255, g: 0, b: 0 },
            lab: { L: 53.24, a: 80.09, b: 67.2 },
        };
        const sampleSet: ExtractionSampleSet = {
            samples: [sample],
            validPixels: 1,
        };

        expect(sampleSet.samples).toHaveLength(1);
        expect(sampleSet.validPixels).toBe(sampleSet.samples.length);
        expect(sampleSet.samples[0]?.rgb).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('defines rigid structural invariants for AlgorithmCandidateResult', () => {
        const candidate: ExtractionCandidate = {
            rgb: { r: 255, g: 0, b: 0 },
            lab: { L: 53.24, a: 80.09, b: 67.2 },
            population: 100,
            sourceIndex: 0,
        };
        const diagnostics: AlgorithmDiagnostics = {
            iterations: 5,
            requestedClusters: 4,
            producedCandidates: 1,
        };
        const result: AlgorithmCandidateResult = {
            algorithm: 'lab-kmeans',
            algorithmVersion: '1.0.0',
            candidates: [candidate],
            diagnostics,
        };

        expect(result.algorithm).toBe('lab-kmeans');
        expect(result.algorithmVersion).toBe('1.0.0');
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]?.population).toBe(100);
        expect(result.candidates[0]?.sourceIndex).toBe(0);
        expect(result.diagnostics).toEqual({
            iterations: 5,
            requestedClusters: 4,
            producedCandidates: 1,
        });
    });

    // Verify actual registered algorithms satisfy contract
    verifyAlgorithmContract(labKmeansAlgorithm, {});
    verifyAlgorithmContract(mmcqAlgorithm, {});
});
