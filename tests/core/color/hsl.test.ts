import { describe, expect, it } from 'vitest';
import { hslToRgb, rgbToHsl } from '../../../src/core/color/hsl.js';

describe('rgbToHsl', () => {
    describe('primaries and secondaries at full saturation', () => {
        it('red (255, 0, 0) → HSL(0, 1, 0.5)', () => {
            const result = rgbToHsl(255, 0, 0);
            expect(result.h).toBeCloseTo(0, 6);
            expect(result.s).toBeCloseTo(1, 6);
            expect(result.l).toBeCloseTo(0.5, 6);
        });

        it('yellow (255, 255, 0) → HSL(60, 1, 0.5)', () => {
            const result = rgbToHsl(255, 255, 0);
            expect(result.h).toBeCloseTo(60, 6);
            expect(result.s).toBeCloseTo(1, 6);
            expect(result.l).toBeCloseTo(0.5, 6);
        });

        it('green (0, 255, 0) → HSL(120, 1, 0.5)', () => {
            const result = rgbToHsl(0, 255, 0);
            expect(result.h).toBeCloseTo(120, 6);
            expect(result.s).toBeCloseTo(1, 6);
            expect(result.l).toBeCloseTo(0.5, 6);
        });

        it('cyan (0, 255, 255) → HSL(180, 1, 0.5)', () => {
            const result = rgbToHsl(0, 255, 255);
            expect(result.h).toBeCloseTo(180, 6);
            expect(result.s).toBeCloseTo(1, 6);
            expect(result.l).toBeCloseTo(0.5, 6);
        });

        it('blue (0, 0, 255) → HSL(240, 1, 0.5)', () => {
            const result = rgbToHsl(0, 0, 255);
            expect(result.h).toBeCloseTo(240, 6);
            expect(result.s).toBeCloseTo(1, 6);
            expect(result.l).toBeCloseTo(0.5, 6);
        });

        it('magenta (255, 0, 255) → HSL(300, 1, 0.5)', () => {
            const result = rgbToHsl(255, 0, 255);
            expect(result.h).toBeCloseTo(300, 6);
            expect(result.s).toBeCloseTo(1, 6);
            expect(result.l).toBeCloseTo(0.5, 6);
        });
    });

    describe('achromatic colors', () => {
        it('black (0, 0, 0) → HSL(0, 0, 0)', () => {
            const result = rgbToHsl(0, 0, 0);
            expect(result.h).toBe(0);
            expect(result.s).toBe(0);
            expect(result.l).toBe(0);
        });

        it('white (255, 255, 255) → HSL(0, 0, 1)', () => {
            const result = rgbToHsl(255, 255, 255);
            expect(result.h).toBe(0);
            expect(result.s).toBe(0);
            expect(result.l).toBe(1);
        });

        it('mid gray (128, 128, 128) → HSL(0, 0, ~0.502)', () => {
            const result = rgbToHsl(128, 128, 128);
            expect(result.h).toBe(0);
            expect(result.s).toBe(0);
            expect(result.l).toBeCloseTo(128 / 255, 6);
        });

        it('light gray (200, 200, 200) → HSL(0, 0, ~0.784)', () => {
            const result = rgbToHsl(200, 200, 200);
            expect(result.h).toBe(0);
            expect(result.s).toBe(0);
            expect(result.l).toBeCloseTo(200 / 255, 6);
        });

        it('dark gray (50, 50, 50) → HSL(0, 0, ~0.196)', () => {
            const result = rgbToHsl(50, 50, 50);
            expect(result.h).toBe(0);
            expect(result.s).toBe(0);
            expect(result.l).toBeCloseTo(50 / 255, 6);
        });
    });

    describe('intermediate colors', () => {
        it('(200, 100, 50) → HSL(20, 0.6, 0.49)', () => {
            const result = rgbToHsl(200, 100, 50);
            expect(result.h).toBeCloseTo(20, 1);
            expect(result.s).toBeCloseTo(0.6, 2);
            expect(result.l).toBeCloseTo(0.49, 2);
        });

        it('(100, 200, 50) → HSL(100, 0.6, 0.49)', () => {
            const result = rgbToHsl(100, 200, 50);
            expect(result.h).toBeCloseTo(100, 1);
            expect(result.s).toBeCloseTo(0.6, 2);
            expect(result.l).toBeCloseTo(0.49, 2);
        });

        it('(50, 100, 200) → HSL(220, 0.6, 0.49)', () => {
            const result = rgbToHsl(50, 100, 200);
            expect(result.h).toBeCloseTo(220, 1);
            expect(result.s).toBeCloseTo(0.6, 2);
            expect(result.l).toBeCloseTo(0.49, 2);
        });
    });

    describe('hue wraparound', () => {
        it('red dominant when r > g < b → hue in [0, 60)', () => {
            const result = rgbToHsl(200, 50, 50);
            expect(result.h).toBeGreaterThanOrEqual(0);
            expect(result.h).toBeLessThan(60);
        });

        it('hue is always in [0, 360)', () => {
            for (let r = 0; r <= 255; r += 17) {
                for (let g = 0; g <= 255; g += 31) {
                    for (let b = 0; b <= 255; b += 41) {
                        const h = rgbToHsl(r, g, b).h;
                        expect(h).toBeGreaterThanOrEqual(0);
                        expect(h).toBeLessThan(360);
                    }
                }
            }
        });
    });
});

