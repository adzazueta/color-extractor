export type SwatchId = `swatch-${string}`;

export type RgbColor = {
    r: number;
    g: number;
    b: number;
};

export type HslColor = {
    h: number;
    s: number;
    l: number;
};

export type LabColor = {
    L: number;
    a: number;
    b: number;
};

export type ExtractedSwatch = {
    id: SwatchId;
    hex: string;
    rgb: RgbColor;
    lab: LabColor;
    chroma: number;
    population: number;
    proportion: number;
    score: number;
    hsl?: HslColor;
};

export type PaletteRankings = {
    perceptual: SwatchId[];
    population: SwatchId[];
    chroma: SwatchId[];
};

export type ExtractionAlgorithm = 'lab-kmeans' | 'mmcq';

export type ExtractionRuntime = 'browser' | 'node' | 'core';

export type ExtractionDecoder = 'canvas' | 'sharp' | 'image-data' | 'pixels';

export type ExtractionMetadata = {
    algorithm: ExtractionAlgorithm;
    algorithmVersion: string;
    packageVersion: string;
    runtime: ExtractionRuntime;
    decoder: ExtractionDecoder;
    sampledWidth: number;
    sampledHeight: number;
    sampledPixels: number;
    validPixels: number;
    candidateCount: number;
    returnedColors: number;
    returnedPopulation: number;
    coverage: number;
    algorithmDetails: Readonly<Record<string, unknown>>;
};

export type ExtractPaletteResult = {
    swatches: ExtractedSwatch[];
    rankings: PaletteRankings;
    metadata: ExtractionMetadata;
};
