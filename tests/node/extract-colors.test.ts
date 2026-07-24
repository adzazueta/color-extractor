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
import type { NodeExtractColorInput } from '../../src/node/index.js';
import { extractColor } from '../../src/node/index.js';
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

describe('Node extractColor (Phase 7)', () => {
    describe('AC: nullish and unsupported inputs are rejected', () => {
        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for null', async () => {
            await expect(
                extractColor(null as unknown as NodeExtractColorInput),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });

        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for undefined', async () => {
            await expect(
                extractColor(undefined as unknown as NodeExtractColorInput),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });

        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for a number', async () => {
            await expect(
                extractColor(42 as unknown as NodeExtractColorInput),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });
    });

    describe('AC: Buffer input runs full extraction pipeline', () => {
        it('extracts colors from a 10x10 solid red PNG buffer', async () => {
            const png = await makePng(10, 10, { r: 180, g: 0, b: 0 });
            const result = await extractColor(png);
            expect(result.colors[0]).toBeDefined();
            expect(result.colors[0]!.hex).toBe('#b40000');
        });

        it('extracts colors from a 10x10 solid green PNG', async () => {
            const png = await makePng(10, 10, { r: 0, g: 120, b: 0 });
            const result = await extractColor(png);
            expect(result.colors[0]!.hex).toBe('#007800');
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
            const result = await extractColor(uint8);
            expect(result.colors[0]!.hex).toBe('#0000b4');
        });
    });

    describe('AC: ArrayBuffer input runs full extraction pipeline', () => {
        it('extracts colors from a 10x10 yellow PNG as ArrayBuffer', async () => {
            const png = await makePng(10, 10, { r: 180, g: 180, b: 0 });
            const result = await extractColor(png.buffer as ArrayBuffer);
            expect(result.colors[0]!.hex).toBe('#b4b400');
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

            const result = await extractColor(tmpPath);
            expect(result.colors[0]!.hex).toBe('#00b400');
        });
    });

    describe('AC: invalid image bytes produce COLOR_EXTRACTOR_DECODE_FAILED', () => {
        it('throws DECODE_FAILED for an empty Buffer', async () => {
            await expect(extractColor(Buffer.alloc(0))).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_DECODE_FAILED',
            });
        });

        it('throws DECODE_FAILED for random bytes', async () => {
            const random = Buffer.alloc(64);
            for (let i = 0; i < random.length; i++) {
                random[i] = (i * 17 + 31) & 0xff;
            }
            await expect(extractColor(random)).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_DECODE_FAILED',
            });
        });
    });

    describe('AC: options are passed through correctly', () => {
        it('accepts custom options alongside Buffer input', async () => {
            const png = await makePng(10, 10, { r: 100, g: 150, b: 200 });
            const result = await extractColor(png, {
                sampling: { maxDimension: 50 },
                result: { maxColors: 3 },
            });
            expect(result.colors[0]).toBeDefined();
            expect(result.colors[0]!.hex).toBeTruthy();
        });
    });
});

describe('Node extractColor', () => {
    it('runs the neutral pipeline for a Buffer input', async () => {
        const png = await makePng(300, 150, { r: 180, g: 0, b: 0 });
        const result = await extractColor(png, {
            sampling: { maxDimension: 150 },
            result: { maxColors: 1 },
        });

        expect(result.colors).toHaveLength(1);
        expect(result.metadata).toMatchObject({
            runtime: 'node',
            decoder: 'sharp',
            sampledWidth: 150,
            sampledHeight: 75,
        });
    });
});

describe('dist entrypoint shape', () => {
    it('dist/node/index.js exports extractColor', () => {
        const js = readDist('node/index.js');
        expect(js).toMatch(/extractColor/);
    });

    it('dist/browser/index.js exports extractColor', () => {
        const js = readDist('browser/index.js');
        expect(js).toMatch(/extractColor/);
    });

    it('dist/index.d.ts declares extractColor at the root', () => {
        const dts = readDist('index.d.ts');
        expect(dts).toMatch(/extractColor/);
    });

    it('dist/browser/index.d.ts declares BrowserExtractColorInput', () => {
        const dts = readDist('browser/index.d.ts');
        expect(dts).toMatch(/BrowserExtractColorInput/);
    });

    it('dist/node/index.d.ts declares NodeExtractColorInput', () => {
        const dts = readDist('node/index.d.ts');
        expect(dts).toMatch(/NodeExtractColorInput/);
    });
});