describe('hslToRgb', () => {
    describe('primaries and secondaries at full saturation', () => {
        it('HSL(0, 1, 0.5) → red (255, 0, 0)', () => {
            const result = hslToRgb(0, 1, 0.5);
            expect(result.r).toBeCloseTo(255, 0);
            expect(result.g).toBeCloseTo(0, 0);
            expect(result.b).toBeCloseTo(0, 0);
        });

        it('HSL(60, 1, 0.5) → yellow (255, 255, 0)', () => {
            const result = hslToRgb(60, 1, 0.5);
            expect(result.r).toBeCloseTo(255, 0);
            expect(result.g).toBeCloseTo(255, 0);
            expect(result.b).toBeCloseTo(0, 0);
        });

        it('HSL(120, 1, 0.5) → green (0, 255, 0)', () => {
            const result = hslToRgb(120, 1, 0.5);
            expect(result.r).toBeCloseTo(0, 0);
            expect(result.g).toBeCloseTo(255, 0);
            expect(result.b).toBeCloseTo(0, 0);
        });

        it('HSL(180, 1, 0.5) → cyan (0, 255, 255)', () => {
            const result = hslToRgb(180, 1, 0.5);
            expect(result.r).toBeCloseTo(0, 0);
            expect(result.g).toBeCloseTo(255, 0);
            expect(result.b).toBeCloseTo(255, 0);
        });

        it('HSL(240, 1, 0.5) → blue (0, 0, 255)', () => {
            const result = hslToRgb(240, 1, 0.5);
            expect(result.r).toBeCloseTo(0, 0);
            expect(result.g).toBeCloseTo(0, 0);
            expect(result.b).toBeCloseTo(255, 0);
        });

        it('HSL(300, 1, 0.5) → magenta (255, 0, 255)', () => {
            const result = hslToRgb(300, 1, 0.5);
            expect(result.r).toBeCloseTo(255, 0);
            expect(result.g).toBeCloseTo(0, 0);
            expect(result.b).toBeCloseTo(255, 0);
        });
    });

    describe('achromatic colors', () => {
        it('HSL(_, 0, 0) → black (0, 0, 0)', () => {
            const result = hslToRgb(120, 0, 0);
            expect(result.r).toBe(0);
            expect(result.g).toBe(0);
            expect(result.b).toBe(0);
        });

        it('HSL(_, 0, 0.5) → mid gray (~128, ~128, ~128)', () => {
            const result = hslToRgb(45, 0, 0.5);
            expect(result.r).toBeCloseTo(128, 0);
            expect(result.g).toBeCloseTo(128, 0);
            expect(result.b).toBeCloseTo(128, 0);
        });

        it('HSL(_, 0, 1) → white (255, 255, 255)', () => {
            const result = hslToRgb(270, 0, 1);
            expect(result.r).toBe(255);
            expect(result.g).toBe(255);
            expect(result.b).toBe(255);
        });
    });

    describe('hue wraparound', () => {
        it('HSL(360, 1, 0.5) === HSL(0, 1, 0.5) (red)', () => {
            const r0 = hslToRgb(0, 1, 0.5);
            const r360 = hslToRgb(360, 1, 0.5);
            expect(r360.r).toBe(r0.r);
            expect(r360.g).toBe(r0.g);
            expect(r360.b).toBe(r0.b);
        });

        it('HSL(-10, 1, 0.5) is normalized to 350° (magenta-ish)', () => {
            const r = hslToRgb(-10, 1, 0.5);
            const r350 = hslToRgb(350, 1, 0.5);
            expect(r.r).toBe(r350.r);
            expect(r.g).toBe(r350.g);
            expect(r.b).toBe(r350.b);
        });

        it('hue 720° wraps to 0°', () => {
            const r = hslToRgb(720, 1, 0.5);
            expect(r.r).toBe(255);
            expect(r.g).toBe(0);
            expect(r.b).toBe(0);
        });
    });

    describe('S and L clamping', () => {
        it('clamps S > 1 to 1 (full saturation)', () => {
            const result = hslToRgb(0, 1.5, 0.5);
            expect(result.r).toBe(255);
            expect(result.g).toBe(0);
            expect(result.b).toBe(0);
        });

        it('clamps S < 0 to 0 (achromatic)', () => {
            const result = hslToRgb(0, -0.5, 0.5);
            expect(result.r).toBeCloseTo(128, 0);
            expect(result.g).toBeCloseTo(128, 0);
            expect(result.b).toBeCloseTo(128, 0);
        });

        it('clamps L > 1 to 1 (white)', () => {
            const result = hslToRgb(0, 1, 1.5);
            expect(result.r).toBe(255);
            expect(result.g).toBe(255);
            expect(result.b).toBe(255);
        });

        it('clamps L < 0 to 0 (black)', () => {
            const result = hslToRgb(0, 1, -0.5);
            expect(result.r).toBe(0);
            expect(result.g).toBe(0);
            expect(result.b).toBe(0);
        });
    });

    describe('output is integer bytes in [0, 255]', () => {
        it('returns integers, not floats', () => {
            const result = hslToRgb(123, 0.5, 0.5);
            expect(Number.isInteger(result.r)).toBe(true);
            expect(Number.isInteger(result.g)).toBe(true);
            expect(Number.isInteger(result.b)).toBe(true);
        });

        it('all channels in [0, 255]', () => {
            for (let h = 0; h < 360; h += 30) {
                for (let s = 0; s <= 1; s += 0.25) {
                    for (let l = 0; l <= 1; l += 0.25) {
                        const r = hslToRgb(h, s, l);
                        expect(r.r).toBeGreaterThanOrEqual(0);
                        expect(r.r).toBeLessThanOrEqual(255);
                        expect(r.g).toBeGreaterThanOrEqual(0);
                        expect(r.g).toBeLessThanOrEqual(255);
                        expect(r.b).toBeGreaterThanOrEqual(0);
                        expect(r.b).toBeLessThanOrEqual(255);
                    }
                }
            }
        });
    });
});

