import { labSquaredDistance } from '../../src/core/color/lab.js';
import type {
    ExtractColorResult,
    ObservedColor,
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
    colors: readonly ObservedColor[],
): { mean: number; p95: number } {
    if (samples.length === 0 || colors.length === 0) {
        return { mean: 0, p95: 0 };
    }

    const distances: number[] = new Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
        const sampleLab = samples[i]!.lab;
        let minDist = Number.POSITIVE_INFINITY;
        for (const color of colors) {
            const dist = labDistance(sampleLab, color.lab);
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

export function calculateDiversity(colors: readonly ObservedColor[]): {
    min: number | null;
    mean: number | null;
} {
    if (colors.length < 2) {
        return { min: null, mean: null };
    }

    const distances: number[] = [];
    for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
            distances.push(labDistance(colors[i]!.lab, colors[j]!.lab));
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
    colors: readonly ObservedColor[],
): { coverage: number; maxProportion: number; entropy: number } {
    if (colors.length === 0 || validPixels === 0) {
        return { coverage: 0, maxProportion: 0, entropy: 0 };
    }

    const returnedPopulation = colors.reduce((sum, s) => sum + s.population, 0);
    const coverage = returnedPopulation / validPixels;

    let maxPop = 0;
    let entropy = 0;

    for (const s of colors) {
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
    results: readonly ExtractColorResult[],
): boolean {
    if (results.length <= 1) return true;

    const firstColors = JSON.stringify(results[0]?.colors);
    const firstRankings = JSON.stringify(results[0]?.rankings);

    for (let i = 1; i < results.length; i++) {
        if (JSON.stringify(results[i]?.colors) !== firstColors) return false;
        if (JSON.stringify(results[i]?.rankings) !== firstRankings)
            return false;
    }

    return true;
}

export function computeQualityMetrics(
    samples: readonly LabSample[],
    results: readonly ExtractColorResult[],
): BenchmarkQualityMetrics {
    const primaryResult = results[0];
    if (!primaryResult) {
        throw new Error('No results provided to computeQualityMetrics');
    }
    const colors = primaryResult.colors;
    const validPixels = primaryResult.metadata.validPixels;

    const { mean: reconstructionMean, p95: reconstructionP95 } =
        calculateReconstructionError(samples, colors);

    const { min: diversityMin, mean: diversityMean } =
        calculateDiversity(colors);

    const { coverage, maxProportion, entropy } =
        calculatePopulationConcentration(validPixels, colors);

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
