import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    type ColorPixelInput,
    extractColorsFromPixels,
} from '../../../src/core/extract.js';
import { ColorExtractorError } from '../../../src/core/index.js';

const PKG_VERSION: string = JSON.parse(
    readFileSync(
        resolve(
            dirname(fileURLToPath(import.meta.url)),
            '../../../package.json',
        ),
        'utf-8',
    ),
).version;

function makePixels(
    width: number,
    height: number,
    fill: { r?: number; g?: number; b?: number; a?: number } = {},
): ColorPixelInput {
    const r = fill.r ?? 128;
    const g = fill.g ?? 128;
    const b = fill.b ?? 128;
    const a = fill.a ?? 255;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
    }
    return { data, width, height, channels: 4 };
}

function makeBicolorPixels(
    width: number,
    height: number,
    primary: { r: number; g: number; b: number },
    secondary: { r: number; g: number; b: number },
): ColorPixelInput {
    const data = new Uint8Array(width * height * 4);
    const half = (width * height) / 2;
    for (let i = 0; i < width * height; i++) {
        const c = i < half ? primary : secondary;
        const o = i * 4;
        data[o] = c.r;
        data[o + 1] = c.g;
        data[o + 2] = c.b;
        data[o + 3] = 255;
    }
    return { data, width, height, channels: 4 };
}

