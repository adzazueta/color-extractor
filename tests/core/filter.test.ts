import { describe, expect, it } from 'vitest';
import {
    type FilterCriteria,
    filterPixels,
    passesFilter,
} from '../../src/core/filter.js';
import { normalizePixels, type Pixel } from '../../src/core/pixels.js';

const CRITERIA: FilterCriteria = {
    alphaThreshold: 128,
    minBrightness: 10,
    maxBrightness: 245,
    minSaturation: 8,
};

function pixel(
    r: number,
    g: number,
    b: number,
    a: number = 255,
    index: number = 0,
): Pixel {
    return { index, r, g, b, a };
}

describe('passesFilter', () => {
    describe('alpha', () => {
        it('alpha exactly at threshold passes (with valid brightness/saturation)', () => {
            expect(passesFilter(pixel(128, 50, 50, 128), CRITERIA)).toBe(true);
        });

        it('alpha below threshold fails (gherkin AC)', () => {
            expect(passesFilter(pixel(128, 50, 50, 127), CRITERIA)).toBe(false);
        });

        it('alpha = 0 fails', () => {
            expect(passesFilter(pixel(128, 50, 50, 0), CRITERIA)).toBe(false);
        });

        it('alpha = 255 passes (fully opaque)', () => {
            expect(passesFilter(pixel(128, 50, 50, 255), CRITERIA)).toBe(true);
        });
    });

    describe('brightness (max channel)', () => {
        it('max channel below minBrightness fails (near-black)', () => {
            expect(passesFilter(pixel(5, 5, 5, 255), CRITERIA)).toBe(false);
        });

        it('max channel at minBrightness passes (boundary)', () => {
            expect(passesFilter(pixel(10, 5, 5, 255), CRITERIA)).toBe(true);
        });

        it('max channel above maxBrightness fails (near-white)', () => {
            expect(passesFilter(pixel(250, 200, 200, 255), CRITERIA)).toBe(
                false,
            );
        });

        it('max channel at maxBrightness passes (boundary)', () => {
            expect(passesFilter(pixel(245, 100, 100, 255), CRITERIA)).toBe(
                true,
            );
        });

        it('mid-brightness saturated passes', () => {
            expect(passesFilter(pixel(200, 50, 50, 255), CRITERIA)).toBe(true);
        });
    });

    describe('saturation', () => {
        it('gray pixel fails (s=0 below minSaturation=8)', () => {
            expect(passesFilter(pixel(128, 128, 128, 255), CRITERIA)).toBe(
                false,
            );
        });

        it('saturated red (below maxBrightness) passes', () => {
            expect(passesFilter(pixel(245, 50, 50, 255), CRITERIA)).toBe(true);
        });

        it('saturated green (below maxBrightness) passes', () => {
            expect(passesFilter(pixel(50, 245, 50, 255), CRITERIA)).toBe(true);
        });

        it('saturated blue (below maxBrightness) passes', () => {
            expect(passesFilter(pixel(50, 50, 245, 255), CRITERIA)).toBe(true);
        });

        it('white fails (s=0)', () => {
            expect(passesFilter(pixel(240, 240, 240, 255), CRITERIA)).toBe(
                false,
            );
        });

        it('black fails (s=0, also brightness)', () => {
            expect(passesFilter(pixel(5, 5, 5, 255), CRITERIA)).toBe(false);
        });
    });

    describe('combined criteria', () => {
        it('pixel passing all criteria (vivid mid-bright red, opaque)', () => {
            expect(passesFilter(pixel(200, 50, 50, 255), CRITERIA)).toBe(true);
        });

        it('alpha fails even if other criteria pass', () => {
            expect(passesFilter(pixel(200, 50, 50, 50), CRITERIA)).toBe(false);
        });

        it('brightness fails even if other criteria pass (max > 245)', () => {
            expect(passesFilter(pixel(255, 100, 100, 200), CRITERIA)).toBe(
                false,
            );
        });

        it('saturation fails even if other criteria pass (vivid but mid-gray)', () => {
            expect(passesFilter(pixel(130, 128, 128, 200), CRITERIA)).toBe(
                false,
            );
        });
    });

    describe('custom criteria', () => {
        it('zero alphaThreshold means no alpha filtering', () => {
            const c = { ...CRITERIA, alphaThreshold: 0 };
            expect(passesFilter(pixel(128, 50, 50, 0), c)).toBe(true);
        });

        it('low alphaThreshold allows transparent pixels through', () => {
            const c = { ...CRITERIA, alphaThreshold: 10 };
            expect(passesFilter(pixel(128, 50, 50, 10), c)).toBe(true);
            expect(passesFilter(pixel(128, 50, 50, 9), c)).toBe(false);
        });

        it('zero minSaturation allows grays through', () => {
            const c = { ...CRITERIA, minSaturation: 0 };
            expect(passesFilter(pixel(128, 128, 128, 255), c)).toBe(true);
        });
    });
});

