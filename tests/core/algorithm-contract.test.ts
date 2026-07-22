import { describe, expect, it } from 'vitest';
import type {
    AlgorithmCandidateResult,
    AlgorithmContext,
    AlgorithmDiagnostics,
    ExtractionCandidate,
    ExtractionSample,
    ExtractionSampleSet,
    NeutralExtractionAlgorithm,
} from '../../src/core/algorithms/contract.js';

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

    it('supports dummy implementation conforming to NeutralExtractionAlgorithm interface', () => {
        class MockAlgorithm
            implements NeutralExtractionAlgorithm<{ clusters?: number }>
        {
            readonly id = 'lab-kmeans' as const;
            readonly version = '0.1.0';

            run(
                input: ExtractionSampleSet,
                options: Readonly<{ clusters?: number }>,
                context: Readonly<AlgorithmContext>,
            ): AlgorithmCandidateResult {
                if (context.signal?.aborted) {
                    throw new Error('Aborted');
                }
                const first = input.samples[0];
                return {
                    algorithm: this.id,
                    algorithmVersion: this.version,
                    candidates: first
                        ? [
                              {
                                  rgb: first.rgb,
                                  lab: first.lab,
                                  population: input.validPixels,
                                  sourceIndex: 0,
                              },
                          ]
                        : [],
                    diagnostics: {
                        requestedClusters: options.clusters ?? 4,
                        producedCandidates: first ? 1 : 0,
                    },
                };
            }
        }

        const algo = new MockAlgorithm();
        expect(algo.id).toBe('lab-kmeans');
        expect(algo.version).toBe('0.1.0');

        const input: ExtractionSampleSet = {
            samples: [
                {
                    rgb: { r: 0, g: 128, b: 255 },
                    lab: { L: 50, a: 0, b: -50 },
                },
            ],
            validPixels: 1,
        };

        const res = algo.run(input, { clusters: 8 }, {});
        expect(res.algorithm).toBe('lab-kmeans');
        expect(res.candidates).toHaveLength(1);
        expect(res.candidates[0]?.rgb).toEqual({ r: 0, g: 128, b: 255 });
    });
});
