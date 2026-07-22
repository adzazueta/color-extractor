import { execSync } from 'node:child_process';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { extractPaletteFromPixels } from '../../src/core/extract.js';
import { passesFilter } from '../../src/core/filter.js';
import type { BaseExtractPaletteOptions } from '../../src/core/neutral-options.js';
import type { ExtractPaletteResult } from '../../src/core/palette-types.js';
import { normalizePixels } from '../../src/core/pixels.js';
import {
    convertRgbSamplesToLab,
    sampleSquareGrid,
} from '../../src/core/sample.js';
import { VERSION } from '../../src/generated/version.js';
import type { BenchmarkFixtureData } from '../corpus/manifest.js';
import { computeQualityMetrics } from './metrics.js';
import type {
    BenchmarkEnvironment,
    BenchmarkFixtureResult,
    BenchmarkReport,
    BenchmarkTimingStats,
} from './types.js';

export function getSystemEnvironment(): BenchmarkEnvironment {
    let gitCommit = 'unknown';
    try {
        gitCommit = execSync('git rev-parse --short HEAD', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
    } catch {
        // Fallback if git unavailable
    }

    return {
        nodeVersion: process.version,
        os: `${os.type()} ${os.arch()} ${os.release()}`,
        cpu: os.cpus()[0]?.model ?? 'Unknown CPU',
        cores: os.cpus().length,
        timestamp: new Date().toISOString(),
        packageVersion: VERSION,
        gitCommit,
    };
}

export function computeTimingStats(
    durationsMs: readonly number[],
    warmupRuns: number,
): BenchmarkTimingStats {
    const sorted = [...durationsMs].sort((a, b) => a - b);
    const n = sorted.length;
    const minMs = sorted[0] ?? 0;
    const maxMs = sorted[n - 1] ?? 0;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const meanMs = sum / n;

    const medianMs =
        n % 2 === 0
            ? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
            : (sorted[Math.floor(n / 2)] ?? 0);

    const p95Index = Math.min(n - 1, Math.floor(n * 0.95));
    const p95Ms = sorted[p95Index] ?? 0;

    const variance = sorted.reduce((acc, d) => acc + (d - meanMs) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const cv = meanMs > 0 ? stdDev / meanMs : 0;

    return {
        minMs,
        medianMs,
        p95Ms,
        maxMs,
        meanMs,
        cv,
        warmupRuns,
        measuredRuns: n,
    };
}

export type RunnerOptions = {
    warmupRuns?: number;
    measuredRuns?: number;
    options?: BaseExtractPaletteOptions;
};

export async function runFixtureBenchmark(
    fixture: BenchmarkFixtureData,
    runnerOptions: RunnerOptions = {},
): Promise<BenchmarkFixtureResult> {
    const warmupRuns = runnerOptions.warmupRuns ?? 5;
    const measuredRuns = runnerOptions.measuredRuns ?? 20;
    const options = runnerOptions.options ?? {};

    // 1. Warmup runs (excluded from timing stats)
    for (let i = 0; i < warmupRuns; i++) {
        await extractPaletteFromPixels(fixture.pixels, options);
    }

    // 2. Measured timing runs (timed strictly around extraction)
    const durationsMs: number[] = [];
    const results: ExtractPaletteResult[] = [];

    for (let i = 0; i < measuredRuns; i++) {
        const start = performance.now();
        const res = await extractPaletteFromPixels(fixture.pixels, options);
        const end = performance.now();
        durationsMs.push(end - start);
        results.push(res);
    }

    const timingStats = computeTimingStats(durationsMs, warmupRuns);

    // 3. Extract sample set for quality metrics calculation
    const maxDim = options.sampling?.maxDimension ?? 150;
    const normalized = normalizePixels(
        fixture.pixels.data,
        fixture.pixels.width,
        fixture.pixels.height,
        fixture.pixels.channels,
    );
    const gridSamples = sampleSquareGrid(normalized, maxDim);

    const filterCriteria = {
        alphaThreshold: options.filtering?.alphaThreshold ?? 128,
        minBrightness: options.filtering?.minBrightness ?? 10,
        maxBrightness: options.filtering?.maxBrightness ?? 245,
        minSaturation: options.filtering?.minSaturation ?? 8,
    };

    const validPixels = gridSamples.filter((p) =>
        passesFilter(p, filterCriteria),
    );
    const labSamples = convertRgbSamplesToLab(validPixels);

    const qualityMetrics = computeQualityMetrics(labSamples, results);

    const primary = results[0];
    if (!primary) {
        throw new Error(
            `No benchmark results produced for fixture ${fixture.manifest.id}`,
        );
    }

    return {
        fixtureId: fixture.manifest.id,
        category: fixture.manifest.category,
        width: fixture.pixels.width,
        height: fixture.pixels.height,
        validPixels: primary.metadata.validPixels,
        algorithm: primary.metadata.algorithm,
        algorithmVersion: primary.metadata.algorithmVersion,
        timing: timingStats,
        quality: qualityMetrics,
        candidateCount: primary.metadata.candidateCount,
        returnedColors: primary.metadata.returnedColors,
        algorithmDetails: primary.metadata.algorithmDetails ?? {},
    };
}

export async function runBenchmarkSuite(
    corpus: readonly BenchmarkFixtureData[],
    runnerOptions: RunnerOptions = {},
): Promise<BenchmarkReport> {
    const env = getSystemEnvironment();
    const results: BenchmarkFixtureResult[] = [];

    for (const fixture of corpus) {
        const res = await runFixtureBenchmark(fixture, runnerOptions);
        results.push(res);
    }

    const totalFixtures = results.length;
    const medianMsAggregate =
        results.reduce((sum, r) => sum + r.timing.medianMs, 0) / totalFixtures;
    const p95MsAggregate =
        results.reduce((sum, r) => sum + r.timing.p95Ms, 0) / totalFixtures;
    const reconstructionMeanAggregate =
        results.reduce((sum, r) => sum + r.quality.reconstructionMean, 0) /
        totalFixtures;

    const diversityList = results
        .map((r) => r.quality.diversityMean)
        .filter((d): d is number => d !== null);

    const diversityMeanAggregate =
        diversityList.length > 0
            ? diversityList.reduce((sum, d) => sum + d, 0) /
              diversityList.length
            : null;

    const determinismAll = results.every((r) => r.quality.determinism);

    const first = results[0];

    return {
        suite: 'core',
        environment: env,
        algorithm: first?.algorithm ?? 'lab-kmeans',
        algorithmVersion: first?.algorithmVersion ?? '1.0.0',
        options: (runnerOptions.options ?? {}) as Record<string, unknown>,
        corpusChecksum: corpus
            .map((c) => c.manifest.checksum)
            .join(',')
            .slice(0, 16),
        summary: {
            totalFixtures,
            medianMsAggregate,
            p95MsAggregate,
            reconstructionMeanAggregate,
            diversityMeanAggregate,
            determinismAll,
        },
        results,
    };
}
