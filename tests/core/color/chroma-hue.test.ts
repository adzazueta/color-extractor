import { describe, expect, it } from 'vitest';
import {
    chromaFromLab,
    circularHueDistance,
    hueFromLab,
    normalizeHue,
} from '../../../src/core/color/chroma-hue.js';

describe('chromaFromLab', () => {
    describe('boundary cases', () => {
        it('(0, 0) → 0', () => {
            expect(chromaFromLab(0, 0)).toBe(0);
        });

        it('pure a channel: (3, 0) → 3', () => {
            expect(chromaFromLab(3, 0)).toBe(3);
        });

        it('pure b channel: (0, 4) → 4', () => {
            expect(chromaFromLab(0, 4)).toBe(4);
        });
    });

    describe('magnitude', () => {
        it('3-4-5 triangle: (3, 4) → 5', () => {
            expect(chromaFromLab(3, 4)).toBe(5);
        });

        it('sign of a does not matter: (-3, 4) → 5', () => {
            expect(chromaFromLab(-3, 4)).toBe(5);
        });

        it('sign of b does not matter: (3, -4) → 5', () => {
            expect(chromaFromLab(3, -4)).toBe(5);
        });

        it('both negative: (-3, -4) → 5', () => {
            expect(chromaFromLab(-3, -4)).toBe(5);
        });

        it('larger values: (60, 80) → 100', () => {
            expect(chromaFromLab(60, 80)).toBe(100);
        });
    });

    describe('monotonicity', () => {
        it('chroma grows monotonically with distance from origin', () => {
            let prev = chromaFromLab(0, 0);
            for (let r = 1; r <= 100; r++) {
                const c = chromaFromLab(r, 0);
                expect(c).toBeGreaterThanOrEqual(prev);
                prev = c;
            }
        });
    });
});

describe('normalizeHue', () => {
    describe('in-range values', () => {
        it('0 → 0', () => {
            expect(normalizeHue(0)).toBe(0);
        });

        it('180 → 180', () => {
            expect(normalizeHue(180)).toBe(180);
        });

        it('359 → 359', () => {
            expect(normalizeHue(359)).toBe(359);
        });
    });

    describe('wraparound at 360', () => {
        it('360 → 0', () => {
            expect(normalizeHue(360)).toBe(0);
        });

        it('361 → 1', () => {
            expect(normalizeHue(361)).toBe(1);
        });

        it('720 → 0', () => {
            expect(normalizeHue(720)).toBe(0);
        });

        it('725 → 5', () => {
            expect(normalizeHue(725)).toBe(5);
        });
    });

    describe('negative values', () => {
        it('-1 → 359', () => {
            expect(normalizeHue(-1)).toBe(359);
        });

        it('-180 → 180', () => {
            expect(normalizeHue(-180)).toBe(180);
        });

        it('-360 → 0', () => {
            expect(normalizeHue(-360)).toBe(0);
        });

        it('-361 → 359', () => {
            expect(normalizeHue(-361)).toBe(359);
        });

        it('-720 → 0', () => {
            expect(normalizeHue(-720)).toBe(0);
        });
    });

    describe('output range', () => {
        it('always in [0, 360) for any real input', () => {
            const samples = [
                -1000, -720.5, -361, -1, 0, 1, 180, 359, 359.9, 360, 720, 1500,
            ];
            for (const v of samples) {
                const r = normalizeHue(v);
                expect(r).toBeGreaterThanOrEqual(0);
                expect(r).toBeLessThan(360);
            }
        });
    });
});

