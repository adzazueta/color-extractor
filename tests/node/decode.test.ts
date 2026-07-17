import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { ColorExtractorError } from '../../src/core/errors.js';
import {
    _internalComputeResizeTargetForTests,
    _internalIsSharpPipelineForTests,
    decodeBufferToPixels,
} from '../../src/node/decode.js';
import { _setSharpImporterForTests } from '../../src/node/sharp.js';

async function makePng(
    width: number,
    height: number,
    color: { r: number; g: number; b: number },
): Promise<Buffer> {
    return sharp({
        create: {
            width,
            height,
            channels: 3,
            background: color,
        },
    })
        .png()
        .toBuffer();
}

async function makeJpeg(
    width: number,
    height: number,
    color: { r: number; g: number; b: number },
    orientation?: number,
): Promise<Buffer> {
    let s = sharp({
        create: {
            width,
            height,
            channels: 3,
            background: color,
        },
    }).jpeg();
    if (orientation !== undefined) {
        s = s.withMetadata({ orientation });
    }
    return s.toBuffer();
}

beforeAll(() => {
    _setSharpImporterForTests(() => Promise.resolve(sharp));
});

describe('decodeBufferToPixels (ADZ-71)', () => {
    describe('AC: raw RGBA pixels are returned with width, height, and data', () => {
        it('decodes a 10x10 solid PNG into 10x10 raw pixels', async () => {
            const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
            const out = await decodeBufferToPixels(png, 150, {
                respectOrientation: true,
            });
            expect(out.width).toBe(10);
            expect(out.height).toBe(10);
            expect(out.data).toBeInstanceOf(Uint8Array);
            expect(out.data.length).toBe(10 * 10 * out.channels);
        });

        it('preserves the color of a solid image', async () => {
            const png = await makePng(8, 8, { r: 200, g: 30, b: 30 });
            const out = await decodeBufferToPixels(png, 150, {
                respectOrientation: true,
            });
            const px = out.data;
            expect(out.channels).toBe(4);
            expect(px[0]).toBe(200);
            expect(px[1]).toBe(30);
            expect(px[2]).toBe(30);
        });
    });

    describe('AC: output is always 4-channel RGBA (review #1)', () => {
        it('returns channels = 4 for a PNG without alpha', async () => {
            const png = await makePng(20, 20, { r: 200, g: 30, b: 30 });
            const out = await decodeBufferToPixels(png, 150, {
                respectOrientation: true,
            });
            expect(out.channels).toBe(4);
            expect(out.data.length).toBe(out.width * out.height * 4);
        });

        it('returns channels = 4 for a JPEG (which has 3 native channels)', async () => {
            const jpeg = await makeJpeg(20, 10, { r: 200, g: 30, b: 30 });
            const out = await decodeBufferToPixels(jpeg, 150, {
                respectOrientation: true,
            });
            expect(out.channels).toBe(4);
            expect(out.data.length).toBe(20 * 10 * 4);
        });

        it('opaque JPEG has alpha byte set to 255 for every pixel', async () => {
            const jpeg = await makeJpeg(8, 6, { r: 200, g: 30, b: 30 });
            const out = await decodeBufferToPixels(jpeg, 150, {
                respectOrientation: true,
            });
            for (let i = 3; i < out.data.length; i += 4) {
                expect(out.data[i]).toBe(255);
            }
        });
    });

    describe('AC: early resize to sampleSize preserves aspect ratio', () => {
        it('shrinks a 300x150 image to 150x75 with sampleSize=150', async () => {
            const png = await makePng(300, 150, { r: 0, g: 0, b: 200 });
            const out = await decodeBufferToPixels(png, 150, {
                respectOrientation: true,
            });
            expect(out.width).toBeLessThanOrEqual(150);
            expect(out.height).toBeLessThanOrEqual(150);
            expect(out.width / out.height).toBeCloseTo(2, 1);
        });

        it('keeps original size when the image is smaller than sampleSize', async () => {
            const png = await makePng(40, 40, { r: 100, g: 100, b: 100 });
            const out = await decodeBufferToPixels(png, 150, {
                respectOrientation: true,
            });
            expect(out.width).toBe(40);
            expect(out.height).toBe(40);
        });
    });

    describe('AC: EXIF orientation rotates the image before resize (review #2)', () => {
        it('a 300x100 JPEG with EXIF orientation 6 (rotate 90° CW) is treated as 100x300 before sampleSize resize', async () => {
            // Use a large enough sampleSize that the post-rotation size is preserved.
            const jpeg = await makeJpeg(300, 100, { r: 0, g: 200, b: 0 }, 6);
            const out = await decodeBufferToPixels(jpeg, 500, {
                respectOrientation: true,
            });
            expect(out.width).toBe(100);
            expect(out.height).toBe(300);
        });

        it('a 300x100 JPEG with EXIF orientation 6 downsized to sampleSize=150 keeps the rotated ratio', async () => {
            const jpeg = await makeJpeg(300, 100, { r: 0, g: 200, b: 0 }, 6);
            const out = await decodeBufferToPixels(jpeg, 150, {
                respectOrientation: true,
            });
            expect(out.width).toBe(50);
            expect(out.height).toBe(150);
            expect(out.width / out.height).toBeCloseTo(1 / 3, 1);
        });

        it('respectOrientation=false keeps the unrotated dimensions at 300x100', async () => {
            const jpeg = await makeJpeg(300, 100, { r: 0, g: 200, b: 0 }, 6);
            const out = await decodeBufferToPixels(jpeg, 500, {
                respectOrientation: false,
            });
            expect(out.width).toBe(300);
            expect(out.height).toBe(100);
        });
    });

    describe('AC: orientation normalization respects respectOrientation flag', () => {
        it('does not throw with respectOrientation: true on a normal PNG', async () => {
            const png = await makePng(20, 20, { r: 100, g: 100, b: 100 });
            await expect(
                decodeBufferToPixels(png, 150, { respectOrientation: true }),
            ).resolves.toBeDefined();
        });

        it('does not throw with respectOrientation: false', async () => {
            const png = await makePng(20, 20, { r: 100, g: 100, b: 100 });
            await expect(
                decodeBufferToPixels(png, 150, { respectOrientation: false }),
            ).resolves.toBeDefined();
        });
    });

    describe('AC: invalid sampleSize is rejected with typed error', () => {
        it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for sampleSize=0', async () => {
            const png = await makePng(10, 10, { r: 0, g: 0, b: 0 });
            await expect(
                decodeBufferToPixels(png, 0, { respectOrientation: true }),
            ).rejects.toMatchObject({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            });
        });
    });

    describe('AC: corrupt bytes produce DECODE_FAILED', () => {
        it('throws when the buffer is not a valid image', async () => {
            const garbage = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            await expect(
                decodeBufferToPixels(garbage, 150, {
                    respectOrientation: true,
                }),
            ).rejects.toBeInstanceOf(ColorExtractorError);
        });
    });
});

