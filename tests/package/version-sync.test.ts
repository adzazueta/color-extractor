import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { extractColorFromPixels } from '../../src/core/extract.js';
import { extractColor as nodeExtractColor } from '../../src/node/index.js';
import { _setSharpImporterForTests } from '../../src/node/sharp.js';
import { ENTRYPOINT_DISTS, loadPackageJson } from './version-sync.shared.js';

const ROOT = resolve(import.meta.dirname, '../..');
const { version: PKG_VERSION } = loadPackageJson(ROOT);

function makePixels(
    width: number,
    height: number,
    fill: { r?: number; g?: number; b?: number; a?: number } = {},
) {
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
    return { data, width, height, channels: 4 as const };
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

describe('version synchronization — all entrypoints', () => {
    it.each(ENTRYPOINT_DISTS)(
        '%s exports VERSION matching package.json',
        async (relPath) => {
            const mod = (await import(resolve(ROOT, relPath))) as {
                VERSION: string;
            };
            expect(mod.VERSION).toBe(PKG_VERSION);
        },
    );
});

describe('version synchronization — extraction metadata', () => {
    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('core extraction metadata includes correct packageVersion', async () => {
        const result = await extractColorFromPixels(
            makePixels(20, 20, { r: 200, g: 20, b: 20 }),
        );
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.packageVersion).toBe(PKG_VERSION);
        expect(result.metadata!.runtime).toBe('core');
    });

    it('node extraction metadata includes correct packageVersion', async () => {
        const png = await makePng(10, 10, { r: 180, g: 0, b: 0 });
        const result = await nodeExtractColor(png);
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.packageVersion).toBe(PKG_VERSION);
        expect(result.metadata!.runtime).toBe('node');
    });

    it('browser extraction metadata includes correct packageVersion', async () => {
        class MockImageData {
            data: Uint8ClampedArray;
            width: number;
            height: number;
            constructor(d: Uint8ClampedArray, w: number, h: number) {
                this.data = d;
                this.width = w;
                this.height = h;
            }
        }
        vi.stubGlobal('ImageData', MockImageData);

        const data = new Uint8ClampedArray(20 * 20 * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 200;
            data[i + 1] = 20;
            data[i + 2] = 20;
            data[i + 3] = 255;
        }

        const { extractColor } = await import('../../src/browser/index.js');
        const input = new MockImageData(data, 20, 20);
        const result = await extractColor(input as unknown as ImageData);
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.packageVersion).toBe(PKG_VERSION);
        expect(result.metadata!.runtime).toBe('browser');
    });
});

describe('version synchronization — drift detection', () => {
    const COMMITTED = resolve(ROOT, 'src/generated/version.ts');
    let originalContent: string;

    beforeAll(() => {
        originalContent = readFileSync(COMMITTED, 'utf-8');
    });

    afterAll(() => {
        writeFileSync(COMMITTED, originalContent);
        execFileSync('pnpm', ['sync-version'], {
            cwd: ROOT,
            stdio: 'pipe',
        });
    });

    it('check-version succeeds when version.ts matches package.json', () => {
        execFileSync('pnpm', ['check-version'], {
            cwd: ROOT,
            stdio: 'pipe',
        });
    });

    it('check-version fails when version.ts drifts from package.json', () => {
        const corrupted = originalContent.replace(/'[^']+'/, "'99.99.99-test'");
        writeFileSync(COMMITTED, corrupted);

        try {
            execFileSync('pnpm', ['check-version'], {
                cwd: ROOT,
                stdio: 'pipe',
            });
            expect.fail('expected check-version to exit non-zero');
        } catch (e) {
            const err = e as { status?: number | null };
            expect(err.status).not.toBe(0);
        }
    });
});
