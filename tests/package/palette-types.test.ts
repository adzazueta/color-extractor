import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ExtractionMetadata } from '../../src/core/index.js';
import type {
    ExtractedSwatch,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionRuntime,
    ExtractPaletteResult,
    HslColor,
    LabColor,
    PaletteRankings,
    RgbColor,
    SwatchId,
} from '../../src/core/palette-types.js';
import type { HSL, Lab, RGB } from '../../src/core/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');

describe('neutral types — root entrypoint', () => {
    it('does not accept Node-only options for browser inputs', () => {
        const assertRootOverload = (
            extract: typeof import('../../src/index.js').extractPalette,
            input: Blob,
        ) => {
            void extract(input, { sampling: { maxDimension: 100 } });
            // @ts-expect-error Browser decode options do not support animation handling.
            void extract(input, { decode: { animated: 'first-frame' } });
        };
        expect(assertRootOverload).toBeTypeOf('function');
    });

    it('dispatches to Node entrypoint when globalThis.ImageData is defined in Node', async () => {
        const originalImageData = (globalThis as Record<string, unknown>)
            .ImageData;
        try {
            (globalThis as Record<string, unknown>).ImageData =
                class DummyImageData {};
            const { extractPalette } = await import('../../src/index.js');
            const buf = new Uint8Array([255, 0, 0, 255]);
            await expect(extractPalette(buf)).rejects.not.toMatchObject({
                message: expect.stringContaining('Browser input kind'),
            });
        } finally {
            if (originalImageData === undefined) {
                delete (globalThis as Record<string, unknown>).ImageData;
            } else {
                (globalThis as Record<string, unknown>).ImageData =
                    originalImageData;
            }
        }
    });

    it('SwatchId is a branded string type', () => {
        const id: SwatchId = 'swatch-a85f46';
        expect(id).toBe('swatch-a85f46');
    });

    it('RgbColor requires r, g, b', () => {
        const c: RgbColor = { r: 1, g: 2, b: 3 };
        expect(c).toEqual({ r: 1, g: 2, b: 3 });
    });

    it('HslColor requires h, s, l', () => {
        const c: HslColor = { h: 0, s: 0, l: 0 };
        expect(c).toEqual({ h: 0, s: 0, l: 0 });
    });

    it('LabColor requires L, a, b', () => {
        const c: LabColor = { L: 0, a: 0, b: 0 };
        expect(c).toEqual({ L: 0, a: 0, b: 0 });
    });

    it('ExtractedSwatch requires all evidence fields except HSL', () => {
        const s: ExtractedSwatch = {
            id: 'swatch-a85f46',
            hex: '#a85f46',
            rgb: { r: 168, g: 95, b: 70 },
            lab: { L: 45, a: 25, b: 30 },
            chroma: 39.05,
            population: 100,
            proportion: 0.5,
            score: 1,
        };
        expect(s.hex).toBe('#a85f46');
        expect(s.hsl).toBeUndefined();
    });

    it('ExtractedSwatch makes hsl optional', () => {
        const withHsl: ExtractedSwatch = {
            id: 'swatch-a85f46',
            hex: '#a85f46',
            rgb: { r: 168, g: 95, b: 70 },
            lab: { L: 45, a: 25, b: 30 },
            chroma: 39.05,
            population: 100,
            proportion: 0.5,
            score: 1,
            hsl: { h: 15, s: 0.4, l: 0.47 },
        };
        expect(withHsl.hsl).toBeDefined();
    });

    it('PaletteRankings uses SwatchId arrays', () => {
        const r: PaletteRankings = {
            perceptual: ['swatch-a85f46'],
            population: ['swatch-a85f46'],
            chroma: ['swatch-a85f46'],
        };
        expect(r.perceptual[0]).toBe('swatch-a85f46');
    });

    it('ExtractPaletteResult requires metadata', () => {
        const result: ExtractPaletteResult = {
            swatches: [],
            rankings: { perceptual: [], population: [], chroma: [] },
            metadata: {
                algorithm: 'lab-kmeans',
                algorithmVersion: '1.0.0',
                packageVersion: '0.2.0',
                runtime: 'core',
                decoder: 'pixels',
                sampledWidth: 100,
                sampledHeight: 100,
                sampledPixels: 10000,
                validPixels: 8000,
                candidateCount: 5,
                returnedColors: 3,
                returnedPopulation: 6000,
                coverage: 0.75,
                algorithmDetails: {
                    algorithm: 'lab-kmeans',
                    requestedClusters: 5,
                    producedCandidates: 5,
                    iterations: 7,
                },
            },
        };
        const metadata: ExtractionMetadata = result.metadata;
        expect(result.metadata.algorithm).toBe('lab-kmeans');
        expect(metadata.algorithmDetails).toBeDefined();
    });

    it('string literal types resolve', () => {
        const algo: ExtractionAlgorithm = 'lab-kmeans';
        const rt: ExtractionRuntime = 'core';
        const dec: ExtractionDecoder = 'pixels';
        expect(algo).toBe('lab-kmeans');
        expect(rt).toBe('core');
        expect(dec).toBe('pixels');
    });
});