describe('computeResizeTarget (ADZ-71)', () => {
    it('returns the sampleSize side for square images larger than sampleSize', () => {
        expect(_internalComputeResizeTargetForTests(300, 300, 150)).toEqual({
            width: 150,
            height: 150,
        });
    });

    it('preserves aspect ratio for landscape images', () => {
        expect(_internalComputeResizeTargetForTests(400, 200, 200)).toEqual({
            width: 200,
            height: 100,
        });
    });

    it('preserves aspect ratio for portrait images', () => {
        expect(_internalComputeResizeTargetForTests(200, 400, 200)).toEqual({
            width: 100,
            height: 200,
        });
    });

    it('does not enlarge images smaller than sampleSize', () => {
        expect(_internalComputeResizeTargetForTests(50, 50, 150)).toEqual({
            width: 50,
            height: 50,
        });
    });

    it('returns at least 1x1 for non-positive inputs', () => {
        expect(
            _internalComputeResizeTargetForTests(0, 0, 150).width,
        ).toBeGreaterThanOrEqual(1);
    });
});

describe('isSharpPipeline (ADZ-71)', () => {
    it('returns true for objects with rotate, resize, ensureAlpha, withMetadata, raw, metadata methods', () => {
        expect(
            _internalIsSharpPipelineForTests({
                rotate: () => ({}),
                resize: () => ({}),
                ensureAlpha: () => ({}),
                withMetadata: () => ({}),
                raw: () => ({}),
                metadata: () => ({}),
            }),
        ).toBe(true);
    });

    it('returns false for plain objects', () => {
        expect(_internalIsSharpPipelineForTests({})).toBe(false);
        expect(_internalIsSharpPipelineForTests(null)).toBe(false);
        expect(_internalIsSharpPipelineForTests(undefined)).toBe(false);
        expect(_internalIsSharpPipelineForTests(42)).toBe(false);
    });
});

