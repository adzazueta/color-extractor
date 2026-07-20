import type { LabKmeansCandidateResult } from '../algorithms/lab-kmeans/types.js';
import { chromaFromLab } from '../color/chroma-hue.js';
import { rgbToHsl } from '../color/hsl.js';
import type { PrimaryPreset } from '../options.js';
import { scorePrimary } from '../role.js';
import type { HSL, RGB } from '../types.js';
import type { Cluster } from './cluster.js';

export function candidatesToClusters(
    candidateResult: LabKmeansCandidateResult,
    totalSamples: number,
    preset: PrimaryPreset | undefined,
): Cluster[] {
    const clusters: Cluster[] = [];
    let candidateIndex = 0;
    for (const cand of candidateResult.candidates) {
        const proportion =
            totalSamples === 0 ? 0 : cand.population / totalSamples;
        const chroma = chromaFromLab(cand.lab.a, cand.lab.b);

        const cluster: Cluster = {
            index: candidateIndex,
            lab: cand.lab,
            rgb: {
                r: cand.rgb.r,
                g: cand.rgb.g,
                b: cand.rgb.b,
            } as unknown as RGB,
            hsl: rgbToHsl(cand.rgb.r, cand.rgb.g, cand.rgb.b) as unknown as HSL,
            population: cand.population,
            proportion,
            chroma,
            score: 0,
        };
        const score = scorePrimary(cluster, preset);
        clusters.push({ ...cluster, score });
        candidateIndex++;
    }
    return clusters;
}