describe('extractColorsFromPixels (e2e pipeline)', () => {
    describe('pipeline runs end-to-end', () => {
        it('produces colors from a uniform red image', async () => {
            const result = await extractColorsFromPixels(
                makePixels(20, 20, { r: 200, g: 20, b: 20 }),
            );
            expect(result.colors.length).toBeGreaterThan(0);
            expect(result.colors[0]!.hex).toMatch(/^#[0-9a-f]{6}$/);
        });

        it('returns deterministic color IDs', async () => {
            const result = await extractColorsFromPixels(
                makePixels(20, 20, { r: 200, g: 20, b: 20 }),
            );
            for (const color of result.colors) {
                expect(color.id).toMatch(/^color-/);
            }
        });

        it('colors have consistent hex and rgb', async () => {
            const result = await extractColorsFromPixels(
                makePixels(20, 20, { r: 200, g: 20, b: 20 }),
            );
            for (const color of result.colors) {
                const hex = color.hex;
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                expect(r).toBe(color.rgb.r);
                expect(g).toBe(color.rgb.g);
                expect(b).toBe(color.rgb.b);
            }
        });
    });

    describe('bicolor images produce multiple colors', () => {
        it('extracts distinct colors from a red/blue split image', async () => {
            const result = await extractColorsFromPixels(
                makeBicolorPixels(
                    40,
                    40,
                    { r: 220, g: 30, b: 30 },
                    { r: 30, g: 30, b: 220 },
                ),
            );
            expect(result.colors.length).toBeGreaterThanOrEqual(2);
        });

        it('rankings reference valid color IDs', async () => {
            const result = await extractColorsFromPixels(
                makeBicolorPixels(
                    40,
                    40,
                    { r: 220, g: 30, b: 30 },
                    { r: 30, g: 200, b: 220 },
                ),
            );
            const colorIds = new Set(result.colors.map((c) => c.id));
            for (const id of result.rankings.perceptual) {
                expect(colorIds.has(id)).toBe(true);
            }
            for (const id of result.rankings.population) {
                expect(colorIds.has(id)).toBe(true);
            }
            for (const id of result.rankings.chroma) {
                expect(colorIds.has(id)).toBe(true);
            }
        });
    });

    describe('metadata is complete', () => {
        it('metadata has all required fields', async () => {
            const result = await extractColorsFromPixels(
                makePixels(20, 20, { r: 200, g: 20, b: 20 }),
            );
            expect(result.metadata.algorithm).toBe('lab-kmeans');
            expect(result.metadata.packageVersion).toBe(PKG_VERSION);
            expect(result.metadata.algorithmVersion).toBeDefined();
            expect(result.metadata.sampledPixels).toBeGreaterThan(0);
            expect(result.metadata.validPixels).toBeGreaterThan(0);
            expect(result.metadata.candidateCount).toBeGreaterThan(0);
            expect(result.metadata.returnedColors).toBeGreaterThan(0);
            expect(result.metadata.runtime).toBe('core');
            expect(result.metadata.decoder).toBe('pixels');
        });

        it('algorithmDetails contains lab-kmeans specific fields', async () => {
            const result = await extractColorsFromPixels(
                makePixels(20, 20, { r: 200, g: 20, b: 20 }),
            );
            const details = result.metadata.algorithmDetails;
            expect(details.algorithm).toBe('lab-kmeans');
            if (details.algorithm === 'lab-kmeans') {
                expect(details.requestedClusters).toBeGreaterThan(0);
                expect(details.producedCandidates).toBeGreaterThan(0);
                expect(details.iterations).toBeGreaterThan(0);
            }
        });
    });

    describe('coverage and population', () => {
        it('coverage is between 0 and 1', async () => {
            const result = await extractColorsFromPixels(
                makePixels(20, 20, { r: 200, g: 20, b: 20 }),
            );
            expect(result.metadata.coverage).toBeGreaterThan(0);
            expect(result.metadata.coverage).toBeLessThanOrEqual(1);
        });

        it('returnedPopulation equals sum of color populations', async () => {
            const result = await extractColorsFromPixels(
                makeBicolorPixels(
                    40,
                    40,
                    { r: 220, g: 30, b: 30 },
                    { r: 30, g: 200, b: 220 },
                ),
            );
            const totalPopulation = result.colors.reduce(
                (sum, c) => sum + c.population,
                0,
            );
            expect(result.metadata.returnedPopulation).toBe(totalPopulation);
        });

        it('proportions sum to approximately 1', async () => {
            const result = await extractColorsFromPixels(
                makeBicolorPixels(
                    40,
                    40,
                    { r: 220, g: 30, b: 30 },
                    { r: 30, g: 200, b: 220 },
                ),
            );
            const totalProportion = result.colors.reduce(
                (sum, c) => sum + c.proportion,
                0,
            );
            expect(totalProportion).toBeCloseTo(1, 1);
        });
    });

    describe('edge cases (ADZ-65)', () => {
        it('throws COLOR_EXTRACTOR_NO_VALID_PIXELS when no pixel passes the filter', async () => {
            const transparent = makePixels(4, 4, {
                r: 128,
                g: 128,
                b: 128,
                a: 0,
            });
            await expect(
                extractColorsFromPixels(transparent),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            });
        });

        it('throws COLOR_EXTRACTOR_NO_VALID_PIXELS when all pixels are below the brightness range', async () => {
            const dark = makePixels(4, 4, { r: 0, g: 0, b: 0, a: 255 });
            await expect(extractColorsFromPixels(dark)).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            });
        });

        it('throws COLOR_EXTRACTOR_NO_VALID_PIXELS when all pixels are above the brightness range', async () => {
            const bright = makePixels(4, 4, {
                r: 255,
                g: 255,
                b: 255,
                a: 255,
            });
            await expect(extractColorsFromPixels(bright)).rejects.toMatchObject(
                {
                    code: 'COLOR_EXTRACTOR_NO_VALID_PIXELS',
                },
            );
        });

        it('throws COLOR_EXTRACTOR_NO_VALID_PIXELS when all pixels are pure gray (below minSaturation)', async () => {
            const gray = makePixels(4, 4, {
                r: 128,
                g: 128,
                b: 128,
                a: 255,
            });
            await expect(extractColorsFromPixels(gray)).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            });
        });

        it('error message hints at filtering options', async () => {
            const transparent = makePixels(4, 4, { r: 0, g: 0, b: 0, a: 0 });
            try {
                await extractColorsFromPixels(transparent);
                expect.fail('should have thrown');
            } catch (e) {
                expect((e as Error).message).toMatch(/filter/i);
            }
        });

        it('throws for invalid input', async () => {
            await expect(
                extractColorsFromPixels({} as unknown as ColorPixelInput),
            ).rejects.toThrow(ColorExtractorError);
        });

        it('throws for null', async () => {
            await expect(
                extractColorsFromPixels(null as unknown as ColorPixelInput),
            ).rejects.toThrow(ColorExtractorError);
        });
    });

    describe('core entrypoint shape (build output)', () => {
        it('dist/core/index.js exports extractColorsFromPixels', async () => {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const rootDir = path.resolve(import.meta.dirname, '../../..');
            const js = await fs.readFile(
                path.resolve(rootDir, 'dist/core/index.js'),
                'utf-8',
            );
            expect(js).toMatch(/extractColorsFromPixels/);
        });

        it('dist/core/index.d.ts does not reference Buffer or File globals', async () => {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const rootDir = path.resolve(import.meta.dirname, '../../..');
            const dts = await fs.readFile(
                path.resolve(rootDir, 'dist/core/index.d.ts'),
                'utf-8',
            );
            expect(dts).not.toMatch(/\bBuffer\b/);
            expect(dts).not.toMatch(/\bFile\b/);
            expect(dts).not.toMatch(/\bBlob\b/);
        });
    });
});
