import { describe, expect, it } from 'vitest';
import { initializeCentroids, kmeans } from '../../src/core/kmeans.js';
import type { LabSample } from '../../src/core/sample.js';

function sample(L: number, index: number = 0): LabSample {
    return {
        rgb: { r: 128, g: 128, b: 128 },
        lab: { L, a: 0, b: 0 },
        index,
    };
}

describe('kmeans — validation (reviewer finding #1)', () => {
    describe('clusters parameter', () => {
        it('throws for NaN clusters', () => {
            expect(() =>
                kmeans([sample(50, 0)], {
                    clusters: Number.NaN,
                    iterations: 1,
                }),
            ).toThrow(RangeError);
        });

        it('throws for Infinity clusters', () => {
            expect(() =>
                kmeans([sample(50, 0)], {
                    clusters: Number.POSITIVE_INFINITY,
                    iterations: 1,
                }),
            ).toThrow(RangeError);
        });

        it('throws for fractional clusters', () => {
            expect(() =>
                kmeans([sample(50, 0)], { clusters: 1.5, iterations: 1 }),
            ).toThrow(RangeError);
        });

        it('throws for zero clusters', () => {
            expect(() =>
                kmeans([sample(50, 0)], { clusters: 0, iterations: 1 }),
            ).toThrow(RangeError);
        });

        it('throws for negative clusters', () => {
            expect(() =>
                kmeans([sample(50, 0)], { clusters: -1, iterations: 1 }),
            ).toThrow(RangeError);
        });

        it('throws when clusters > samples.length', () => {
            expect(() =>
                kmeans([sample(50, 0), sample(50, 1)], {
                    clusters: 5,
                    iterations: 1,
                }),
            ).toThrow(RangeError);
        });
    });

    describe('iterations parameter', () => {
        it('throws for NaN iterations', () => {
            expect(() =>
                kmeans([sample(50, 0)], {
                    clusters: 1,
                    iterations: Number.NaN,
                }),
            ).toThrow(RangeError);
        });

        it('throws for Infinity iterations', () => {
            expect(() =>
                kmeans([sample(50, 0)], {
                    clusters: 1,
                    iterations: Number.POSITIVE_INFINITY,
                }),
            ).toThrow(RangeError);
        });

        it('throws for fractional iterations', () => {
            expect(() =>
                kmeans([sample(50, 0)], { clusters: 1, iterations: 1.5 }),
            ).toThrow(RangeError);
        });

        it('throws for negative iterations', () => {
            expect(() =>
                kmeans([sample(50, 0)], { clusters: 1, iterations: -1 }),
            ).toThrow(RangeError);
        });

        it('accepts 0 iterations (initial state only)', () => {
            expect(() =>
                kmeans([sample(50, 0)], { clusters: 1, iterations: 0 }),
            ).not.toThrow();
        });
    });

    describe('does not infinite loop', () => {
        it('terminates with Infinity iterations (rejected by validation)', () => {
            const samples = Array.from({ length: 10 }, (_, i) =>
                sample(50 + i, i),
            );
            expect(() =>
                kmeans(samples, {
                    clusters: 2,
                    iterations: Number.POSITIVE_INFINITY,
                }),
            ).toThrow(RangeError);
        });
    });
});

describe('initializeCentroids — validation', () => {
    it('throws for NaN k', () => {
        expect(() => initializeCentroids([sample(50, 0)], Number.NaN)).toThrow(
            RangeError,
        );
    });

    it('throws for fractional k', () => {
        expect(() => initializeCentroids([sample(50, 0)], 1.5)).toThrow(
            RangeError,
        );
    });
});

function assignBySquaredDistance(
    samples: LabSample[],
    centroids: readonly { L: number; a: number; b: number }[],
): number[] {
    return samples.map((s) => {
        let bestIdx = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < centroids.length; i++) {
            const c = centroids[i]!;
            const dL = s.lab.L - c.L;
            const da = s.lab.a - c.a;
            const db = s.lab.b - c.b;
            const dist = dL * dL + da * da + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        return bestIdx;
    });
}

