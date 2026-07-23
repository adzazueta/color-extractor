import { describe, expect, it } from 'vitest';
import type { LabKmeansCandidateResult } from '../../src/core/algorithms/lab-kmeans/types.js';
import { rgbToHsl } from '../../src/core/color/hsl.js';
import type { ColorExtractorError } from '../../src/core/errors.js';
import { normalizePalette } from '../../src/core/neutral/normalize.js';
import type { ResolvedCoreExtractPaletteOptions } from '../../src/core/neutral-options.js';

const BASE_OPTIONS: ResolvedCoreExtractPaletteOptions = {
    algorithm: 'lab-kmeans',
    sampling: { maxDimension: 150 },
    filtering: {
        alphaThreshold: 128,
        minBrightness: 10,
        maxBrightness: 245,
        minSaturation: 8,
    },
    result: { maxColors: 5, includeHsl: false },
    advanced: {
        labKmeans: { clusters: 5, iterations: 7 },
        mmcq: { boxes: 8 },
        perceptualRanking: { chromaFloor: 12, lowChromaPenalty: 0.1 },
    },
};

const BASE_META = {
    validPixels: 1000,
    sampledWidth: 100,
    sampledHeight: 100,
    sampledPixels: 10000,
    runtime: 'core' as const,
    decoder: 'pixels' as const,
    packageVersion: '0.2.0',
    algorithmVersion: '1.0.0',
};

function candidateResult(
    candidates: LabKmeansCandidateResult['candidates'],
    overrides?: Partial<LabKmeansCandidateResult['metadata']>,
): LabKmeansCandidateResult {
    return {
        candidates,
        metadata: {
            requestedClusters: 5,
            producedCandidates: candidates.length,
            iterations: 7,
            ...overrides,
        },
    };
}

function cand(
    r: number,
    g: number,
    b: number,
    L: number,
    a: number,
    b_: number,
    population: number,
    sourceIndex: number,
): LabKmeansCandidateResult['candidates'][number] {
    return { rgb: { r, g, b }, lab: { L, a, b: b_ }, population, sourceIndex };
}

describe('normalizePalette — valid input', () => {
    it('returns swatches, rankings, and metadata', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 500, 0),
                cand(50, 100, 150, 40, -10, -20, 300, 1),
                cand(200, 100, 50, 52, 28, 22, 200, 2),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.swatches).toHaveLength(2);
        expect(result.rankings.perceptual).toHaveLength(2);
        expect(result.rankings.population).toHaveLength(2);
        expect(result.rankings.chroma).toHaveLength(2);
        expect(result.metadata.algorithm).toBe('lab-kmeans');
    });

    it('swatches are sorted by ID ascending', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 340, 0),
                cand(50, 100, 150, 40, -10, -20, 330, 1),
                cand(100, 180, 60, 45, 15, 10, 330, 2),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        for (let i = 1; i < result.swatches.length; i++) {
            expect(result.swatches[i]!.id > result.swatches[i - 1]!.id).toBe(
                true,
            );
        }
    });

    it('populations are positive integers', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 500, 0),
                cand(50, 100, 150, 40, -10, -20, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        for (const s of result.swatches) {
            expect(Number.isInteger(s.population)).toBe(true);
            expect(s.population).toBeGreaterThan(0);
        }
    });

    it('proportions equal population / validPixels', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 600, 0),
                cand(50, 100, 150, 40, -10, -20, 400, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        for (const s of result.swatches) {
            expect(s.proportion).toBeCloseTo(s.population / 1000, 10);
        }
    });

    it('scores are finite and within 0..1', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 500, 0),
                cand(50, 100, 150, 40, -10, -20, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        for (const s of result.swatches) {
            expect(Number.isFinite(s.score)).toBe(true);
            expect(s.score).toBeGreaterThanOrEqual(0);
            expect(s.score).toBeLessThanOrEqual(1);
        }
    });

    it('highest raw score gets score 1', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 500, 0),
                cand(50, 100, 150, 40, -10, -20, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        const maxScore = Math.max(...result.swatches.map((s) => s.score));
        expect(maxScore).toBeCloseTo(1, 10);
    });

    it('HEX matches ID exactly', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(168, 95, 70, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.swatches[0]!.hex).toBe('#a85f46');
        expect(result.swatches[0]!.id).toBe('swatch-a85f46');
    });

    it('every ranking is a permutation of swatch IDs', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 250, 0),
                cand(50, 100, 150, 40, -10, -20, 250, 1),
                cand(100, 180, 60, 45, 15, 10, 250, 2),
                cand(30, 60, 120, 35, -5, 15, 250, 3),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        const ids = result.swatches.map((s) => s.id).sort();
        for (const key of ['perceptual', 'population', 'chroma'] as const) {
            expect(result.rankings[key].slice().sort()).toEqual(ids);
        }
    });

    it('coverage equals returnedPopulation / validPixels', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 800, 0),
                cand(50, 100, 150, 40, -10, -20, 200, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        const returnedPop = result.swatches.reduce(
            (a, s) => a + s.population,
            0,
        );
        expect(result.metadata.returnedPopulation).toBe(returnedPop);
        expect(result.metadata.coverage).toBeCloseTo(returnedPop / 1000, 10);
    });
});

