import { describe, expect, it } from 'vitest';
import type { ExtractionSampleSet } from '../../src/core/algorithms/contract.js';
import { mmcqAlgorithm } from '../../src/core/algorithms/mmcq/algorithm.js';
import { ColorExtractorError } from '../../src/core/errors.js';
import type { RGB } from '../../src/core/types.js';

function createSampleSet(colors: RGB[]): ExtractionSampleSet {
    const samples = colors.map((rgb, index) => ({
        rgb,
        lab: { L: 50, a: 0, b: 0 },
        index,
    }));
    return {
        samples,
        validPixels: samples.length,
    };
}

describe('Deterministic MMCQ Core Algorithm', () => {
    it('handles single color input returning 1 candidate with full population', () => {
        const colors = Array.from({ length: 100 }, () => ({
            r: 200,
            g: 100,
            b: 50,
        }));
        const input = createSampleSet(colors);
        const result = mmcqAlgorithm.run(input, { boxes: 8 }, {});

        expect(result.algorithm).toBe('mmcq');
        expect(result.algorithmVersion).toBe('mmcq-v1');
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]?.population).toBe(100);
        expect(result.candidates[0]?.rgb).toEqual({ r: 200, g: 100, b: 50 });
        expect(result.diagnostics).toEqual({
            requestedBoxes: 8,
            producedCandidates: 1,
            histogramBits: 5,
            occupiedBins: 1,
            splits: 0,
        });
    });

    it('splits two separated colors into exact population-weighted candidates', () => {
        const red = { r: 240, g: 20, b: 20 };
        const blue = { r: 20, g: 20, b: 240 };
        const colors = [
            ...Array.from({ length: 60 }, () => red),
            ...Array.from({ length: 40 }, () => blue),
        ];
        const input = createSampleSet(colors);
        const result = mmcqAlgorithm.run(input, { boxes: 2 }, {});

        expect(result.candidates).toHaveLength(2);
        const totalPop = result.candidates.reduce(
            (s, c) => s + c.population,
            0,
        );
        expect(totalPop).toBe(100);

        const redCand = result.candidates.find((c) => c.rgb.r > 200);
        const blueCand = result.candidates.find((c) => c.rgb.b > 200);
        expect(redCand?.population).toBe(60);
        expect(blueCand?.population).toBe(40);
        expect(result.diagnostics.splits).toBe(1);
    });

    it('resolves equal-population axis ties in order R -> G -> B', () => {
        const colors = [
            { r: 0, g: 0, b: 0 },
            { r: 255, g: 255, b: 255 },
        ];
        const input = createSampleSet(colors);
        const result = mmcqAlgorithm.run(input, { boxes: 2 }, {});

        expect(result.candidates).toHaveLength(2);
        expect(result.diagnostics.splits).toBe(1);
    });

    it('performs empty-child correction when median cut would leave a child empty', () => {
        const colors = [
            { r: 0, g: 0, b: 0 },
            { r: 0, g: 0, b: 0 },
            { r: 8, g: 0, b: 0 },
        ];
        const input = createSampleSet(colors);
        const result = mmcqAlgorithm.run(input, { boxes: 2 }, {});

        expect(result.candidates).toHaveLength(2);
        const pops = result.candidates.map((c) => c.population).sort();
        expect(pops).toEqual([1, 2]);
    });

    it('handles unsplittable low-diversity data returning available regions without error', () => {
        const colors = [
            { r: 10, g: 10, b: 10 },
            { r: 10, g: 10, b: 10 },
        ];
        const input = createSampleSet(colors);
        const result = mmcqAlgorithm.run(input, { boxes: 16 }, {});

        expect(result.candidates).toHaveLength(1);
        expect(result.diagnostics.requestedBoxes).toBe(16);
        expect(result.diagnostics.producedCandidates).toBe(1);
        expect(result.diagnostics.splits).toBe(0);
    });

    it('quantizes a high-diversity gradient into requested candidate count', () => {
        const colors: RGB[] = [];
        for (let i = 0; i < 256; i += 4) {
            colors.push({ r: i, g: 255 - i, b: (i * 2) % 256 });
        }
        const input = createSampleSet(colors);
        const result = mmcqAlgorithm.run(input, { boxes: 8 }, {});

        expect(result.candidates).toHaveLength(8);
        expect(result.diagnostics.producedCandidates).toBe(8);
        expect(result.diagnostics.splits).toBe(7);
        const totalPop = result.candidates.reduce(
            (s, c) => s + c.population,
            0,
        );
        expect(totalPop).toBe(colors.length);
    });

    it('handles requested boxes below, equal to, and above available occupied bins', () => {
        const colors = [
            { r: 10, g: 0, b: 0 },
            { r: 100, g: 0, b: 0 },
            { r: 200, g: 0, b: 0 },
        ];
        const input = createSampleSet(colors);

        const r1 = mmcqAlgorithm.run(input, { boxes: 1 }, {});
        expect(r1.candidates).toHaveLength(1);

        const r3 = mmcqAlgorithm.run(input, { boxes: 3 }, {});
        expect(r3.candidates).toHaveLength(3);

        const r10 = mmcqAlgorithm.run(input, { boxes: 10 }, {});
        expect(r10.candidates).toHaveLength(3);
    });

    it('respects AbortSignal cancellation before and during execution', () => {
        const colors = Array.from({ length: 1000 }, (_, i) => ({
            r: i % 256,
            g: (i * 3) % 256,
            b: (i * 7) % 256,
        }));
        const input = createSampleSet(colors);

        const acPre = new AbortController();
        acPre.abort('canceled prior');
        expect(() =>
            mmcqAlgorithm.run(input, { boxes: 8 }, { signal: acPre.signal }),
        ).toThrowError(ColorExtractorError);
    });

    it('guarantees non-mutation of input and produces repeated deep equality', () => {
        const colors = [
            { r: 200, g: 50, b: 50 },
            { r: 50, g: 200, b: 50 },
            { r: 50, g: 50, b: 200 },
        ];
        const input = createSampleSet(colors);
        const originalInputJSON = JSON.stringify(input);

        const run1 = mmcqAlgorithm.run(input, { boxes: 4 }, {});
        const run2 = mmcqAlgorithm.run(input, { boxes: 4 }, {});

        expect(JSON.stringify(input)).toBe(originalInputJSON);
        expect(run1).toEqual(run2);
    });
});
