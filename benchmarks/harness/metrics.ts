import { labSquaredDistance } from '../../src/core/color/lab.js';
import type {
    ExtractedSwatch,
    ExtractPaletteResult,
} from '../../src/core/palette-types.js';
import type { LabSample } from '../../src/core/sample.js';
import type { BenchmarkQualityMetrics } from './types.js';

export function labDistance(
    a: { L: number; a: number; b: number },
    b: { L: number; a: number; b: number },
): number {
    return Math.sqrt(labSquaredDistance(a, b));
}

export function calculatePercentile(
    sorted: readonly number[],
    p: number,
): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;
    const rank = p * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const weight = rank - lower;
    return (
        sorted[lower]! * (1 - weight) +
        (sorted[upper] ?? sorted[lower]!) * weight
    );
}

export function calculateReconstructionError(
    samples: readonly LabSample[],
    swatches: readonly ExtractedSwatch[],
): { mean: number; p95: number } {
    if (samples.length === 0 || swatches.length === 0) {
        return { mean: 0, p95: 0 };
    }

    const distances: number[] = new Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
        const sampleLab = samples[i]!.lab;
        let minDist = Number.POSITIVE_INFINITY;
        for (const swatch of swatches) {
            const dist = labDistance(sampleLab, swatch.lab);
            if (dist < minDist) {
                minDist = dist;
            }
        }
        distances[i] = minDist;
    }

    distances.sort((a, b) => a - b);

    const sum = distances.reduce((acc, d) => acc + d, 0);
    const mean = sum / distances.length;
    const p95 = calculatePercentile(distances, 0.95);

    return { mean, p95 };
}

export function calculateDiversity(swatches: readonly ExtractedSwatch[]): {
    min: number | null;
    mean: number | null;
} {
    if (swatches.length < 2) {
        return { min: null, mean: null };
    }

    const distances: number[] = [];
    for (let i = 0; i < swatches.length; i++) {
        for (let j = i + 1; j < swatches.length; j++) {
            distances.push(labDistance(swatches[i]!.lab, swatches[j]!.lab));
        }
    }

    let min = Number.POSITIVE_INFINITY;
    let sum = 0;
    for (const d of distances) {
        if (d < min) min = d;
        sum += d;
    }

    return {
        min,
        mean: sum / distances.length,
    };
}

export function calculatePopulationConcentration(
    validPixels: number,
    swatches: readonly ExtractedSwatch[],
): { coverage: number; maxProportion: number; entropy: number } {
    if (swatches.length === 0 || validPixels === 0) {
        return { coverage: 0, maxProportion: 0, entropy: 0 };
    }

    const returnedPopulation = swatches.reduce(
        (sum, s) => sum + s.population,
        0,
    );
    const coverage = returnedPopulation / validPixels;

    let maxPop = 0;
    let entropy = 0;

    for (const s of swatches) {
        if (s.population > maxPop) {
            maxPop = s.population;
        }
        const p = s.population / returnedPopulation;
        if (p > 0) {
            entropy -= p * Math.log2(p);
        }
    }

    const maxProportion =
        returnedPopulation > 0 ? maxPop / returnedPopulation : 0;

    return { coverage, maxProportion, entropy };
}

export function calculateDeterminism(
    results: readonly ExtractPaletteResult[],
): boolean {
    if (results.length <= 1) return true;

    const firstSwatches = JSON.stringify(results[0]?.swatches);
    const firstRankings = JSON.stringify(results[0]?.rankings);

    for (let i = 1; i < results.length; i++) {
        if (JSON.stringify(results[i]?.swatches) !== firstSwatches)
            return false;
        if (JSON.stringify(results[i]?.rankings) !== firstRankings)
            return false;
    }

    return true;
}

export function computeQualityMetrics(
    samples: readonly LabSample[],
    results: readonly ExtractPaletteResult[],
): BenchmarkQualityMetrics {
    const primaryResult = results[0];
    if (!primaryResult) {
        throw new Error('No results provided to computeQualityMetrics');
    }
    const swatches = primaryResult.swatches;
    const validPixels = primaryResult.metadata.validPixels;

    const { mean: reconstructionMean, p95: reconstructionP95 } =
        calculateReconstructionError(samples, swatches);

    const { min: diversityMin, mean: diversityMean } =
        calculateDiversity(swatches);

    const { coverage, maxProportion, entropy } =
        calculatePopulationConcentration(validPixels, swatches);

    const determinism = calculateDeterminism(results);

    return {
        reconstructionMean,
        reconstructionP95,
        diversityMin,
        diversityMean,
        coverage,
        maxProportion,
        entropy,
        determinism,
    };
}
