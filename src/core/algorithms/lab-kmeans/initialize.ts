import { labSquaredDistance } from '../../color/lab.js';
import type { LabColor } from '../../palette-types.js';
import type { LabSample } from './types.js';

function meanLab(samples: LabSample[]): LabColor {
    let sumL = 0;
    let suma = 0;
    let sumb = 0;
    for (const s of samples) {
        sumL += s.lab.L;
        suma += s.lab.a;
        sumb += s.lab.b;
    }
    const n = samples.length;
    return { L: sumL / n, a: suma / n, b: sumb / n };
}

function indexOfClosestTo(
    samples: LabSample[],
    target: LabColor,
    exclude: Set<number>,
): number {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < samples.length; i++) {
        if (exclude.has(i)) continue;
        const d = labSquaredDistance(samples[i]!.lab, target);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function findFarthestFromCentroids(
    samples: LabSample[],
    centroids: readonly LabColor[],
    exclude: Set<number>,
): number {
    let bestIdx = 0;
    let bestMinDist = -1;
    for (let i = 0; i < samples.length; i++) {
        if (exclude.has(i)) continue;
        let minDist = Number.POSITIVE_INFINITY;
        for (const c of centroids) {
            const d = labSquaredDistance(samples[i]!.lab, c);
            if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) {
            bestMinDist = minDist;
            bestIdx = i;
        }
    }
    return bestIdx;
}

export function initializeCentroids(
    samples: LabSample[],
    k: number,
): LabSample[] {
    if (!Number.isInteger(k) || k <= 0) {
        throw new RangeError(`k must be a positive integer, got ${k}`);
    }
    if (k > samples.length) {
        throw new RangeError(
            `k (${k}) cannot exceed samples.length (${samples.length})`,
        );
    }

    const mean = meanLab(samples);
    const firstIdx = indexOfClosestTo(samples, mean, new Set());
    const centroids: LabSample[] = [samples[firstIdx]!];
    const exclude = new Set<number>([firstIdx]);

    for (let i = 1; i < k; i++) {
        const nextIdx = findFarthestFromCentroids(
            samples,
            centroids.map((c) => c.lab),
            exclude,
        );
        centroids.push(samples[nextIdx]!);
        exclude.add(nextIdx);
    }

    return centroids;
}
