import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    generateCorpus,
    generateManifest,
} from '../../benchmarks/corpus/generator.js';
import {
    calculateDiversity,
    calculateReconstructionError,
} from '../../benchmarks/harness/metrics.js';
import { runFixtureBenchmark } from '../../benchmarks/harness/runner.js';
import type { BenchmarkReport } from '../../benchmarks/harness/types.js';

describe('Benchmark Corpus and Harness (ADZ-118)', () => {
    it('generates 12 rights-cleared corpus fixtures with unique valid checksums', () => {
        const corpus = generateCorpus();
        expect(corpus).toHaveLength(12);

        const manifest = generateManifest(corpus);
        expect(manifest.fixtures).toHaveLength(12);

        const ids = new Set<string>();
        for (const f of manifest.fixtures) {
            expect(f.id).toBeTruthy();
            expect(f.checksum).toMatch(/^[a-f0-9]{64}$/);
            expect(f.source).toBe('generated');
            ids.add(f.id);
        }
        expect(ids.size).toBe(12);
    });

    it('calculates reconstruction error correctly', () => {
        const samples = [
            {
                rgb: { r: 200, g: 50, b: 50 },
                lab: { L: 50, a: 60, b: 40 },
                index: 0,
            },
            {
                rgb: { r: 50, g: 200, b: 50 },
                lab: { L: 70, a: -60, b: 50 },
                index: 1,
            },
        ];
        const colors = [
            {
                id: 'color-1' as const,
                hex: '#c83232',
                rgb: { r: 200, g: 50, b: 50 },
                lab: { L: 50, a: 60, b: 40 },
                chroma: 72.1,
                population: 100,
                proportion: 0.5,
                score: 0.9,
            },
            {
                id: 'color-2' as const,
                hex: '#32c832',
                rgb: { r: 50, g: 200, b: 50 },
                lab: { L: 70, a: -60, b: 50 },
                chroma: 78.1,
                population: 100,
                proportion: 0.5,
                score: 0.8,
            },
        ];

        const err = calculateReconstructionError(samples, colors);
        expect(err.mean).toBe(0);
        expect(err.p95).toBe(0);
    });

    it('calculates palette diversity correctly and handles < 2 swatches with null', () => {
        const singleSwatch = [
            {
                id: 'color-1' as const,
                hex: '#c83232',
                rgb: { r: 200, g: 50, b: 50 },
                lab: { L: 50, a: 60, b: 40 },
                chroma: 72.1,
                population: 100,
                proportion: 1.0,
                score: 0.9,
            },
        ];
        const divSingle = calculateDiversity(singleSwatch);
        expect(divSingle.min).toBeNull();
        expect(divSingle.mean).toBeNull();

        const multiSwatches = [
            ...singleSwatch,
            {
                id: 'color-2' as const,
                hex: '#32c832',
                rgb: { r: 50, g: 200, b: 50 },
                lab: { L: 50, a: 60, b: 40 },
                chroma: 72.1,
                population: 100,
                proportion: 1.0,
                score: 0.9,
            },
        ];
        const divMulti = calculateDiversity(multiSwatches);
        expect(divMulti.min).toBe(0);
        expect(divMulti.mean).toBe(0);
    });

    it('runs fixture benchmark and calculates stats and quality metrics', async () => {
        const corpus = generateCorpus();
        const firstFixture = corpus[0]!;

        const result = await runFixtureBenchmark(firstFixture, {
            warmupRuns: 2,
            measuredRuns: 3,
        });

        expect(result.fixtureId).toBe(firstFixture.manifest.id);
        expect(result.algorithm).toBe('lab-kmeans');
        expect(result.timing.measuredRuns).toBe(3);
        expect(result.timing.minMs).toBeGreaterThanOrEqual(0);
        expect(result.quality.determinism).toBe(true);
        expect(result.quality.coverage).toBeGreaterThan(0);
    });

    it('verifies checked-in 0.2 baseline report exists and conforms to schema', () => {
        const baselinePath = resolve(
            __dirname,
            '../../benchmarks/baselines/lab-kmeans-v0.2.json',
        );
        expect(existsSync(baselinePath)).toBe(true);

        const content = readFileSync(baselinePath, 'utf8');
        const report = JSON.parse(content) as BenchmarkReport;

        expect(report.suite).toBe('core');
        expect(report.algorithm).toBe('lab-kmeans');
        expect(report.summary.totalFixtures).toBe(12);
        expect(report.summary.determinismAll).toBe(true);
        expect(report.results).toHaveLength(12);
    });
});
