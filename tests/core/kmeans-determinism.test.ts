import { describe, expect, it } from 'vitest';
import { initializeCentroids, kmeans } from '../../src/core/kmeans.js';
import { normalizePixels } from '../../src/core/pixels.js';
import {
    convertRgbSamplesToLab,
    sampleSquareGrid,
} from '../../src/core/sample.js';
import { FIXTURES } from './fixtures.js';

function runPipeline(fixtureKey: keyof typeof FIXTURES, k: number = 5) {
    const fixture = FIXTURES[fixtureKey];
    const normalized = normalizePixels(
        fixture.data as Uint8Array,
        fixture.width,
        fixture.height,
    );
    const sampled = sampleSquareGrid(normalized, 150);
    const labs = convertRgbSamplesToLab(sampled);
    const result = kmeans(labs, { clusters: k, iterations: 7 });
    return { kmeansResult: result, labs };
}

describe('deterministic K-means (ADZ-87)', () => {
    describe('AC: same pixels produce same results', () => {
        it('bicolorRedBlue fixture is deterministic across two runs', () => {
            const a = runPipeline('bicolorRedBlue', 2);
            const b = runPipeline('bicolorRedBlue', 2);
            expect(a.kmeansResult.centroids).toEqual(b.kmeansResult.centroids);
            expect(a.kmeansResult.populations).toEqual(
                b.kmeansResult.populations,
            );
            expect(a.kmeansResult.assignments).toEqual(
                b.kmeansResult.assignments,
            );
        });

        it('mutedPlusVivid fixture is deterministic across two runs', () => {
            const a = runPipeline('mutedPlusVivid', 3);
            const b = runPipeline('mutedPlusVivid', 3);
            expect(a.kmeansResult.centroids).toEqual(b.kmeansResult.centroids);
            expect(a.kmeansResult.populations).toEqual(
                b.kmeansResult.populations,
            );
        });

        it('rainbowPalette fixture is deterministic across two runs', () => {
            const a = runPipeline('rainbowPalette', 5);
            const b = runPipeline('rainbowPalette', 5);
            expect(a.kmeansResult.centroids).toEqual(b.kmeansResult.centroids);
            expect(a.kmeansResult.populations).toEqual(
                b.kmeansResult.populations,
            );
        });
    });

    describe('AC: initialization determinism', () => {
        it('initializeCentroids on actual fixture data is deterministic', () => {
            const f = FIXTURES.multiColorPalette;
            const normalized = normalizePixels(
                f.data as Uint8Array,
                f.width,
                f.height,
            );
            const sampled = sampleSquareGrid(normalized, 150);
            const labs = convertRgbSamplesToLab(sampled);
            const a = initializeCentroids(labs, 4);
            const b = initializeCentroids(labs, 4);
            expect(a).toEqual(b);
        });
    });

    describe('empty cluster handling with fixtures', () => {
        it('does not crash when given a monochrome fixture with many clusters', () => {
            const f = FIXTURES.monochrome;
            const normalized = normalizePixels(
                f.data as Uint8Array,
                f.width,
                f.height,
            );
            const sampled = sampleSquareGrid(normalized, 150);
            const labs = convertRgbSamplesToLab(sampled);
            expect(() =>
                kmeans(labs, { clusters: 10, iterations: 7 }),
            ).not.toThrow();
            const result = kmeans(labs, { clusters: 10, iterations: 7 });
            expect(result.centroids).toHaveLength(10);
            expect(result.populations).toHaveLength(10);
        });
    });
});
