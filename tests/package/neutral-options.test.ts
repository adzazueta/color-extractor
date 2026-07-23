import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
    AdvancedExtractionOptions,
    BaseExtractPaletteOptions,
    BrowserDecodeOptions,
    BrowserExtractPaletteOptions,
    CoreExtractPaletteOptions,
    ExtractPaletteOptions,
    FilteringOptions,
    LabKmeansOptions,
    NodeDecodeOptions,
    NodeExtractPaletteOptions,
    NodeRemoteOptions,
    PaletteResultOptions,
    PerceptualRankingOptions,
    SamplingOptions,
} from '../../src/core/neutral-options.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');

describe('neutral option types', () => {
    it('SamplingOptions accepts maxDimension', () => {
        const opts: SamplingOptions = { maxDimension: 200 };
        expect(opts.maxDimension).toBe(200);
    });

    it('SamplingOptions defaults to empty', () => {
        const opts: SamplingOptions = {};
        expect(opts).toEqual({});
    });

    it('FilteringOptions accepts filter thresholds', () => {
        const opts: FilteringOptions = {
            alphaThreshold: 10,
            minBrightness: 20,
        };
        expect(opts.alphaThreshold).toBe(10);
    });

    it('FilteringOptions partial', () => {
        const opts: FilteringOptions = {};
        expect(opts).toEqual({});
    });

    it('PaletteResultOptions accepts maxColors and includeHsl', () => {
        const opts: PaletteResultOptions = { maxColors: 8, includeHsl: true };
        expect(opts.maxColors).toBe(8);
        expect(opts.includeHsl).toBe(true);
    });

    it('PaletteResultOptions partial', () => {
        const opts: PaletteResultOptions = { maxColors: 5 };
        expect(opts.maxColors).toBe(5);
    });

    it('LabKmeansOptions accepts clusters and iterations', () => {
        const opts: LabKmeansOptions = { clusters: 10, iterations: 50 };
        expect(opts.clusters).toBe(10);
    });

    it('LabKmeansOptions partial', () => {
        const opts: LabKmeansOptions = {};
        expect(opts).toEqual({});
    });

    it('PerceptualRankingOptions accepts chromaFloor and lowChromaPenalty', () => {
        const opts: PerceptualRankingOptions = {
            chromaFloor: 5,
            lowChromaPenalty: 0.3,
        };
        expect(opts.chromaFloor).toBe(5);
    });

    it('PerceptualRankingOptions partial', () => {
        const opts: PerceptualRankingOptions = {};
        expect(opts).toEqual({});
    });

    it('AdvancedExtractionOptions nests labKmeans and perceptualRanking', () => {
        const opts: AdvancedExtractionOptions = {
            labKmeans: { clusters: 12 },
            perceptualRanking: { chromaFloor: 3 },
        };
        expect(opts.labKmeans?.clusters).toBe(12);
    });

    it('BaseExtractPaletteOptions accepts grouped options', () => {
        const opts: BaseExtractPaletteOptions = {
            sampling: { maxDimension: 300 },
            filtering: { alphaThreshold: 10 },
            result: { maxColors: 6, includeHsl: false },
            advanced: { labKmeans: { clusters: 15 } },
        };
        expect(opts.result?.maxColors).toBe(6);
    });

    it('BaseExtractPaletteOptions accepts signal', () => {
        const ac = new AbortController();
        const opts: BaseExtractPaletteOptions = { signal: ac.signal };
        expect(opts.signal).toBe(ac.signal);
    });

    it('CoreExtractPaletteOptions is the same as BaseExtractPaletteOptions', () => {
        const opts: CoreExtractPaletteOptions = {
            sampling: { maxDimension: 100 },
            advanced: { labKmeans: { clusters: 8 } },
        };
        expect(opts.sampling?.maxDimension).toBe(100);
    });

    it('BrowserDecodeOptions accepts maxPixels', () => {
        const opts: BrowserDecodeOptions = { maxPixels: 50_000_000 };
        expect(opts.maxPixels).toBe(50_000_000);
    });

    it('BrowserExtractPaletteOptions combines core and browser decode', () => {
        const opts: BrowserExtractPaletteOptions = {
            result: { maxColors: 5 },
            decode: { maxPixels: 20_000_000 },
        };
        expect(opts.decode?.maxPixels).toBe(20_000_000);
    });

    it('NodeDecodeOptions accepts maxPixels, animated, svg', () => {
        const opts: NodeDecodeOptions = {
            maxPixels: 100_000_000,
            animated: 'first-frame',
            svg: 'enabled',
            respectOrientation: true,
            normalizeColorProfile: true,
        };
        expect(opts.maxPixels).toBe(100_000_000);
    });

    it('NodeRemoteOptions accepts timeoutMs, maxBytes, maxRedirects', () => {
        const opts: NodeRemoteOptions = {
            timeoutMs: 10_000,
            maxBytes: 50_000_000,
            maxRedirects: 5,
            allowedProtocols: ['http:', 'https:'],
            allowPrivateNetworks: false,
            validateContentType: true,
        };
        expect(opts.timeoutMs).toBe(10_000);
    });

    it('NodeExtractPaletteOptions combines base, node decode, node remote', () => {
        const opts: NodeExtractPaletteOptions = {
            result: { maxColors: 10 },
            decode: { maxPixels: 50_000_000, animated: 'first-frame' },
            remote: { timeoutMs: 5_000, maxBytes: 10_000_000 },
        };
        expect(opts.decode?.maxPixels).toBe(50_000_000);
        expect(opts.remote?.timeoutMs).toBe(5_000);
    });

    it('ExtractPaletteOptions union accepts browser shape', () => {
        const opts: ExtractPaletteOptions = {
            result: { maxColors: 3 },
            decode: { maxPixels: 10_000_000 },
        } satisfies BrowserExtractPaletteOptions;
        expect(opts).toBeDefined();
    });

    it('ExtractPaletteOptions union accepts node shape', () => {
        const opts: ExtractPaletteOptions = {
            result: { maxColors: 8 },
            decode: { maxPixels: 100_000_000, animated: 'first-frame' },
            remote: { timeoutMs: 10_000, maxBytes: 50_000_000 },
        } satisfies NodeExtractPaletteOptions;
        expect(opts).toBeDefined();
    });

    it('ExtractPaletteOptions union accepts core shape', () => {
        const opts: ExtractPaletteOptions = {
            sampling: { maxDimension: 200 },
            advanced: { labKmeans: { clusters: 10 } },
        } satisfies CoreExtractPaletteOptions;
        expect(opts).toBeDefined();
    });
});

