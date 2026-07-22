import { labSquaredDistance } from '../../color/lab.js';
import { ColorExtractorError } from '../../errors.js';
import type { LabKmeansOptions } from '../../neutral-options.js';
import type { RgbColor } from '../../palette-types.js';
import type {
    AlgorithmCandidateResult,
    AlgorithmContext,
    ExtractionCandidate,
    ExtractionSampleSet,
    NeutralExtractionAlgorithm,
} from '../contract.js';
import { kmeans } from './run.js';

export const LAB_KMEANS_ALGORITHM_VERSION = '1.0.0';

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'The operation was aborted.',
            { cause: signal.reason },
        );
    }
}

/**
 * Neutral Lab K-means extraction algorithm implementing NeutralExtractionAlgorithm.
 */
export const labKmeansAlgorithm: NeutralExtractionAlgorithm<LabKmeansOptions> =
    {
        id: 'lab-kmeans',
        version: LAB_KMEANS_ALGORITHM_VERSION,
        run(
            input: ExtractionSampleSet,
            options: Readonly<LabKmeansOptions>,
            context: Readonly<AlgorithmContext>,
        ): AlgorithmCandidateResult {
            const signal = context.signal;
            checkAborted(signal);

            const requestedClusters = options.clusters ?? 4;
            const iterations = options.iterations ?? 10;
            const k = Math.min(requestedClusters, input.samples.length);

            if (k <= 0 || input.samples.length === 0) {
                return {
                    algorithm: 'lab-kmeans',
                    algorithmVersion: LAB_KMEANS_ALGORITHM_VERSION,
                    candidates: [],
                    diagnostics: {
                        requestedClusters,
                        producedCandidates: 0,
                        iterations,
                    },
                };
            }

            const samples = input.samples.map((s, index) => ({
                rgb: s.rgb,
                lab: s.lab,
                index,
            }));

            const result = kmeans(samples, { clusters: k, iterations }, signal);

            checkAborted(signal);

            const candidates: ExtractionCandidate[] = [];
            let sourceIndex = 0;

            for (let i = 0; i < result.centroids.length; i++) {
                const population = result.populations[i]!;
                if (population === 0) continue;

                const centroidLab = result.centroids[i]!;
                let rgb: RgbColor = samples[0]!.rgb;
                let nearestDist = Number.POSITIVE_INFINITY;

                for (let j = 0; j < samples.length; j++) {
                    if (result.assignments[j] !== i) continue;
                    const d = labSquaredDistance(samples[j]!.lab, centroidLab);
                    if (d < nearestDist) {
                        nearestDist = d;
                        rgb = samples[j]!.rgb;
                    }
                }

                candidates.push({
                    rgb,
                    lab: {
                        L: centroidLab.L,
                        a: centroidLab.a,
                        b: centroidLab.b,
                    },
                    population,
                    sourceIndex: sourceIndex++,
                });
            }

            checkAborted(signal);

            return {
                algorithm: 'lab-kmeans',
                algorithmVersion: LAB_KMEANS_ALGORITHM_VERSION,
                candidates,
                diagnostics: {
                    requestedClusters,
                    producedCandidates: candidates.length,
                    iterations,
                },
            };
        },
    };