describe('filterPixels', () => {
    it('returns array of passing pixels only', () => {
        const data = new Uint8Array(40);
        data.set([200, 50, 50, 255], 0); // pass (vivid red)
        data.set([200, 50, 50, 0], 4); // fail (alpha 0)
        data.set([128, 128, 128, 255], 8); // fail (gray)
        data.set([50, 200, 50, 255], 12); // pass (vivid green)
        data.set([5, 5, 5, 255], 16); // fail (near-black)
        data.set([200, 100, 0, 255], 20); // pass (orange)
        data.set([0, 0, 200, 200], 24); // pass (blue, alpha 200)
        data.set([250, 250, 250, 255], 28); // fail (near-white)
        data.set([0, 0, 0, 100], 32); // fail (alpha 100)
        data.set([200, 0, 0, 255], 36); // pass (dark red)

        const pixels = normalizePixels(data, 10, 1);
        const result = filterPixels(pixels, CRITERIA);
        expect(result.length).toBe(5);
        expect(result.map((p) => p.index)).toEqual([0, 3, 5, 6, 9]);
    });

    it('returns empty array when all pixels fail', () => {
        const data = new Uint8Array(40);
        for (let i = 0; i < 10; i++) {
            data[i * 4] = 128;
            data[i * 4 + 1] = 128;
            data[i * 4 + 2] = 128;
            data[i * 4 + 3] = 255;
        }
        const pixels = normalizePixels(data, 10, 1);
        const result = filterPixels(pixels, CRITERIA);
        expect(result.length).toBe(0);
    });

    it('returns all pixels when all pass', () => {
        const data = new Uint8Array(40);
        for (let i = 0; i < 10; i++) {
            data[i * 4] = 200;
            data[i * 4 + 1] = 50;
            data[i * 4 + 2] = 50;
            data[i * 4 + 3] = 255;
        }
        const pixels = normalizePixels(data, 10, 1);
        const result = filterPixels(pixels, CRITERIA);
        expect(result.length).toBe(10);
    });

    it('preserves original indices', () => {
        const data = new Uint8Array(12);
        data.set([200, 50, 50, 255], 0); // index 0 — pass
        data.set([200, 50, 50, 0], 4); // index 1 — fail (alpha 0)
        data.set([50, 200, 50, 255], 8); // index 2 — pass

        const pixels = normalizePixels(data, 3, 1);
        const result = filterPixels(pixels, CRITERIA);
        expect(result.length).toBe(2);
        expect(result[0]!.index).toBe(0);
        expect(result[1]!.index).toBe(2);
    });

    it('handles large grids without performance issues', () => {
        const data = new Uint8Array(150 * 150 * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 200;
            data[i + 1] = 50;
            data[i + 2] = 50;
            data[i + 3] = 255;
        }
        const pixels = normalizePixels(data, 150, 150);
        const start = performance.now();
        const result = filterPixels(pixels, CRITERIA);
        const elapsed = performance.now() - start;
        expect(result.length).toBe(22500);
        expect(elapsed).toBeLessThan(2000);
    });
});