describe('neutral option types — root and core entrypoints', () => {
    const ROOT_OPTION_TYPES = [
        'AdvancedExtractionOptions',
        'BaseExtractPaletteOptions',
        'BrowserDecodeOptions',
        'BrowserExtractPaletteOptions',
        'CoreExtractPaletteOptions',
        'ExtractPaletteOptions',
        'LabKmeansOptions',
        'NodeDecodeOptions',
        'NodeExtractPaletteOptions',
        'NodeRemoteOptions',
        'PaletteResultOptions',
        'PerceptualRankingOptions',
        'SamplingOptions',
    ];

    function assertDtsExports(relPath: string, names: string[]) {
        const dts = readFileSync(resolve(rootDir, relPath), 'utf-8');
        for (const name of names) {
            expect(dts).toMatch(new RegExp(`\\b${name}\\b`));
        }
    }

    it('exports from root declarations', () => {
        assertDtsExports('dist/index.d.ts', ROOT_OPTION_TYPES);
    });

    it('exports from core declarations', () => {
        assertDtsExports('dist/core/index.d.ts', ROOT_OPTION_TYPES);
    });
});

describe('neutral option types — browser entrypoint', () => {
    const BROWSER_OPTION_TYPES = [
        'AdvancedExtractionOptions',
        'BaseExtractPaletteOptions',
        'BrowserDecodeOptions',
        'BrowserExtractPaletteOptions',
        'ExtractPaletteOptions',
        'LabKmeansOptions',
        'PaletteResultOptions',
        'PerceptualRankingOptions',
        'SamplingOptions',
    ];

    it('exports neutral types without node- or core-specific types', () => {
        const dts = readFileSync(
            resolve(rootDir, 'dist/browser/index.d.ts'),
            'utf-8',
        );
        for (const name of BROWSER_OPTION_TYPES) {
            expect(dts).toMatch(new RegExp(`\\b${name}\\b`));
        }
        expect(dts).not.toMatch(/\bNodeDecodeOptions\b/);
        expect(dts).not.toMatch(/\bNodeExtractPaletteOptions\b/);
        expect(dts).not.toMatch(/\bNodeRemoteOptions\b/);
        expect(dts).not.toMatch(/\bCoreExtractPaletteOptions\b/);
    });
});

describe('neutral option types — node entrypoint', () => {
    const NODE_OPTION_TYPES = [
        'AdvancedExtractionOptions',
        'BaseExtractPaletteOptions',
        'ExtractPaletteOptions',
        'LabKmeansOptions',
        'NodeDecodeOptions',
        'NodeExtractPaletteOptions',
        'NodeRemoteOptions',
        'PaletteResultOptions',
        'PerceptualRankingOptions',
        'SamplingOptions',
    ];

    it('exports neutral types without browser-specific types', () => {
        const dts = readFileSync(
            resolve(rootDir, 'dist/node/index.d.ts'),
            'utf-8',
        );
        for (const name of NODE_OPTION_TYPES) {
            expect(dts).toMatch(new RegExp(`\\b${name}\\b`));
        }
        expect(dts).not.toMatch(/\bBrowserDecodeOptions\b/);
        expect(dts).not.toMatch(/\bBrowserExtractPaletteOptions\b/);
        expect(dts).not.toMatch(/\bCoreExtractPaletteOptions\b/);
    });
});

describe('dist output type isolation', () => {
    function readDts(relPath: string): string {
        return readFileSync(resolve(rootDir, relPath), 'utf-8');
    }

    it('core dist does not reference browser-specific globals', () => {
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

describe('null option value validation', () => {
    it('rejects null values for numeric and boolean options', async () => {
        const { resolveNeutralOptions } = await import(
            '../../src/core/neutral-options.js'
        );
        const { ColorExtractorError } = await import(
            '../../src/core/errors.js'
        );

        expect(() =>
            resolveNeutralOptions(
                { result: { maxColors: null as unknown as number } },
                'core',
            ),
        ).toThrowError(ColorExtractorError);

        expect(() =>
            resolveNeutralOptions(
                { result: { includeHsl: null as unknown as boolean } },
                'core',
            ),
        ).toThrowError(ColorExtractorError);

        expect(() =>
            resolveNeutralOptions(
                { sampling: { maxDimension: null as unknown as number } },
                'core',
            ),
        ).toThrowError(ColorExtractorError);
    });
});