describe('normalizePalette — RGB deduplication', () => {
    it('merges candidates with identical canonical RGB', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 300, 0),
                cand(200, 100, 50, 52, 28, 22, 200, 1),
                cand(50, 100, 150, 40, -10, -20, 500, 2),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.swatches).toHaveLength(2);
        const merged = result.swatches.find((s) => s.hex === '#c86432')!;
        expect(merged).toBeDefined();
        expect(merged.population).toBe(500);
        // Lab is recalculated from canonical RGB, not weighted mean
        expect(merged.lab.L).toBeCloseTo(53.6295, 4);
        expect(merged.lab.a).toBeCloseTo(36.3058, 4);
        expect(merged.lab.b).toBeCloseTo(45.3795, 4);
    });

    it('candidateCount records pre-dedup count', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 300, 0),
                cand(200, 100, 50, 52, 28, 22, 200, 1),
                cand(50, 100, 150, 40, -10, -20, 500, 2),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.metadata.candidateCount).toBe(3);
        expect(result.metadata.returnedColors).toBe(2);
    });

    it('RGB rounding produces canonical integer', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200.4, 100.6, 49.5, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.swatches[0]!.rgb).toEqual({ r: 200, g: 101, b: 50 });
    });

    it('identical candidates after canonicalization are deduped', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200.4, 99.6, 50.4, 50, 30, 20, 400, 0),
                cand(200, 100, 50, 52, 28, 22, 300, 1),
            ]),
            ...BASE_META,
            validPixels: 700,
            options: BASE_OPTIONS,
        });
        expect(result.swatches).toHaveLength(1);
        expect(result.swatches[0]!.population).toBe(700);
    });
});

describe('normalizePalette — single candidate', () => {
    it('returns one swatch with score 1 and rankings contain 1 ID', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.swatches).toHaveLength(1);
        expect(result.swatches[0]!.score).toBeCloseTo(1, 10);
        for (const key of ['perceptual', 'population', 'chroma'] as const) {
            expect(result.rankings[key]).toEqual([result.swatches[0]!.id]);
        }
        expect(result.metadata.coverage).toBeCloseTo(1, 10);
    });

    it('score is 0 when raw score is 0', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(128, 128, 128, 50, 0, 0, 1000, 0),
            ]),
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                advanced: {
                    ...BASE_OPTIONS.advanced,
                    perceptualRanking: {
                        chromaFloor: 12,
                        lowChromaPenalty: 0.1,
                    },
                },
            },
        });
        expect(result.swatches[0]!.score).toBe(0);
    });
});

describe('normalizePalette — perceptual score and low-chroma penalty', () => {
    it('applies lowChromaPenalty when chroma < chromaFloor', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 500, 0),
                cand(135, 130, 125, 55, 0, 0, 500, 1),
            ]),
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                advanced: {
                    ...BASE_OPTIONS.advanced,
                    perceptualRanking: {
                        chromaFloor: 6,
                        lowChromaPenalty: 0.5,
                    },
                },
            },
        });
        const gray = result.swatches.find((s) => s.hex === '#87827d')!;
        const vivid = result.swatches.find((s) => s.hex === '#c86432')!;
        // Vivid: chroma ≈ 58.1 from recalculated Lab of (200, 100, 50)
        // Gray: chroma ≈ 3.50 from recalculated Lab of (135, 130, 125) — below floor
        const vividRaw = 58.1155 * Math.log(501);
        const grayRaw = 3.4972 * Math.log(501) * 0.5;
        const maxRaw = Math.max(vividRaw, grayRaw);
        expect(vivid.score).toBeCloseTo(vividRaw / maxRaw, 5);
        expect(gray.score).toBeCloseTo(grayRaw / maxRaw, 5);
    });

    it('no penalty when chroma >= chromaFloor', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 15, 15, 500, 0),
                cand(50, 100, 150, 40, 10, 5, 500, 1),
            ]),
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                advanced: {
                    ...BASE_OPTIONS.advanced,
                    perceptualRanking: {
                        chromaFloor: 10,
                        lowChromaPenalty: 0.1,
                    },
                },
            },
        });
        // Both swatches have chroma >= 10 from recalculated Lab
        for (const s of result.swatches) {
            expect(s.chroma).toBeGreaterThanOrEqual(10);
        }
        // Highest-scoring swatch gets score 1
        const best = result.swatches.reduce((a, b) =>
            a.score >= b.score ? a : b,
        );
        expect(best.score).toBeCloseTo(1, 5);
    });
});

