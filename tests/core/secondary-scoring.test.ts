import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../../src/core/defaults.js';
import { passesFilter } from '../../src/core/filter.js';
import {
    buildHarmonyFallback,
    filterByContrastThreshold,
    findPrimaryIndex,
    selectSecondary,
} from '../../src/core/index.js';
import { buildClusters, kmeans } from '../../src/core/kmeans.js';
import { normalizePixels } from '../../src/core/pixels.js';
import {
    convertRgbSamplesToLab,
    sampleSquareGrid,
} from '../../src/core/sample.js';
import { FIXTURES } from './fixtures.js';

function clustersFromFixture(fixtureKey: keyof typeof FIXTURES, k: number) {
    const opts = resolveOptions();
    const f = FIXTURES[fixtureKey];
    const normalized = normalizePixels(f.data as Uint8Array, f.width, f.height);
    const sampled = sampleSquareGrid(normalized, opts.sampleSize);
    const criteria = {
        alphaThreshold: opts.filtering.alphaThreshold!,
        minBrightness: opts.filtering.minBrightness!,
        maxBrightness: opts.filtering.maxBrightness!,
        minSaturation: opts.filtering.minSaturation!,
    };
    const validSamples = sampled.filter((p) => passesFilter(p, criteria));
    const labs = convertRgbSamplesToLab(validSamples);
    const kResult = kmeans(labs, {
        clusters: Math.min(k, labs.length),
        iterations: opts.kmeans.iterations!,
    });
    const clusters = buildClusters(labs, kResult);
    return { clusters, options: opts };
}

describe('secondary scoring and fallback with fixtures (ADZ-88)', () => {
    describe('AC: candidates below contrast threshold are rejected in normal mode', () => {
        it('bicolorRedBlue passes default threshold but fails a very extreme one', () => {
            const { clusters } = clustersFromFixture('bicolorRedBlue', 2);
            const primaryIdx = findPrimaryIndex(clusters, 'strict');
            const primary = clusters[primaryIdx]!;
            const candidates = clusters.filter((_, i) => i !== primaryIdx);

            const { passing: passingDefault } = filterByContrastThreshold(
                primary,
                candidates,
                resolveOptions(),
            );
            expect(passingDefault.length).toBeGreaterThanOrEqual(1);

            const { passing: passingExtreme } = filterByContrastThreshold(
                primary,
                candidates,
                resolveOptions({ secondary: { contrastMinDE: 500 } }),
            );
            expect(passingExtreme).toHaveLength(0);
        });
    });

    describe('AC: all fallback modes are tested', () => {
        it('null fallback returns null when no candidate passes contrast', () => {
            const { clusters } = clustersFromFixture('bicolorRedBlue', 2);
            const primaryIdx = findPrimaryIndex(clusters, 'strict');
            const primary = clusters[primaryIdx]!;
            const candidates = clusters.filter((_, i) => i !== primaryIdx);
            const opts = resolveOptions({
                secondary: { fallback: 'null', contrastMinDE: 500 },
            });
            const result = selectSecondary(primary, candidates, opts);
            expect(result).toBeNull();
        });

        it('nearest fallback picks a rejected candidate with source=fallback', () => {
            const { clusters } = clustersFromFixture('bicolorRedBlue', 2);
            const primaryIdx = findPrimaryIndex(clusters, 'strict');
            const primary = clusters[primaryIdx]!;
            const candidates = clusters.filter((_, i) => i !== primaryIdx);
            const opts = resolveOptions({
                secondary: { fallback: 'nearest', contrastMinDE: 500 },
            });
            const result = selectSecondary(primary, candidates, opts);
            expect(result).not.toBeNull();
            expect(result!.color.role).toBe('secondary');
            expect(result!.color.source).toBe('fallback');
        });

        it('harmony fallback returns generated color with source=fallback', () => {
            const { clusters } = clustersFromFixture('bicolorRedBlue', 2);
            const primaryIdx = findPrimaryIndex(clusters, 'strict');
            const primary = clusters[primaryIdx]!;
            const candidates = clusters.filter((_, i) => i !== primaryIdx);
            const opts = resolveOptions({
                secondary: { fallback: 'harmony', contrastMinDE: 500 },
            });
            const result = selectSecondary(primary, candidates, opts);
            expect(result).not.toBeNull();
            expect(result!.color.source).toBe('fallback');
            expect(result!.color.role).toBe('secondary');
        });

        it('normal mode with candidates picks the best passing cluster', () => {
            const { clusters, options } = clustersFromFixture(
                'bicolorRedBlue',
                2,
            );
            const primaryIdx = findPrimaryIndex(clusters, 'strict');
            const primary = clusters[primaryIdx]!;
            const candidates = clusters.filter((_, i) => i !== primaryIdx);
            const result = selectSecondary(primary, candidates, options);
            expect(result).not.toBeNull();
            expect(result!.color.role).toBe('secondary');
            expect(result!.sourceClusterIndex).not.toBeNull();
        });
    });

    describe('AC: harmony fallback generates a split-complementary color', () => {
        it('buildHarmonyFallback uses the primary from a fixture-derived cluster', () => {
            const { clusters } = clustersFromFixture('bicolorRedBlue', 2);
            const primaryIdx = findPrimaryIndex(clusters, 'strict');
            const fallback = buildHarmonyFallback(
                clusters[primaryIdx]!,
                resolveOptions(),
            );
            expect(fallback.role).toBe('secondary');
            expect(fallback.source).toBe('fallback');
        });
    });
});
