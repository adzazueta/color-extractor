import {
    existsSync,
    mkdtempSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NodeExtractColorsInput } from '../../src/node/index.js';
import { extractColors, extractPalette } from '../../src/node/index.js';
import { _setSharpImporterForTests } from '../../src/node/sharp.js';

const rootDir = resolve(import.meta.dirname, '../..');

function readDist(relPath: string): string {
    return readFileSync(resolve(rootDir, 'dist', relPath), 'utf-8');
}

async function makePng(
    width: number,
    height: number,
    color: { r: number; g: number; b: number },
): Promise<Buffer> {
    return sharp({
        create: { width, height, channels: 3, background: color },
    })
        .png()
        .toBuffer();
}

beforeAll(() => {
    _setSharpImporterForTests(() => Promise.resolve(sharp));
});

describe('Node extractColors (Phase 7)', () => {
    describe('AC: nullish and unsupported inputs are rejected', () => {
        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for null', async () => {
            await expect(
                extractColors(null as unknown as NodeExtractColorsInput),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });

        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for undefined', async () => {
            await expect(
                extractColors(undefined as unknown as NodeExtractColorsInput),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });

        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for a number', async () => {
            await expect(
                extractColors(42 as unknown as NodeExtractColorsInput),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });
    });

    describe('AC: Buffer input runs full extraction pipeline', () => {
        it('extracts colors from a 10x10 solid red PNG buffer', async () => {
            const png = await makePng(10, 10, { r: 180, g: 0, b: 0 });
            const result = await extractColors(png);
            expect(result.primary).toBeDefined();
            expect(result.primary.hex).toBe('#b40000');
        });

        it('extracts colors from a 10x10 solid green PNG', async () => {
            const png = await makePng(10, 10, { r: 0, g: 120, b: 0 });
            const result = await extractColors(png);
            expect(result.primary.hex).toBe('#007800');
        });
    });

    describe('AC: Uint8Array input runs full extraction pipeline', () => {
        it('extracts colors from a 10x10 blue PNG as Uint8Array', async () => {
            const png = await makePng(10, 10, { r: 0, g: 0, b: 180 });
            const uint8 = new Uint8Array(
                png.buffer,
                png.byteOffset,
                png.byteLength,
            );
            const result = await extractColors(uint8);
            expect(result.primary.hex).toBe('#0000b4');
        });
    });

    describe('AC: ArrayBuffer input runs full extraction pipeline', () => {
        it('extracts colors from a 10x10 yellow PNG as ArrayBuffer', async () => {
            const png = await makePng(10, 10, { r: 180, g: 180, b: 0 });
            const result = await extractColors(png.buffer as ArrayBuffer);
            expect(result.primary.hex).toBe('#b4b400');
        });
    });

    describe('AC: local path string reads file and extracts colors', () => {
        let tmpDir: string;
        let tmpPath: string;

        beforeAll(() => {
            tmpDir = mkdtempSync(join(tmpdir(), 'color-extractor-test-'));
        });

        afterAll(() => {
            if (tmpPath && existsSync(tmpPath)) unlinkSync(tmpPath);
            try {
                unlinkSync(tmpDir);
            } catch {
                /* ignore */
            }
        });

        it('extracts colors from a local PNG file by path', async () => {
            const png = await makePng(10, 10, { r: 0, g: 180, b: 0 });
            tmpPath = join(tmpDir, 'test-green.png');
            writeFileSync(tmpPath, png);

            const result = await extractColors(tmpPath);
            expect(result.primary.hex).toBe('#00b400');
        });
    });

    describe('AC: invalid image bytes produce COLOR_EXTRACTOR_DECODE_FAILED', () => {
        it('throws DECODE_FAILED for an empty Buffer', async () => {
            await expect(extractColors(Buffer.alloc(0))).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_DECODE_FAILED',
            });
        });

        it('throws DECODE_FAILED for random bytes', async () => {
            const random = Buffer.alloc(64);
            for (let i = 0; i < random.length; i++) {
                random[i] = (i * 17 + 31) & 0xff;
            }
            await expect(extractColors(random)).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_DECODE_FAILED',
            });
        });
    });

    describe('AC: options are passed through correctly', () => {
        it('accepts custom options alongside Buffer input', async () => {
            const png = await makePng(10, 10, { r: 100, g: 150, b: 200 });
            const result = await extractColors(png, {
                sampleSize: 50,
                paletteSize: 3,
            });
            expect(result.primary).toBeDefined();
            expect(result.primary.hex).toBeTruthy();
        });
    });
});

describe('Node extractPalette', () => {
    it('runs the neutral pipeline for a Buffer input', async () => {
        const png = await makePng(300, 150, { r: 180, g: 0, b: 0 });
        const result = await extractPalette(png, {
            sampling: { maxDimension: 150 },
            result: { maxColors: 1 },
        });

        expect(result.swatches).toHaveLength(1);
        expect(result.metadata).toMatchObject({
            runtime: 'node',
            decoder: 'sharp',
            sampledWidth: 150,
            sampledHeight: 75,
        });
    });
});

describe('dist entrypoint shape', () => {
    it('dist/node/index.js exports extractColors', () => {
        const js = readDist('node/index.js');
        expect(js).toMatch(/extractColors/);
    });

    it('dist/browser/index.js exports extractColors', () => {
        const js = readDist('browser/index.js');
        expect(js).toMatch(/extractColors/);
    });

    it('dist/index.d.ts declares extractColors at the root', () => {
        const dts = readDist('index.d.ts');
        expect(dts).toMatch(/extractColors/);
    });

    it('dist/browser/index.d.ts declares BrowserExtractColorsInput', () => {
        const dts = readDist('browser/index.d.ts');
        expect(dts).toMatch(/BrowserExtractColorsInput/);
    });

    it('dist/node/index.d.ts declares NodeExtractColorsInput', () => {
        const dts = readDist('node/index.d.ts');
        expect(dts).toMatch(/NodeExtractColorsInput/);
    });
});