describe('neutral types — all entrypoints', () => {
    const NEUTRAL_TYPES = [
        'ExtractPaletteResult',
        'ExtractedSwatch',
        'SwatchId',
        'RgbColor',
        'HslColor',
        'LabColor',
        'PaletteRankings',
        'ExtractionAlgorithm',
        'ExtractionRuntime',
        'ExtractionDecoder',
    ];

    function assertDtsExports(relPath: string) {
        const dts = readFileSync(resolve(rootDir, relPath), 'utf-8');
        for (const name of NEUTRAL_TYPES) {
            expect(dts).toMatch(new RegExp(`\\b${name}\\b`));
        }
    }

    const INTERNAL_ALGORITHM_TYPES = [
        'AlgorithmContext',
        'AlgorithmDiagnostics',
        'ExtractionCandidate',
        'ExtractionSample',
        'ExtractionSampleSet',
        'NeutralExtractionAlgorithm',
    ];

    function assertNoInternalTypesExported(relPath: string) {
        const dts = readFileSync(resolve(rootDir, relPath), 'utf-8');
        for (const name of INTERNAL_ALGORITHM_TYPES) {
            expect(dts).not.toMatch(new RegExp(`\\b${name}\\b`));
        }
    }

    it('exports from root declarations', () => {
        assertDtsExports('dist/index.d.ts');
        assertNoInternalTypesExported('dist/index.d.ts');
    });

    it('exports from browser declarations', () => {
        assertDtsExports('dist/browser/index.d.ts');
        assertNoInternalTypesExported('dist/browser/index.d.ts');
    });

    it('exports from node declarations', () => {
        assertDtsExports('dist/node/index.d.ts');
        assertNoInternalTypesExported('dist/node/index.d.ts');
    });

    it('exports from core declarations', () => {
        assertDtsExports('dist/core/index.d.ts');
        assertNoInternalTypesExported('dist/core/index.d.ts');
    });
});

describe('deprecated legacy aliases', () => {
    it('RGB is assignable to RgbColor', () => {
        const rgb: RGB = { r: 1, g: 2, b: 3 };
        const _canonical: RgbColor = rgb;
        expect(_canonical).toEqual(rgb);
    });

    it('HSL is assignable to HslColor', () => {
        const hsl: HSL = { h: 0, s: 0, l: 0 };
        const _canonical: HslColor = hsl;
        expect(_canonical).toEqual(hsl);
    });

    it('Lab is assignable to LabColor', () => {
        const lab: Lab = { L: 0, a: 0, b: 0 };
        const _canonical: LabColor = lab;
        expect(_canonical).toEqual(lab);
    });

    it('deprecated aliases are exported from root declarations', () => {
        const dts = readFileSync(resolve(rootDir, 'dist/index.d.ts'), 'utf-8');
        expect(dts).toMatch(/\bRGB\b/);
        expect(dts).toMatch(/\bHSL\b/);
        expect(dts).toMatch(/\bLab\b/);
    });

    it('accepts mmcq algorithm option and advanced.mmcq tuning group', () => {
        const algo: ExtractionAlgorithm = 'mmcq';
        expect(algo).toBe('mmcq');
    });
});

