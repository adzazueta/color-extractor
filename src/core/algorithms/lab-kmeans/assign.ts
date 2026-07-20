import { labSquaredDistance } from '../../color/lab.js';
import type { LabColor } from '../../palette-types.js';
import type { LabSample } from './types.js';

export function assignToClusters(
    samples: LabSample[],
    centroids: readonly LabColor[],
): number[] {
    const assignments = new Array<number>(samples.length);
    for (let i = 0; i < samples.length; i++) {
        let minDist = Number.POSITIVE_INFINITY;
        let minIdx = 0;
        for (let j = 0; j < centroids.length; j++) {
            const d = labSquaredDistance(samples[i]!.lab, centroids[j]!);
            if (d < minDist) {
                minDist = d;
                minIdx = j;
            }
        }
        assignments[i] = minIdx;
    }
    return assignments;
}