describe('hueFromLab', () => {
    describe('cardinal directions', () => {
        it('pure +a (1, 0) → 0', () => {
            expect(hueFromLab(1, 0)).toBeCloseTo(0, 12);
        });

        it('pure +b (0, 1) → 90', () => {
            expect(hueFromLab(0, 1)).toBeCloseTo(90, 12);
        });

        it('pure -a (-1, 0) → 180', () => {
            expect(hueFromLab(-1, 0)).toBeCloseTo(180, 12);
        });

        it('pure -b (0, -1) → 270', () => {
            expect(hueFromLab(0, -1)).toBeCloseTo(270, 12);
        });
    });

    describe('45° increments', () => {
        it('(1, 1) → 45', () => {
            expect(hueFromLab(1, 1)).toBeCloseTo(45, 12);
        });

        it('(-1, 1) → 135', () => {
            expect(hueFromLab(-1, 1)).toBeCloseTo(135, 12);
        });

        it('(-1, -1) → 225', () => {
            expect(hueFromLab(-1, -1)).toBeCloseTo(225, 12);
        });

        it('(1, -1) → 315', () => {
            expect(hueFromLab(1, -1)).toBeCloseTo(315, 12);
        });
    });

    describe('output range', () => {
        it('always in [0, 360) for any (a, b) except (0, 0)', () => {
            const samples: Array<[number, number]> = [
                [100, 0],
                [0, 100],
                [-100, 0],
                [0, -100],
                [50, 50],
                [-50, 50],
                [-50, -50],
                [50, -50],
                [1, -0.001],
                [0.001, 1],
            ];
            for (const [a, b] of samples) {
                const h = hueFromLab(a, b);
                expect(h).toBeGreaterThanOrEqual(0);
                expect(h).toBeLessThan(360);
            }
        });
    });
});

describe('circularHueDistance', () => {
    describe('identity', () => {
        it('distance from a hue to itself is zero', () => {
            expect(circularHueDistance(45, 45)).toBe(0);
        });

        it('distance 0,0 is zero', () => {
            expect(circularHueDistance(0, 0)).toBe(0);
        });

        it('distance across the 0/360 boundary is zero', () => {
            expect(circularHueDistance(0, 360)).toBe(0);
        });
    });

    describe('gherkin: hue 359 vs hue 1', () => {
        it('distance is 2 degrees (wraparound)', () => {
            expect(circularHueDistance(359, 1)).toBe(2);
        });

        it('symmetric: d(1, 359) is also 2', () => {
            expect(circularHueDistance(1, 359)).toBe(2);
        });
    });

    describe('symmetry', () => {
        it('d(a, b) === d(b, a) for several pairs', () => {
            const pairs: Array<[number, number]> = [
                [0, 90],
                [10, 350],
                [180, 200],
                [270, 90],
                [359, 1],
                [45, 225],
            ];
            for (const [a, b] of pairs) {
                expect(circularHueDistance(a, b)).toBe(
                    circularHueDistance(b, a),
                );
            }
        });
    });

    describe('specific reference values', () => {
        it('opposite hues → 180', () => {
            expect(circularHueDistance(0, 180)).toBe(180);
            expect(circularHueDistance(90, 270)).toBe(180);
        });

        it('90° apart → 90', () => {
            expect(circularHueDistance(0, 90)).toBe(90);
            expect(circularHueDistance(90, 180)).toBe(90);
        });

        it('270° apart (the long way) → 90 (shortest)', () => {
            expect(circularHueDistance(0, 270)).toBe(90);
        });

        it('small forward diff is the diff itself', () => {
            expect(circularHueDistance(10, 30)).toBe(20);
        });

        it('small backward diff is the diff itself', () => {
            expect(circularHueDistance(30, 10)).toBe(20);
        });

        it('near-boundary wraparound: 350 vs 10 → 20', () => {
            expect(circularHueDistance(350, 10)).toBe(20);
        });
    });

    describe('normalization of inputs', () => {
        it('out-of-range inputs are normalized first', () => {
            expect(circularHueDistance(370, 10)).toBe(0);
            expect(circularHueDistance(-10, 350)).toBe(0);
            expect(circularHueDistance(720, 720)).toBe(0);
        });
    });

    describe('result range', () => {
        it('always in [0, 180] (shortest arc)', () => {
            for (let a = 0; a < 360; a += 30) {
                for (let b = 0; b < 360; b += 30) {
                    const d = circularHueDistance(a, b);
                    expect(d).toBeGreaterThanOrEqual(0);
                    expect(d).toBeLessThanOrEqual(180);
                }
            }
        });
    });
});
