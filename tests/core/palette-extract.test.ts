import { afterEach, describe, expect, it } from 'vitest';
import { ColorExtractorError } from '../../src/core/errors.js';
import { extractPaletteFromPixels } from '../../src/core/extract.js';
import type { CoreExtractPaletteOptions } from '../../src/core/neutral-options.js';

function rgbSet(pixels: { r: number; g: number; b: number }[]): string[] {
    return pixels.map((p) => `${p.r},${p.g},${p.b}`);
}

function pixelData(
    width: number,
    height: number,
    colors: { r: number; g: number; b: number }[],
): Uint8Array {
    const channels = 4;
    const data = new Uint8Array(width * height * channels);
    for (let i = 0; i < width * height; i++) {
        const c = colors[i % colors.length]!;
        const off = i * channels;
        data[off] = c.r;
        data[off + 1] = c.g;
        data[off + 2] = c.b;
        data[off + 3] = 255;
    }
    return data;
}

const PERMISSIVE_FILTER: CoreExtractPaletteOptions['filtering'] = {
    minBrightness: 0,
    maxBrightness: 255,
    minSaturation: 0,
};

describe('extractPaletteFromPixels — observed RGB', () => {
    it('returns swatches whose RGB exists in the input pixels (solid color)', async () => {
        const result = await extractPaletteFromPixels(
            {
                data: pixelData(2, 2, [{ r: 200, g: 150, b: 100 }]),
                width: 2,
                height: 2,
                channels: 4,
            },
            {
                filtering: PERMISSIVE_FILTER,
                result: { maxColors: 1 },
                advanced: { labKmeans: { clusters: 1 } },
            },
        );

        expect(result.swatches).toHaveLength(1);
        expect(result.swatches[0]!.rgb).toEqual({ r: 200, g: 150, b: 100 });
        expect(result.swatches[0]!.hex).toBe('#c89664');
        expect(result.swatches[0]!.lab).toBeDefined();
    });

    it('returns swatches whose RGB exists in the input (more pixels than clusters, intermediate centroid)', async () => {
        const colors = [
            { r: 220, g: 50, b: 50 },
            { r: 210, g: 60, b: 55 },
            { r: 50, g: 150, b: 200 },
            { r: 55, g: 140, b: 210 },
            { r: 220, g: 50, b: 50 },
            { r: 210, g: 60, b: 55 },
            { r: 50, g: 150, b: 200 },
            { r: 55, g: 140, b: 210 },
        ];
        const result = await extractPaletteFromPixels(
            {
                data: pixelData(8, 1, colors),
                width: 8,
                height: 1,
                channels: 4,
            },
            {
                filtering: PERMISSIVE_FILTER,
                result: { maxColors: 2 },
                advanced: { labKmeans: { clusters: 2, iterations: 30 } },
            },
        );

        const inputKeys = rgbSet(colors);
        for (const swatch of result.swatches) {
            expect(inputKeys).toContain(
                `${swatch.rgb.r},${swatch.rgb.g},${swatch.rgb.b}`,
            );
        }
    });

    it('Lab and chroma are recalculated from canonical RGB', async () => {
        const result = await extractPaletteFromPixels(
            {
                data: pixelData(2, 2, [{ r: 200, g: 150, b: 100 }]),
                width: 2,
                height: 2,
                channels: 4,
            },
            {
                filtering: PERMISSIVE_FILTER,
                result: { maxColors: 1 },
                advanced: { labKmeans: { clusters: 1 } },
            },
        );

        const swatch = result.swatches[0]!;
        const lab = swatch.lab;

        expect(lab.L).toBeGreaterThan(50);
        expect(lab.L).toBeLessThan(70);

        const chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
        expect(chroma).toBeGreaterThan(30);
        expect(chroma).toBeLessThan(50);
    });
});

