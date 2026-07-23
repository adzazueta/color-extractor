export interface MmcqHistogram {
    readonly count: Uint32Array;
    readonly sumR: Float64Array;
    readonly sumG: Float64Array;
    readonly sumB: Float64Array;
    readonly occupiedBins: number;
}

export interface MmcqBox {
    rMin: number;
    rMax: number;
    gMin: number;
    gMax: number;
    bMin: number;
    bMax: number;
    population: number;
    occupiedBins: number;
    volume: number;
    creationIndex: number;
}

export interface MmcqDiagnostics {
    requestedBoxes: number;
    producedCandidates: number;
    histogramBits: 5;
    occupiedBins: number;
    splits: number;
}
