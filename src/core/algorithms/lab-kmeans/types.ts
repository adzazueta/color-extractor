import type { LabColor, RgbColor } from '../../palette-types.js';

export interface LabKmeansCandidate {
    readonly rgb: RgbColor;
    readonly lab: LabColor;
    readonly population: number;
    readonly sourceIndex: number;
}

export interface LabKmeansRunMetadata {
    readonly requestedClusters: number;
    readonly producedCandidates: number;
    readonly iterations: number;
}

export interface LabKmeansCandidateResult {
    readonly candidates: LabKmeansCandidate[];
    readonly metadata: LabKmeansRunMetadata;
}

export interface LabSample {
    readonly rgb: RgbColor;
    readonly lab: LabColor;
    readonly index: number;
}

export interface KMeansResult {
    readonly centroids: readonly LabColor[];
    readonly populations: readonly number[];
    readonly assignments: readonly number[];
}