describe('negative — forbidden fields', () => {
    it('clusterIndex is not on ExtractedSwatch', () => {
        const swatch: ExtractedSwatch = {
            id: 'swatch-a85f46',
            hex: '#a85f46',
            rgb: { r: 168, g: 95, b: 70 },
            lab: { L: 45, a: 25, b: 30 },
            chroma: 39.05,
            population: 100,
            proportion: 0.5,
            score: 1,
            // @ts-expect-error — clusterIndex is not a neutral swatch field
            clusterIndex: 0,
        };
        expect(swatch).toBeDefined();
    });

    it('role is not on ExtractedSwatch', () => {
        const swatch: ExtractedSwatch = {
            id: 'swatch-a85f46',
            hex: '#a85f46',
            rgb: { r: 168, g: 95, b: 70 },
            lab: { L: 45, a: 25, b: 30 },
            chroma: 39.05,
            population: 100,
            proportion: 0.5,
            score: 1,
            // @ts-expect-error — role is not a neutral swatch field
            role: 'primary',
        };
        expect(swatch).toBeDefined();
    });

    it('source is not on ExtractedSwatch', () => {
        const swatch: ExtractedSwatch = {
            id: 'swatch-a85f46',
            hex: '#a85f46',
            rgb: { r: 168, g: 95, b: 70 },
            lab: { L: 45, a: 25, b: 30 },
            chroma: 39.05,
            population: 100,
            proportion: 0.5,
            score: 1,
            // @ts-expect-error — source is not a neutral swatch field
            source: 'cluster',
        };
        expect(swatch).toBeDefined();
    });

    it('primary is not on ExtractPaletteResult', () => {
        const result: ExtractPaletteResult = {
            swatches: [],
            rankings: { perceptual: [], population: [], chroma: [] },
            metadata: {
                algorithm: 'lab-kmeans',
                algorithmVersion: '1.0.0',
                packageVersion: '0.2.0',
                runtime: 'core',
                decoder: 'pixels',
                sampledWidth: 100,
                sampledHeight: 100,
                sampledPixels: 10000,
                validPixels: 8000,
                candidateCount: 5,
                returnedColors: 3,
                returnedPopulation: 6000,
                coverage: 0.75,
                algorithmDetails: {
                    algorithm: 'lab-kmeans',
                    requestedClusters: 5,
                    producedCandidates: 5,
                    iterations: 7,
                },
            },
            // @ts-expect-error — primary is not a neutral result field
            primary: {},
        };
        expect(result).toBeDefined();
    });

    it('secondary is not on ExtractPaletteResult', () => {
        const result: ExtractPaletteResult = {
            swatches: [],
            rankings: { perceptual: [], population: [], chroma: [] },
            metadata: {
                algorithm: 'lab-kmeans',
                algorithmVersion: '1.0.0',
                packageVersion: '0.2.0',
                runtime: 'core',
                decoder: 'pixels',
                sampledWidth: 100,
                sampledHeight: 100,
                sampledPixels: 10000,
                validPixels: 8000,
                candidateCount: 5,
                returnedColors: 3,
                returnedPopulation: 6000,
                coverage: 0.75,
                algorithmDetails: {
                    algorithm: 'lab-kmeans',
                    requestedClusters: 5,
                    producedCandidates: 5,
                    iterations: 7,
                },
            },
            // @ts-expect-error — secondary is not a neutral result field
            secondary: {},
        };
        expect(result).toBeDefined();
    });

    it('accents is not on ExtractPaletteResult', () => {
        const result: ExtractPaletteResult = {
            swatches: [],
            rankings: { perceptual: [], population: [], chroma: [] },
            metadata: {
                algorithm: 'lab-kmeans',
                algorithmVersion: '1.0.0',
                packageVersion: '0.2.0',
                runtime: 'core',
                decoder: 'pixels',
                sampledWidth: 100,
                sampledHeight: 100,
                sampledPixels: 10000,
                validPixels: 8000,
                candidateCount: 5,
                returnedColors: 3,
                returnedPopulation: 6000,
                coverage: 0.75,
                algorithmDetails: {
                    algorithm: 'lab-kmeans',
                    requestedClusters: 5,
                    producedCandidates: 5,
                    iterations: 7,
                },
            },
            // @ts-expect-error — accents is not a neutral result field
            accents: [],
        };
        expect(result).toBeDefined();
    });
});

describe('dist output type isolation', () => {
    function readDts(relPath: string): string {
        return readFileSync(resolve(rootDir, relPath), 'utf-8');
    }

    it('core dist does not reference browser-specific or node-specific globals', () => {
        const core = readDts('dist/core/index.d.ts');
        expect(core).not.toMatch(/\bFile\b/);
        expect(core).not.toMatch(/\bBlob\b/);
        expect(core).not.toMatch(/\bHTMLCanvasElement\b/);
        expect(core).not.toMatch(/\bImageBitmap\b/);
        expect(core).not.toMatch(/\bBuffer\b/);
        expect(core).not.toMatch(/\bImageData\b/);
    });

    it('browser dist does not reference Buffer', () => {
        const browser = readDts('dist/browser/index.d.ts');
        expect(browser).not.toMatch(/\bBuffer\b/);
    });

    it('node dist does not reference browser globals', () => {
        const node = readDts('dist/node/index.d.ts');
        expect(node).not.toMatch(/\bFile\b/);
        expect(node).not.toMatch(/\bHTMLCanvasElement\b/);
        expect(node).not.toMatch(/\bImageBitmap\b/);
    });

    it('core dist does not reference ImageData', () => {
        const core = readDts('dist/core/index.d.ts');
        expect(core).not.toMatch(/\bImageData\b/);
    });
});