function meanCentroids(
    samples: LabSample[],
    assignments: readonly number[],
    k: number,
): { L: number; a: number; b: number }[] {
    const sums: { L: number; a: number; b: number }[] = Array.from(
        { length: k },
        () => ({ L: 0, a: 0, b: 0 }),
    );
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < samples.length; i++) {
        const c = assignments[i]!;
        const lab = samples[i]!.lab;
        sums[c]!.L += lab.L;
        sums[c]!.a += lab.a;
        sums[c]!.b += lab.b;
        counts[c]!++;
    }
    return sums.map((s, j) => {
        if (counts[j] === 0) return s;
        return {
            L: s.L / counts[j]!,
            a: s.a / counts[j]!,
            b: s.b / counts[j]!,
        };
    });
}

describe('kmeans — iterations count (exactly N recomputations)', () => {
    it('iterations: 0 recomputes centroids once after the initial assignment', () => {
        const samples = [
            sample(0, 0),
            sample(1, 1),
            sample(2, 2),
            sample(4, 3),
        ];
        const initial = initializeCentroids(samples, 2);
        const initialLabs = initial.map((s) => s.lab);
        const initialAssignment = assignBySquaredDistance(samples, initialLabs);
        const expected = meanCentroids(samples, initialAssignment, 2);
        const result = kmeans(samples, { clusters: 2, iterations: 0 });
        for (let i = 0; i < 2; i++) {
            expect(result.centroids[i]!.L).toBeCloseTo(expected[i]!.L, 6);
        }
    });

    it('iterations: 1 → centroids after final reassignment (2 recomputes)', () => {
        const samples = [
            sample(0, 0),
            sample(1, 1),
            sample(2, 2),
            sample(4, 3),
        ];
        const initial = initializeCentroids(samples, 2);
        let centroids = initial.map((s) => s.lab);
        let assignments = assignBySquaredDistance(samples, centroids);

        // loop iteration 0
        centroids = meanCentroids(samples, assignments, 2);
        assignments = assignBySquaredDistance(samples, centroids);

        // recompute after loop with the final assignments
        const expected = meanCentroids(samples, assignments, 2);

        const result = kmeans(samples, { clusters: 2, iterations: 1 });
        for (let i = 0; i < 2; i++) {
            expect(result.centroids[i]!.L).toBeCloseTo(expected[i]!.L, 6);
        }
    });

    it('iterations: 2 → centroids after final reassignment (3 recomputes)', () => {
        const samples = [
            sample(0, 0),
            sample(1, 1),
            sample(2, 2),
            sample(4, 3),
        ];
        const initial = initializeCentroids(samples, 2);
        let centroids = initial.map((s) => s.lab);
        let assignments = assignBySquaredDistance(samples, centroids);
        centroids = meanCentroids(samples, assignments, 2);
        assignments = assignBySquaredDistance(samples, centroids);
        centroids = meanCentroids(samples, assignments, 2);
        assignments = assignBySquaredDistance(samples, centroids);

        // recompute after loop with the final assignments
        const expected = meanCentroids(samples, assignments, 2);

        const result = kmeans(samples, { clusters: 2, iterations: 2 });
        for (let i = 0; i < 2; i++) {
            expect(result.centroids[i]!.L).toBeCloseTo(expected[i]!.L, 6);
        }
    });

    it('returns assignments associated with the returned centroids (the last re-assign)', () => {
        const samples = [
            sample(0, 0),
            sample(1, 1),
            sample(2, 2),
            sample(4, 3),
        ];
        const initial = initializeCentroids(samples, 2);
        let centroids = initial.map((s) => s.lab);
        let assignments = assignBySquaredDistance(samples, centroids);
        centroids = meanCentroids(samples, assignments, 2);
        assignments = assignBySquaredDistance(samples, centroids);
        const result = kmeans(samples, { clusters: 2, iterations: 1 });
        expect(result.assignments).toEqual(assignments);
    });

    it('populations are consistent with assignments', () => {
        const samples = Array.from({ length: 10 }, (_, i) => sample(50 + i, i));
        const result = kmeans(samples, { clusters: 3, iterations: 5 });
        const popFromAssignments = new Array(3).fill(0);
        for (const a of result.assignments) {
            popFromAssignments[a]!++;
        }
        expect(result.populations).toEqual(popFromAssignments);
    });

    it('populations sum to total samples (no missing or double-counted)', () => {
        const samples = Array.from({ length: 20 }, (_, i) =>
            sample(50 + (i % 7) * 5, i),
        );
        const result = kmeans(samples, { clusters: 4, iterations: 7 });
        const total = result.populations.reduce((a, b) => a + b, 0);
        expect(total).toBe(samples.length);
    });
});