describe('round-trip RGB → HSL → RGB', () => {
    const samples: Array<[number, number, number]> = [
        [0, 0, 0],
        [255, 255, 255],
        [128, 128, 128],
        [200, 100, 50],
        [100, 200, 50],
        [50, 100, 200],
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [127, 64, 200],
        [50, 200, 100],
        [200, 50, 100],
    ];

    it.each(samples)(
        '(%i, %i, %i) round-trips within ±1 per channel',
        (r, g, b) => {
            const hsl = rgbToHsl(r, g, b);
            const back = hslToRgb(hsl.h, hsl.s, hsl.l);
            expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1);
            expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1);
            expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1);
        },
    );

    it.each(samples)(
        '(%i, %i, %i) round-trip hue within ±1 (after H wrap)',
        (r, g, b) => {
            const hsl1 = rgbToHsl(r, g, b);
            const back = hslToRgb(hsl1.h, hsl1.s, hsl1.l);
            const hsl2 = rgbToHsl(back.r, back.g, back.b);
            expect(hsl2.h).toBeCloseTo(hsl1.h, 0);
        },
    );
});

describe('HSL hue is always in [0, 360)', () => {
    it('for arbitrary input', () => {
        for (let r = 0; r <= 255; r += 23) {
            for (let g = 0; g <= 255; g += 29) {
                for (let b = 0; b <= 255; b += 37) {
                    const h = rgbToHsl(r, g, b).h;
                    expect(h).toBeGreaterThanOrEqual(0);
                    expect(h).toBeLessThan(360);
                }
            }
        }
    });
});
