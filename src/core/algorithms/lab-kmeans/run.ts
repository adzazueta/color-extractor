import { labToXyz } from '../../color/lab.js';
import { linearToSrgbByte } from '../../color/srgb.js';
import { xyzToLinearRgb } from '../../color/xyz.js';
import type { LabColor, RgbColor } from '../../palette-types.js';
import { assignToClusters } from './assign.js';
import { initializeCentroids } from './initialize.js';
import type {
    KMeansResult,
    LabKmeansCandidate,
    LabKmeansCandidateResult,
    LabSample,
} from './types.js';
import { recomputeCentroids } from './update.js';

function centroidToRgb(lab: LabColor): RgbColor {
    const { x, y, z } = labToXyz(lab.L, lab.a, lab.b);
    const linearRgb = xyzToLinearRgb(x, y, z);
    return {
        r: linearToSrgbByte(linearRgb.r),
        g: linearToSrgbByte(linearRgb.g),
        b: linearToSrgbByte(linearRgb.b),
    };
}

export function kmeans(
    samples: LabSample[],
    options: { clusters: number; iterations: number },
): KMeansResult {
    if (!Number.isInteger(options.clusters) || options.clusters <= 0) {
        throw new RangeError(
            `clusters must be a positive integer, got ${options.clusters}`,
        );
    }
    if (!Number.isInteger(options.iterations) || options.iterations < 0) {
        throw new RangeError(
            `iterations must be a non-negative integer, got ${options.iterations}`,
        );
    }
    if (options.clusters > samples.length) {
        throw new RangeError(
            `clusters (${options.clusters}) cannot exceed samples.length (${samples.length})`,
        );
    }

    const initial = initializeCentroids(samples, options.clusters);
    let centroids: LabColor[] = initial.map((s) => ({ ...s.lab }));

    let assignments = assignToClusters(samples, centroids);

    for (let i = 0; i < options.iterations; i++) {
        centroids = recomputeCentroids(
            samples,
            assignments,
            options.clusters,
            centroids,
        );
        assignments = assignToClusters(samples, centroids);
    }

    centroids = recomputeCentroids(
        samples,
        assignments,
        options.clusters,
        centroids,
    );

    const populations = new Array<number>(options.clusters).fill(0);
    for (const a of assignments) {
        populations[a]!++;
    }

    return { centroids, populations, assignments };
}

export function runLabKmeans(
    samples: LabSample[],
    options: { clusters: number; iterations: number },
): LabKmeansCandidateResult {
    const result = kmeans(samples, options);

    const candidates: LabKmeansCandidate[] = [];
    let sourceIndex = 0;
    for (let i = 0; i < result.centroids.length; i++) {
        const population = result.populations[i]!;
        if (population === 0) continue;

        const lab = result.centroids[i]!;
        const rgb = centroidToRgb(lab);

        candidates.push({
            rgb,
            lab: { L: lab.L, a: lab.a, b: lab.b },
            population,
            sourceIndex: sourceIndex++,
        });
    }

    return {
        candidates,
        metadata: {
            requestedClusters: options.clusters,
            producedCandidates: candidates.length,
            iterations: options.iterations,
        },
    };
}
