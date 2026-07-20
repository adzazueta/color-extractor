import { labSquaredDistance } from '../../color/lab.js';
import type { LabColor } from '../../palette-types.js';
import type { LabSample } from './types.js';

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

export function recomputeCentroids(
    samples: LabSample[],
    assignments: readonly number[],
    k: number,
    previous: readonly LabColor[],
): LabColor[] {
    const sums: { L: number; a: number; b: number }[] = Array.from(
        { length: k },
        () => ({ L: 0, a: 0, b: 0 }),
    );
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < samples.length; i++) {
        const c = assignments[i]!;
        const sum = sums[c]!;
        const lab = samples[i]!.lab;
        sum.L += lab.L;
        sum.a += lab.a;
        sum.b += lab.b;
        counts[c]!++;
    }

    const newCentroids: LabColor[] = new Array<LabColor>(k);
    const validReference: LabColor[] = [];

    for (let j = 0; j < k; j++) {
        if (counts[j]! > 0) {
            const sum = sums[j]!;
            const count = counts[j]!;
            newCentroids[j] = {
                L: sum.L / count,
                a: sum.a / count,
                b: sum.b / count,
            };
            validReference.push(newCentroids[j]!);
        }
    }

    const usedSampleIndices = new Set<number>();
    for (let j = 0; j < k; j++) {
        if (counts[j] === 0) {
            const reference =
                validReference.length > 0 ? validReference : previous;
            const idx = findFarthestFromCentroids(
                samples,
                reference,
                usedSampleIndices,
            );
            usedSampleIndices.add(idx);
            const reinited: LabColor = { ...samples[idx]!.lab };
            newCentroids[j] = reinited;
            validReference.push(reinited);
        }
    }

    return newCentroids;
}
