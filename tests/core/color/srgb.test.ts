import { describe, expect, it } from 'vitest';
import {
    srgbByteToLinear,
    srgbToLinear,
} from '../../../src/core/color/srgb.js';

function referenceEOTF(normalized: number): number {
    if (normalized <= 0.04045) return normalized / 12.92;
    return ((normalized + 0.055) / 1.055) ** 2.4;
}

describe('srgbToLinear', () => {
    describe('boundary cases', () => {
        it('0 maps to 0', () => {
            expect(srgbToLinear(0)).toBe(0);
        });

        it('1 maps to 1', () => {
            expect(srgbToLinear(1)).toBeCloseTo(1, 12);
        });

        it('at threshold 0.04045 uses the linear branch', () => {
            expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 12);
        });

        it('just above threshold uses the power branch', () => {
            const above = 0.04046;
            const linear = above / 12.92;
            const power = ((above + 0.055) / 1.055) ** 2.4;
            expect(srgbToLinear(above)).toBeCloseTo(power, 12);
            expect(srgbToLinear(above)).not.toBeCloseTo(linear, 12);
        });
    });

    describe('reference values across [0, 1]', () => {
        const samples = [0, 0.04045, 0.1, 0.25, 0.5, 0.75, 1];
        it.each(samples)('srgbToLinear(%.5f) matches reference EOTF', (v) => {
            expect(srgbToLinear(v)).toBeCloseTo(referenceEOTF(v), 12);
        });
    });

    describe('continuity at threshold', () => {
        it('no jump between linear and power branches', () => {
            const below = srgbToLinear(0.04045);
            const above = srgbToLinear(0.04046);
            expect(Math.abs(above - below)).toBeLessThan(1e-6);
        });
    });

    describe('monotonicity', () => {
        it('output is non-decreasing over [0, 1]', () => {
            let prev = 0;
            for (let i = 0; i <= 1000; i++) {
                const v = srgbToLinear(i / 1000);
                expect(v).toBeGreaterThanOrEqual(prev);
                prev = v;
            }
        });
    });

    describe('range', () => {
        it('output stays within [0, 1] for input in [0, 1]', () => {
            for (let i = 0; i <= 255; i++) {
                const v = srgbToLinear(i / 255);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        });
    });
});

describe('srgbByteToLinear', () => {
    it('composes normalization and EOTF: srgbByteToLinear(b) === srgbToLinear(b/255)', () => {
        for (const b of [0, 1, 10, 11, 50, 100, 128, 200, 255]) {
            expect(srgbByteToLinear(b)).toBeCloseTo(srgbToLinear(b / 255), 12);
        }
    });

    describe('reference byte values', () => {
        it('0 → 0', () => {
            expect(srgbByteToLinear(0)).toBe(0);
        });

        it('255 → ~1', () => {
            expect(srgbByteToLinear(255)).toBeCloseTo(1, 12);
        });

        it('byte 10 falls in linear branch (10/255 < 0.04045)', () => {
            const expected = 10 / 255 / 12.92;
            expect(srgbByteToLinear(10)).toBeCloseTo(expected, 12);
        });

        it('byte 11 falls in power branch (11/255 > 0.04045)', () => {
            const power = ((11 / 255 + 0.055) / 1.055) ** 2.4;
            const linear = 11 / 255 / 12.92;
            expect(srgbByteToLinear(11)).toBeCloseTo(power, 12);
            expect(srgbByteToLinear(11)).not.toBeCloseTo(linear, 12);
        });

        it('byte 128 (mid gray) matches reference', () => {
            expect(srgbByteToLinear(128)).toBeCloseTo(
                referenceEOTF(128 / 255),
                12,
            );
        });
    });

    describe('monotonicity over full byte range', () => {
        it('output is non-decreasing for every byte [0, 255]', () => {
            let prev = 0;
            for (let b = 0; b <= 255; b++) {
                const v = srgbByteToLinear(b);
                expect(v).toBeGreaterThanOrEqual(prev);
                prev = v;
            }
        });
    });

    describe('allocation-light', () => {
        it('returns a primitive number (no object allocation per call)', () => {
            expect(typeof srgbByteToLinear(128)).toBe('number');
        });
    });
});
