import { describe, expect, it } from 'vitest';
import { ColorExtractorError } from '../../src/core/errors.js';
import {
    type FilterCriteria,
    passesFilter,
    validateFilterCriteria,
} from '../../src/core/filter.js';
import type { Pixel } from '../../src/core/pixels.js';

const CRITERIA: FilterCriteria = {
    alphaThreshold: 128,
    minBrightness: 10,
    maxBrightness: 245,
    minSaturation: 8,
};

function pixel(r: number, g: number, b: number, a: number = 255): Pixel {
    return { index: 0, r, g, b, a };
}

describe('validateFilterCriteria (reviewer finding #7)', () => {
    it('accepts default criteria', () => {
        expect(() => validateFilterCriteria(CRITERIA)).not.toThrow();
    });

    it('rejects NaN alphaThreshold', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, alphaThreshold: Number.NaN }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects Infinity alphaThreshold', () => {
        expect(() =>
            validateFilterCriteria({
                ...CRITERIA,
                alphaThreshold: Number.POSITIVE_INFINITY,
            }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects negative alphaThreshold', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, alphaThreshold: -1 }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects alphaThreshold > 255', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, alphaThreshold: 256 }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects NaN minBrightness', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, minBrightness: Number.NaN }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects minBrightness > maxBrightness', () => {
        expect(() =>
            validateFilterCriteria({
                ...CRITERIA,
                minBrightness: 100,
                maxBrightness: 50,
            }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects NaN minSaturation', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, minSaturation: Number.NaN }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects minSaturation > 100', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, minSaturation: 150 }),
        ).toThrow(ColorExtractorError);
    });

    it('rejects minSaturation < 0', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, minSaturation: -1 }),
        ).toThrow(ColorExtractorError);
    });

    it('accepts minSaturation at exact boundary (0 and 100)', () => {
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, minSaturation: 0 }),
        ).not.toThrow();
        expect(() =>
            validateFilterCriteria({ ...CRITERIA, minSaturation: 100 }),
        ).not.toThrow();
    });

    it('validates inside passesFilter', () => {
        expect(() =>
            passesFilter(pixel(128, 128, 128, 255), {
                ...CRITERIA,
                minBrightness: Number.NaN,
            }),
        ).toThrow(ColorExtractorError);
    });
});