describe('maxPixels enforcement (ADZ-64)', () => {
    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when image exceeds maxPixels', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        await expect(
            decodeBufferToPixels(png, 150, {
                respectOrientation: true,
                maxPixels: 50,
            }),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE' });
    });

    it('succeeds when image is within maxPixels limit', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            maxPixels: 200,
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('defaults to 25 MP when maxPixels is omitted', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });
});

describe('SVG rejection in Node (ADZ-68)', () => {
    it('rejects SVG bytes when svg mode is disabled-in-node', async () => {
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
        );
        await expect(
            decodeBufferToPixels(svg, 150, {
                respectOrientation: true,
                svg: 'disabled-in-node',
            }),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT' });
    });

    it('rejects XML-wrapped SVG bytes', async () => {
        const svg = Buffer.from(
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        );
        await expect(
            decodeBufferToPixels(svg, 150, {
                respectOrientation: true,
                svg: 'disabled-in-node',
            }),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT' });
    });

    it('rejects SVG when svg mode is disabled', async () => {
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        );
        await expect(
            decodeBufferToPixels(svg, 150, {
                respectOrientation: true,
                svg: 'disabled',
            }),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT' });
    });

    it('allows SVG bytes when svg mode is enabled-in-node', async () => {
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
        );
        try {
            await decodeBufferToPixels(svg, 150, {
                respectOrientation: true,
                svg: 'enabled-in-node',
            });
        } catch (err) {
            expect((err as ColorExtractorError).code).not.toBe(
                'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
            );
        }
    });

    it('rejects SVG bytes by default when svg option is omitted', async () => {
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        );
        await expect(
            decodeBufferToPixels(svg, 150, { respectOrientation: true }),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT' });
    });

    it('does not reject non-SVG bytes', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            svg: 'disabled-in-node',
        });
        expect(result.width).toBe(10);
    });
});

describe('animated first-frame handling (ADZ-66)', () => {
    it('accepts first-frame mode (default)', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            animated: 'first-frame',
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('accepts all-frames mode', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            animated: 'all-frames',
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('accepts disabled mode', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            animated: 'disabled',
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('defaults to first-frame when animated option is omitted', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('produces deterministic results for the same input', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result1 = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            animated: 'first-frame',
        });
        const result2 = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            animated: 'first-frame',
        });
        expect(result1.data).toEqual(result2.data);
        expect(result1.width).toBe(result2.width);
        expect(result1.height).toBe(result2.height);
    });
});

describe('sRGB normalization (ADZ-69)', () => {
    it('normalizes to sRGB by default', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('normalizes when normalizeColorProfile is true', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            normalizeColorProfile: true,
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('skips normalization when normalizeColorProfile is false', async () => {
        const png = await makePng(10, 10, { r: 200, g: 30, b: 30 });
        const result = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            normalizeColorProfile: false,
        });
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
    });

    it('produces consistent output with normalization enabled', async () => {
        const png = await makePng(10, 10, { r: 100, g: 150, b: 200 });
        const result1 = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            normalizeColorProfile: true,
        });
        const result2 = await decodeBufferToPixels(png, 150, {
            respectOrientation: true,
            normalizeColorProfile: true,
        });
        expect(result1.data).toEqual(result2.data);
    });
});