describe('extractPaletteFromPixels — abort with arbitrary reason', () => {
    it('rejects with COLOR_EXTRACTOR_ABORTED when abort reason is a string', async () => {
        const ac = new AbortController();
        ac.abort('user cancelled');

        await expect(
            extractPaletteFromPixels(
                {
                    data: pixelData(2, 2, [{ r: 200, g: 150, b: 100 }]),
                    width: 2,
                    height: 2,
                    channels: 4,
                },
                {
                    signal: ac.signal,
                    filtering: PERMISSIVE_FILTER,
                    result: { maxColors: 1 },
                    advanced: { labKmeans: { clusters: 1 } },
                },
            ),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_ABORTED' });
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when abort reason is a ColorExtractorError with non-ABORTED code', async () => {
        const ac = new AbortController();
        ac.abort(
            new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                'timeout from caller',
            ),
        );

        await expect(
            extractPaletteFromPixels(
                {
                    data: pixelData(2, 2, [{ r: 200, g: 150, b: 100 }]),
                    width: 2,
                    height: 2,
                    channels: 4,
                },
                {
                    signal: ac.signal,
                    filtering: PERMISSIVE_FILTER,
                    result: { maxColors: 1 },
                    advanced: { labKmeans: { clusters: 1 } },
                },
            ),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_ABORTED' });
    });
});

describe('extractPaletteFromPixels — Object.prototype pollution regression', () => {
    afterEach(() => {
        delete (Object.prototype as Record<string, unknown>).remote;
        delete (Object.prototype as Record<string, unknown>)
            .allowPrivateNetworks;
        delete (Object.prototype as Record<string, unknown>).allowedProtocols;
        delete (Object.prototype as Record<string, unknown>)
            .validateContentType;
        delete (Object.prototype as Record<string, unknown>).maxPixels;
        delete (Object.prototype as Record<string, unknown>).maxDimension;
        delete (Object.prototype as Record<string, unknown>).animated;
        delete (Object.prototype as Record<string, unknown>).labKmeans;
        delete (Object.prototype as Record<string, unknown>).perceptualRanking;
        delete (Object.prototype as Record<string, unknown>).clusters;
        delete (Object.prototype as Record<string, unknown>).chromaFloor;
    });

    it('ignores Object.prototype.remote when options is a plain {}', async () => {
        (Object.prototype as Record<string, unknown>).remote = {
            allowPrivateNetworks: true,
        };

        const result = await extractPaletteFromPixels(
            {
                data: pixelData(2, 2, [{ r: 200, g: 150, b: 100 }]),
                width: 2,
                height: 2,
                channels: 4,
            },
            {
                filtering: PERMISSIVE_FILTER,
                result: { maxColors: 1 },
                advanced: { labKmeans: { clusters: 1 } },
            },
        );

        expect(result.swatches).toHaveLength(1);
    });

    it('ignores Object.prototype.allowPrivateNetworks inside remote: {}', async () => {
        (Object.prototype as Record<string, unknown>).allowPrivateNetworks =
            true;
        (Object.prototype as Record<string, unknown>).allowedProtocols = [
            'http:',
        ];
        (Object.prototype as Record<string, unknown>).validateContentType =
            false;

        const { resolveNeutralOptions } = await import(
            '../../src/core/neutral-options.js'
        );

        const opts = resolveNeutralOptions(
            { remote: {} } as Record<string, unknown>,
            'node',
        );

        expect(opts.remote.allowPrivateNetworks).toBe(false);
        expect(opts.remote.allowedProtocols).toEqual(['http:', 'https:']);
        expect(opts.remote.validateContentType).toBe(true);
    });

    it('ignores Object.prototype.maxPixels inside decode: {}', async () => {
        (Object.prototype as Record<string, unknown>).maxPixels = 999;

        const { resolveNeutralOptions } = await import(
            '../../src/core/neutral-options.js'
        );

        const opts = resolveNeutralOptions(
            { decode: {} } as Record<string, unknown>,
            'browser',
        );

        expect(opts.decode.maxPixels).toBe(25_000_000);
    });
});

describe('resolveNeutralOptions — allowedProtocols default isolation', () => {
    it('mutating a resolved remote.allowedProtocols does not affect later resolutions', async () => {
        const { resolveNeutralOptions } = await import(
            '../../src/core/neutral-options.js'
        );

        const first = resolveNeutralOptions(
            { remote: { allowedProtocols: ['http:'] } },
            'node',
        );
        (first.remote.allowedProtocols as string[]).push('https:');

        const second = resolveNeutralOptions(
            { remote: { allowedProtocols: ['http:'] } },
            'node',
        );
        expect(second.remote.allowedProtocols).toEqual(['http:']);
    });

    it('mutating allowedProtocols from the default path does not affect later resolutions', async () => {
        const { resolveNeutralOptions } = await import(
            '../../src/core/neutral-options.js'
        );

        const first = resolveNeutralOptions(
            { result: { maxColors: 3 } },
            'node',
        );
        (first.remote.allowedProtocols as string[]).push('ftp:');

        const second = resolveNeutralOptions(
            { result: { maxColors: 3 } },
            'node',
        );
        expect(second.remote.allowedProtocols).toEqual(['http:', 'https:']);
    });

    it('ignores Object.prototype.labKmeans inside advanced: {}', async () => {
        (Object.prototype as Record<string, unknown>).labKmeans = {
            clusters: 999,
            iterations: 999,
        };
        (Object.prototype as Record<string, unknown>).perceptualRanking = {
            chromaFloor: 999,
            lowChromaPenalty: 999,
        };

        const { resolveNeutralOptions: resolveOpts } = await import(
            '../../src/core/neutral-options.js'
        );

        const opts = resolveOpts(
            { advanced: {}, result: { maxColors: 3 } } as Record<
                string,
                unknown
            >,
            'core',
        );

        expect(opts.advanced.labKmeans.clusters).toBeGreaterThanOrEqual(3);
        expect(opts.advanced.labKmeans.clusters).not.toBe(999);
        expect(opts.advanced.perceptualRanking.chromaFloor).toBe(12);
        expect(opts.advanced.perceptualRanking.lowChromaPenalty).toBe(0.1);
    });
});