describe('normalizePalette — maxColors selection', () => {
    it('selects up to maxColors by perceptual ranking', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 250, 0),
                cand(50, 100, 150, 40, -10, -20, 250, 1),
                cand(100, 180, 60, 45, 15, 10, 250, 2),
                cand(30, 60, 120, 35, -5, 15, 250, 3),
            ]),
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                result: { ...BASE_OPTIONS.result, maxColors: 2 },
            },
        });
        expect(result.swatches).toHaveLength(2);
        expect(result.metadata.returnedColors).toBe(2);
    });

    it('does not fail when maxColors > merged candidate count', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                result: { ...BASE_OPTIONS.result, maxColors: 10 },
            },
        });
        expect(result.swatches).toHaveLength(1);
    });
});

describe('normalizePalette — optional HSL', () => {
    it('includes HSL when includeHsl is true', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                result: { ...BASE_OPTIONS.result, includeHsl: true },
            },
        });
        expect(result.swatches[0]!.hsl).toBeDefined();
        expect(result.swatches[0]!.hsl).toEqual(rgbToHsl(200, 100, 50));
    });

    it('omits HSL entirely when includeHsl is false', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.swatches[0]!.hsl).toBeUndefined();
    });

    it('does not set hsl to undefined, omits the key', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect('hsl' in result.swatches[0]!).toBe(false);
    });
});

describe('normalizePalette — metadata', () => {
    it('records algorithm, runtime, decoder', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.metadata.algorithm).toBe('lab-kmeans');
        expect(result.metadata.runtime).toBe('core');
        expect(result.metadata.decoder).toBe('pixels');
    });

    it('records sample dimensions and pixel counts', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.metadata.sampledWidth).toBe(100);
        expect(result.metadata.sampledHeight).toBe(100);
        expect(result.metadata.sampledPixels).toBe(10000);
        expect(result.metadata.validPixels).toBe(1000);
    });

    it('algorithmDetails contains requestedClusters, producedCandidates, iterations', () => {
        const result = normalizePalette({
            candidateResult: candidateResult(
                [cand(200, 100, 50, 50, 30, 20, 1000, 0)],
                { requestedClusters: 8, producedCandidates: 3, iterations: 5 },
            ),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(result.metadata.algorithmDetails).toEqual({
            algorithm: 'lab-kmeans',
            requestedClusters: 8,
            producedCandidates: 3,
            iterations: 5,
        });
    });
});

