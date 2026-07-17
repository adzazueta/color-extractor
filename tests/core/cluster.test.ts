import { describe, expect, it } from 'vitest';
import { rgbToHsl } from '../../src/core/color/hsl.js';
import { labToXyz } from '../../src/core/color/lab.js';
import { linearToSrgbByte } from '../../src/core/color/srgb.js';
import { xyzToLinearRgb } from '../../src/core/color/xyz.js';
import { DEFAULT_OPTIONS } from '../../src/core/defaults.js';
import { buildClusters, kmeans } from '../../src/core/kmeans.js';
import type { LabSample } from '../../src/core/sample.js';

function sample(
    L: number,
    a: number,
    b: number,
    r: number = 128,
    index: number = 0,
): LabSample {
    return {
        rgb: { r, g: r, b: r },
        lab: { L, a, b },
        index,
    };
}

function clusterA(i: number, n: number): LabSample[] {
    const result: LabSample[] = [];
    for (let j = 0; j < n; j++) {
        result.push(sample(30 + j, 60, 30, 200, i + j));
    }
    return result;
}

function clusterB(i: number, n: number): LabSample[] {
    const result: LabSample[] = [];
    for (let j = 0; j < n; j++) {
        result.push(sample(70 + j, -30, 50, 50, i + j));
    }
    return result;
}

describe('buildClusters', () => {
    describe('AC: each non-empty cluster has population and proportion', () => {
        it('returns k clusters with population and proportion', () => {
            const samples = [...clusterA(0, 10), ...clusterB(100, 10)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            expect(clusters.length).toBe(2);
            for (const c of clusters) {
                expect(c.population).toBeGreaterThan(0);
                expect(c.proportion).toBeGreaterThan(0);
                expect(c.proportion).toBeLessThanOrEqual(1);
            }
        });

        it('proportions sum to 1.0 across all clusters', () => {
            const samples = [...clusterA(0, 10), ...clusterB(100, 10)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            const totalProportion = clusters.reduce(
                (a, c) => a + c.proportion,
                0,
            );
            expect(totalProportion).toBeCloseTo(1.0, 10);
        });

        it('proportion = population / total', () => {
            const samples = [...clusterA(0, 6), ...clusterB(100, 4)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (const c of clusters) {
                expect(c.proportion).toBeCloseTo(
                    c.population / samples.length,
                    10,
                );
            }
        });
    });

    describe('AC: chroma is available for primary and secondary scoring', () => {
        it('chroma = sqrt(a² + b²) from centroid Lab', () => {
            const samples = [...clusterA(0, 10), ...clusterB(100, 10)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (let i = 0; i < clusters.length; i++) {
                const expected = Math.sqrt(
                    kmeansResult.centroids[i]!.a ** 2 +
                        kmeansResult.centroids[i]!.b ** 2,
                );
                expect(clusters[i]!.chroma).toBeCloseTo(expected, 10);
            }
        });

        it('all clusters have a non-negative chroma', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (const c of clusters) {
                expect(c.chroma).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('AC: representative colors can be formatted for output', () => {
        it('derives representative RGB from centroid Lab via lab→xyz→linear→srgb', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (let i = 0; i < clusters.length; i++) {
                const c = clusters[i]!;
                const { x, y, z } = labToXyz(c.lab.L, c.lab.a, c.lab.b);
                const linear = xyzToLinearRgb(x, y, z);
                const expected = {
                    r: linearToSrgbByte(linear.r),
                    g: linearToSrgbByte(linear.g),
                    b: linearToSrgbByte(linear.b),
                };
                expect(c.rgb).toEqual(expected);
            }
        });

        it('HSL matches the representative RGB via rgbToHsl', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (let i = 0; i < clusters.length; i++) {
                const c = clusters[i]!;
                expect(c.hsl).toEqual(rgbToHsl(c.rgb.r, c.rgb.g, c.rgb.b));
            }
        });
    });

    describe('cluster index is preserved', () => {
        it('cluster i has index i', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (let i = 0; i < clusters.length; i++) {
                expect(clusters[i]!.index).toBe(i);
            }
        });
    });

    describe('Cluster shape (all required fields)', () => {
        it('has the expected keys', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            expect(Object.keys(clusters[0]!).sort()).toEqual(
                [
                    'chroma',
                    'hsl',
                    'index',
                    'lab',
                    'population',
                    'proportion',
                    'rgb',
                    'score',
                ].sort(),
            );
        });
    });

    describe('score uses primary scoring preset', () => {
        it('populates score as chroma * log(population + 1) by default (strict)', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            for (const c of clusters) {
                const expected = c.chroma * Math.log(c.population + 1);
                expect(c.score).toBeCloseTo(expected, 10);
            }
        });

        it('uses balanced preset when options provide one', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 2,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult, {
                ...DEFAULT_OPTIONS,
                primary: { preset: 'balanced' },
            });
            for (const c of clusters) {
                const expected = c.chroma ** 1.25 * Math.log(c.population + 1);
                expect(c.score).toBeCloseTo(expected, 10);
            }
        });
    });

    describe('k=1 case', () => {
        it('returns a single cluster with all samples, proportion = 1', () => {
            const samples = [...clusterA(0, 5), ...clusterB(100, 5)];
            const kmeansResult = kmeans(samples, {
                clusters: 1,
                iterations: 10,
            });
            const clusters = buildClusters(samples, kmeansResult);
            expect(clusters.length).toBe(1);
            expect(clusters[0]!.population).toBe(samples.length);
            expect(clusters[0]!.proportion).toBe(1);
        });
    });
});
