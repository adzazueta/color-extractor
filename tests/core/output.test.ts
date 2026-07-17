import { describe, expect, it } from 'vitest';
import {
    applyOutputFlags,
    type FullExtractionResult,
} from '../../src/core/output.js';
import type { ExtractionMetadata } from '../../src/core/result.js';
import type { ExtractedColor } from '../../src/core/types.js';

function makeColor(overrides: Partial<ExtractedColor> = {}): ExtractedColor {
    return {
        hex: '#ff8040',
        rgb: { r: 255, g: 128, b: 64 },
        hsl: { h: 20, s: 1, l: 0.626 },
        lab: { L: 65, a: 30, b: 50 },
        chroma: 58.3,
        population: 1000,
        proportion: 0.4,
        score: 0.95,
        role: 'primary',
        source: 'cluster',
        ...overrides,
    };
}

const METADATA: ExtractionMetadata = {
    algorithm: 'lab-kmeans-chroma-weighted',
    cacheVersion: '1.0',
    sampleSize: 150,
    sampledPixels: 22500,
    validPixels: 18000,
    clusters: 5,
    iterations: 7,
    primaryPreset: 'strict',
    secondaryFallback: 'harmony',
    fallbackUsed: false,
    runtime: 'node',
    decoder: 'sharp',
};

function makeFull(
    overrides: Partial<FullExtractionResult> = {},
): FullExtractionResult {
    return {
        primary: makeColor({ role: 'primary' }),
        secondary: makeColor({ role: 'secondary' }),
        accents: [makeColor({ role: 'accent', hex: '#aabbcc' })],
        palette: [
            makeColor({ role: 'palette', hex: '#111111' }),
            makeColor({ role: 'palette', hex: '#222222' }),
        ],
        metadata: METADATA,
        ...overrides,
    };
}