describe('normalizePalette — comparators', () => {
    function tieCase(): LabKmeansCandidateResult {
        return candidateResult([
            cand(200, 100, 50, 50, 30, 20, 300, 0),
            cand(50, 100, 150, 40, -10, -20, 300, 1),
            cand(100, 180, 60, 45, 15, 10, 300, 2),
        ]);
    }

    it('perceptual ranking: rawScore desc, population desc, chroma desc, id asc', () => {
        const result = normalizePalette({
            candidateResult: tieCase(),
            ...BASE_META,
            validPixels: 900,
            options: BASE_OPTIONS,
        });
        const ranked = result.rankings.perceptual;
        for (let i = 1; i < ranked.length; i++) {
            const a = result.swatches.find((s) => s.id === ranked[i - 1])!;
            const b = result.swatches.find((s) => s.id === ranked[i])!;
            const aRaw = a.chroma * Math.log(a.population + 1);
            const bRaw = b.chroma * Math.log(b.population + 1);
            if (bRaw !== aRaw) {
                expect(bRaw).toBeLessThanOrEqual(aRaw);
            }
        }
    });

    it('population ranking: population desc', () => {
        const result = normalizePalette({
            candidateResult: tieCase(),
            ...BASE_META,
            validPixels: 900,
            options: BASE_OPTIONS,
        });
        const ranked = result.rankings.population;
        for (let i = 1; i < ranked.length; i++) {
            const a = result.swatches.find((s) => s.id === ranked[i - 1])!;
            const b = result.swatches.find((s) => s.id === ranked[i])!;
            expect(b.population).toBeLessThanOrEqual(a.population);
        }
    });

    it('chroma ranking: chroma desc', () => {
        const result = normalizePalette({
            candidateResult: tieCase(),
            ...BASE_META,
            validPixels: 900,
            options: BASE_OPTIONS,
        });
        const ranked = result.rankings.chroma;
        for (let i = 1; i < ranked.length; i++) {
            const a = result.swatches.find((s) => s.id === ranked[i - 1])!;
            const b = result.swatches.find((s) => s.id === ranked[i])!;
            expect(b.chroma).toBeLessThanOrEqual(a.chroma);
        }
    });

    it('perceptual ranking uses raw score, not normalized score', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 500, 0),
                cand(50, 100, 150, 40, -10, -20, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        const ranked = result.rankings.perceptual;
        const a = result.swatches.find((s) => s.id === ranked[0]!)!;
        const b = result.swatches.find((s) => s.id === ranked[1]!)!;
        const aRaw = a.chroma * Math.log(a.population + 1);
        const bRaw = b.chroma * Math.log(b.population + 1);
        expect(aRaw).toBeGreaterThanOrEqual(bRaw);
    });
});