describe('applyOutputFlags', () => {
    describe('default behavior (no options)', () => {
        it('returns minimal result with only primary and secondary', () => {
            const result = applyOutputFlags(makeFull(), undefined);
            expect(result.primary.hex).toBe('#ff8040');
            expect(result.secondary).not.toBeNull();
            expect(result.palette).toBeUndefined();
            expect(result.accents).toBeUndefined();
            expect(result.metadata).toBeUndefined();
        });

        it('always includes RGB and HEX in colors', () => {
            const result = applyOutputFlags(makeFull(), undefined);
            expect(result.primary.hex).toBe('#ff8040');
            expect(result.primary.rgb).toEqual({ r: 255, g: 128, b: 64 });
            expect(result.secondary?.hex).toBe('#ff8040');
        });

        it('includes HSL by default (includeHsl: true)', () => {
            const result = applyOutputFlags(makeFull(), undefined);
            expect(result.primary.hsl).toEqual({ h: 20, s: 1, l: 0.626 });
        });

        it('excludes Lab by default (includeLab: false)', () => {
            const result = applyOutputFlags(makeFull(), undefined);
            expect(result.primary.lab).toBeUndefined();
        });

        it('excludes scores by default (includeScores: false)', () => {
            const result = applyOutputFlags(makeFull(), undefined);
            expect(result.primary.chroma).toBeUndefined();
            expect(result.primary.population).toBeUndefined();
            expect(result.primary.proportion).toBeUndefined();
            expect(result.primary.score).toBeUndefined();
        });

        it('always preserves role and source', () => {
            const result = applyOutputFlags(makeFull(), undefined);
            expect(result.primary.role).toBe('primary');
            expect(result.secondary?.role).toBe('secondary');
        });
    });

    describe('explicit includeHsl: false', () => {
        it('strips HSL from colors', () => {
            const result = applyOutputFlags(makeFull(), { includeHsl: false });
            expect(result.primary.hsl).toBeUndefined();
            expect(result.secondary?.hsl).toBeUndefined();
        });

        it('still includes RGB and HEX', () => {
            const result = applyOutputFlags(makeFull(), { includeHsl: false });
            expect(result.primary.hex).toBe('#ff8040');
            expect(result.primary.rgb).toEqual({ r: 255, g: 128, b: 64 });
        });
    });

    describe('explicit includeLab: true', () => {
        it('includes Lab in colors', () => {
            const result = applyOutputFlags(makeFull(), { includeLab: true });
            expect(result.primary.lab).toEqual({ L: 65, a: 30, b: 50 });
        });
    });

    describe('explicit includeScores: true', () => {
        it('includes all four score fields', () => {
            const result = applyOutputFlags(makeFull(), {
                includeScores: true,
            });
            expect(result.primary.chroma).toBe(58.3);
            expect(result.primary.population).toBe(1000);
            expect(result.primary.proportion).toBe(0.4);
            expect(result.primary.score).toBe(0.95);
        });

        it('applies to secondary too', () => {
            const result = applyOutputFlags(makeFull(), {
                includeScores: true,
            });
            expect(result.secondary?.score).toBe(0.95);
        });
    });

    describe('includePalette', () => {
        it('includes palette array when true', () => {
            const result = applyOutputFlags(makeFull(), {
                includePalette: true,
            });
            expect(result.palette).toHaveLength(2);
            expect(result.palette?.[0]?.hex).toBe('#111111');
            expect(result.palette?.[1]?.hex).toBe('#222222');
        });

        it('excludes palette when false', () => {
            const result = applyOutputFlags(makeFull(), {
                includePalette: false,
            });
            expect(result.palette).toBeUndefined();
        });

        it('shapes palette colors with the same color flags', () => {
            const result = applyOutputFlags(makeFull(), {
                includePalette: true,
                includeHsl: false,
                includeScores: true,
            });
            expect(result.palette?.[0]?.hsl).toBeUndefined();
            expect(result.palette?.[0]?.score).toBe(0.95);
        });

        it('preserves empty palette array when flag is true', () => {
            const full = makeFull({ palette: [] });
            const result = applyOutputFlags(full, { includePalette: true });
            expect(result.palette).toEqual([]);
        });
    });

    describe('includeAccents', () => {
        it('includes accents array when true', () => {
            const result = applyOutputFlags(makeFull(), {
                includeAccents: true,
            });
            expect(result.accents).toHaveLength(1);
            expect(result.accents?.[0]?.hex).toBe('#aabbcc');
        });

        it('excludes accents when false', () => {
            const result = applyOutputFlags(makeFull(), {
                includeAccents: false,
            });
            expect(result.accents).toBeUndefined();
        });
    });

    describe('includeMetadata', () => {
        it('includes metadata when true', () => {
            const result = applyOutputFlags(makeFull(), {
                includeMetadata: true,
            });
            expect(result.metadata?.algorithm).toBe(
                'lab-kmeans-chroma-weighted',
            );
            expect(result.metadata?.runtime).toBe('node');
        });

        it('excludes metadata when false', () => {
            const result = applyOutputFlags(makeFull(), {
                includeMetadata: false,
            });
            expect(result.metadata).toBeUndefined();
        });
    });

    describe('all flags true', () => {
        it('produces the complete result shape', () => {
            const result = applyOutputFlags(makeFull(), {
                includePalette: true,
                includeAccents: true,
                includeMetadata: true,
                includeLab: true,
                includeHsl: true,
                includeScores: true,
            });
            expect(result.primary.hsl).toBeDefined();
            expect(result.primary.lab).toBeDefined();
            expect(result.primary.score).toBeDefined();
            expect(result.accents).toHaveLength(1);
            expect(result.palette).toHaveLength(2);
            expect(result.metadata?.algorithm).toBe(
                'lab-kmeans-chroma-weighted',
            );
        });
    });

    describe('secondary edge cases', () => {
        it('preserves null secondary as null', () => {
            const full = makeFull({ secondary: null });
            const result = applyOutputFlags(full, undefined);
            expect(result.secondary).toBeNull();
        });

        it('shapes non-null secondary correctly', () => {
            const result = applyOutputFlags(makeFull(), { includeLab: true });
            expect(result.secondary).not.toBeNull();
            expect(result.secondary?.lab).toBeDefined();
        });
    });

    describe('idempotence', () => {
        it('applying output flags twice produces the same result', () => {
            const full = makeFull();
            const once = applyOutputFlags(full, {
                includePalette: true,
                includeScores: true,
            });
            const twice = applyOutputFlags(
                once as unknown as FullExtractionResult,
                {
                    includePalette: true,
                    includeScores: true,
                },
            );
            expect(twice).toEqual(once);
        });
    });
});