describe('normalizePalette — all scores equal or zero', () => {
    it('all scores are 0 when chroma is 0 for all', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(128, 128, 128, 50, 0, 0, 500, 0),
                cand(128, 128, 128, 51, 0, 0, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        for (const s of result.swatches) {
            expect(s.score).toBe(0);
        }
    });

    it('deterministic rankings when all scores are 0', () => {
        const a = normalizePalette({
            candidateResult: candidateResult([
                cand(128, 128, 128, 50, 0, 0, 500, 0),
                cand(128, 128, 128, 51, 0, 0, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        const b = normalizePalette({
            candidateResult: candidateResult([
                cand(128, 128, 128, 50, 0, 0, 500, 0),
                cand(128, 128, 128, 51, 0, 0, 500, 1),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        expect(a).toEqual(b);
    });
});

describe('normalizePalette — validation errors', () => {
    function assertCode(fn: () => void, expectedCode: string) {
        try {
            fn();
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ColorExtractorError).code).toBe(expectedCode);
        }
    }

    it('rejects validPixels === 0', () => {
        assertCode(
            () =>
                normalizePalette({
                    candidateResult: candidateResult([
                        cand(200, 100, 50, 50, 30, 20, 1000, 0),
                    ]),
                    ...BASE_META,
                    validPixels: 0,
                    options: BASE_OPTIONS,
                }),
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
        );
    });

    it('rejects empty candidates', () => {
        assertCode(
            () =>
                normalizePalette({
                    candidateResult: candidateResult([]),
                    ...BASE_META,
                    options: BASE_OPTIONS,
                }),
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
        );
    });

    it('rejects population sum mismatch', () => {
        assertCode(
            () =>
                normalizePalette({
                    candidateResult: candidateResult([
                        cand(200, 100, 50, 50, 30, 20, 600, 0),
                        cand(50, 100, 150, 40, -10, -20, 500, 1),
                    ]),
                    ...BASE_META,
                    options: BASE_OPTIONS,
                }),
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
        );
    });

    it('rejects non-finite LAB', () => {
        assertCode(
            () =>
                normalizePalette({
                    candidateResult: candidateResult([
                        cand(200, 100, 50, NaN, 30, 20, 1000, 0),
                    ]),
                    ...BASE_META,
                    options: BASE_OPTIONS,
                }),
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
        );
    });

    it('rejects duplicate sourceIndex', () => {
        assertCode(
            () =>
                normalizePalette({
                    candidateResult: candidateResult([
                        cand(200, 100, 50, 50, 30, 20, 500, 0),
                        cand(50, 100, 150, 40, -10, -20, 500, 0),
                    ]),
                    ...BASE_META,
                    options: BASE_OPTIONS,
                }),
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
        );
    });
});

describe('normalizePalette — cancellation', () => {
    function assertCode(fn: () => void, expectedCode: string) {
        try {
            fn();
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ColorExtractorError).code).toBe(expectedCode);
        }
    }

    it('throws COLOR_EXTRACTOR_ABORTED when signal is already aborted', () => {
        const ac = new AbortController();
        ac.abort();
        assertCode(
            () =>
                normalizePalette({
                    candidateResult: candidateResult([
                        cand(200, 100, 50, 50, 30, 20, 1000, 0),
                    ]),
                    ...BASE_META,
                    options: BASE_OPTIONS,
                    signal: ac.signal,
                }),
            'COLOR_EXTRACTOR_ABORTED',
        );
    });

    it('succeeds when signal is not aborted', () => {
        const ac = new AbortController();
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
            signal: ac.signal,
        });
        expect(result.swatches).toHaveLength(1);
    });
});

describe('normalizePalette — invariant tests', () => {
    const invariantCandidates = [
        cand(200, 100, 50, 50, 30, 20, 200, 0),
        cand(50, 100, 150, 40, -10, -20, 200, 1),
        cand(100, 180, 60, 45, 15, 10, 200, 2),
        cand(30, 60, 120, 35, -5, 15, 200, 3),
        cand(220, 40, 80, 48, 25, -10, 200, 4),
    ];

    const result = normalizePalette({
        candidateResult: candidateResult(invariantCandidates),
        ...BASE_META,
        options: BASE_OPTIONS,
    });

    it('all IDs match swatch-[0-9a-f]{6}', () => {
        const pattern = /^swatch-[0-9a-f]{6}$/;
        for (const s of result.swatches) {
            expect(s.id).toMatch(pattern);
        }
        for (const key of ['perceptual', 'population', 'chroma'] as const) {
            for (const id of result.rankings[key]) {
                expect(id).toMatch(pattern);
            }
        }
    });

    it('no duplicate IDs', () => {
        const ids = result.swatches.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('inputs are not mutated', () => {
        expect(invariantCandidates[0]!.rgb).toEqual({ r: 200, g: 100, b: 50 });
        expect(invariantCandidates[0]!.lab).toEqual({ L: 50, a: 30, b: 20 });
    });
});

describe('normalizePalette — forbidden fields', () => {
    it('result contains no primary, secondary, accent, role, fallback, sourceIndex', () => {
        const result = normalizePalette({
            candidateResult: candidateResult([
                cand(200, 100, 50, 50, 30, 20, 1000, 0),
            ]),
            ...BASE_META,
            options: BASE_OPTIONS,
        });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('primary');
        expect(serialized).not.toContain('secondary');
        expect(serialized).not.toContain('accent');
        expect(serialized).not.toContain('role');
        expect(serialized).not.toContain('fallback');
        expect(serialized).not.toContain('sourceIndex');
    });
});

describe('normalizePalette — MMCQ integration & equivalence', () => {
    it('normalizes MMCQ algorithm candidate results with identical swatch and ranking contracts', () => {
        const mmcqResult = normalizePalette({
            candidateResult: {
                algorithm: 'mmcq',
                algorithmVersion: 'mmcq-v2',
                candidates: [
                    cand(200, 100, 50, 50, 30, 20, 600, 0),
                    cand(50, 200, 100, 60, -20, 30, 400, 1),
                ],
                diagnostics: {
                    requestedBoxes: 8,
                    producedCandidates: 2,
                    histogramBits: 5,
                    occupiedBins: 2,
                    splits: 1,
                },
            },
            ...BASE_META,
            options: {
                ...BASE_OPTIONS,
                algorithm: 'mmcq',
            },
        });

        expect(mmcqResult.metadata.algorithm).toBe('mmcq');
        expect(mmcqResult.metadata.algorithmVersion).toBe('mmcq-v2');
        expect(mmcqResult.metadata.algorithmDetails).toEqual({
            algorithm: 'mmcq',
            requestedBoxes: 8,
            producedCandidates: 2,
            histogramBits: 5,
            occupiedBins: 2,
            splits: 1,
        });
        expect(mmcqResult.swatches).toHaveLength(2);
        expect(mmcqResult.swatches.map((s) => s.hex)).toEqual([
            '#32c864',
            '#c86432',
        ]);
        expect(mmcqResult.metadata.returnedPopulation).toBe(1000);
        expect(mmcqResult.metadata.coverage).toBe(1);
    });
});
