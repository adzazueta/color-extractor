import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    decodeFileOrBlob,
    decodeRemoteUrl,
    sampleCanvasElement,
    sampleImageBitmap,
    sampleImageDataInput,
    sampleImageElement,
} from '../../src/browser/decode.js';
import { ColorExtractorError } from '../../src/core/errors.js';

class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
}

type MockDrawCall = {
    image: unknown;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
};

let drawCalls: MockDrawCall[] = [];
let smoothingValues: boolean[] = [];

function createMockOffscreenCanvas() {
    return class {
        _width: number;
        _height: number;

        constructor(width: number, height: number) {
            this._width = width;
            this._height = height;
        }

        get width() {
            return this._width;
        }
        set width(value: number) {
            this._width = value;
        }
        get height() {
            return this._height;
        }
        set height(value: number) {
            this._height = value;
        }

        getContext(type: string) {
            if (type !== '2d') return null;
            let imageSmoothingEnabled = true;
            return {
                get imageSmoothingEnabled() {
                    return imageSmoothingEnabled;
                },
                set imageSmoothingEnabled(value: boolean) {
                    imageSmoothingEnabled = value;
                    smoothingValues.push(value);
                },
                drawImage: vi.fn(
                    (
                        image: unknown,
                        dx: number,
                        dy: number,
                        dw: number,
                        dh: number,
                    ) => {
                        drawCalls.push({ image, dx, dy, dw, dh });
                    },
                ),
                putImageData: vi.fn(),
                getImageData: vi.fn(
                    (_x: number, _y: number, w: number, h: number) => {
                        return new MockImageData(
                            new Uint8ClampedArray(w * h * 4),
                            w,
                            h,
                        );
                    },
                ),
            };
        }
    } as unknown as typeof OffscreenCanvas;
}

const MAX_PIXELS = 25_000_000;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 10_000_000;

describe('sampleImageBitmap (ADZ-59)', () => {
    beforeAll(() => {
        drawCalls = [];
        smoothingValues = [];
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('decodes a valid ImageBitmap', () => {
        const bitmap = {
            width: 2000,
            height: 1000,
            close: vi.fn(),
        } as unknown as ImageBitmap;
        const result = sampleImageBitmap(bitmap, 100, MAX_PIXELS);

        expect(result.width).toBe(100);
        expect(result.height).toBe(50);
        expect(result.channels).toBe(4);
        expect(result.data).toBeInstanceOf(Uint8Array);
    });

    it('does not close the caller-owned bitmap after sampling', () => {
        const close = vi.fn();
        const bitmap = {
            width: 100,
            height: 100,
            close,
        } as unknown as ImageBitmap;
        sampleImageBitmap(bitmap, 150, MAX_PIXELS);
        expect(close).not.toHaveBeenCalled();
    });

    it('disables smoothing when requested by the neutral path', () => {
        smoothingValues = [];
        const bitmap = {
            width: 200,
            height: 100,
            close: vi.fn(),
        } as unknown as ImageBitmap;

        sampleImageBitmap(bitmap, 100, MAX_PIXELS, false);

        expect(smoothingValues).toContain(false);
    });

    it('throws for zero-width bitmap', () => {
        const bitmap = {
            width: 0,
            height: 100,
            close: vi.fn(),
        } as unknown as ImageBitmap;
        expect(() => sampleImageBitmap(bitmap, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws for zero-height bitmap', () => {
        const bitmap = {
            width: 100,
            height: 0,
            close: vi.fn(),
        } as unknown as ImageBitmap;
        expect(() => sampleImageBitmap(bitmap, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when bitmap exceeds maxPixels', () => {
        const bitmap = {
            width: 10000,
            height: 10000,
            close: vi.fn(),
        } as unknown as ImageBitmap;
        expect(() => sampleImageBitmap(bitmap, 150, 1_000_000)).toThrow(
            ColorExtractorError,
        );
    });
});

describe('sampleImageElement (ADZ-59)', () => {
    beforeAll(() => {
        drawCalls = [];
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('decodes a loaded image element', () => {
        const img = {
            complete: true,
            naturalWidth: 3000,
            naturalHeight: 2000,
        } as unknown as HTMLImageElement;

        const result = sampleImageElement(img, 150, MAX_PIXELS);

        expect(result.width).toBe(150);
        expect(result.height).toBe(100);
        expect(result.channels).toBe(4);
        expect(result.data).toBeInstanceOf(Uint8Array);
    });

    it('throws for incomplete image element', () => {
        const img = {
            complete: false,
            naturalWidth: 100,
            naturalHeight: 100,
        } as unknown as HTMLImageElement;

        expect(() => sampleImageElement(img, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws for image with zero naturalWidth', () => {
        const img = {
            complete: true,
            naturalWidth: 0,
            naturalHeight: 100,
        } as unknown as HTMLImageElement;

        expect(() => sampleImageElement(img, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws for image with zero naturalHeight', () => {
        const img = {
            complete: true,
            naturalWidth: 100,
            naturalHeight: 0,
        } as unknown as HTMLImageElement;

        expect(() => sampleImageElement(img, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when image exceeds maxPixels', () => {
        const small = {
            complete: true,
            naturalWidth: 1000,
            naturalHeight: 1000,
        } as unknown as HTMLImageElement;

        const large = {
            complete: true,
            naturalWidth: 10000,
            naturalHeight: 10000,
        } as unknown as HTMLImageElement;

        expect(() => sampleImageElement(small, 150, 50_000_000)).not.toThrow();
        expect(() => sampleImageElement(large, 150, 1_000_000)).toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
            }),
        );
    });
});

describe('sampleCanvasElement (ADZ-61)', () => {
    beforeAll(() => {
        drawCalls = [];
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('decodes a canvas element with downsampling', () => {
        const canvas = { width: 2000, height: 1000 } as HTMLCanvasElement;
        const result = sampleCanvasElement(canvas, 100, MAX_PIXELS);

        expect(result.width).toBe(100);
        expect(result.height).toBe(50);
        expect(result.channels).toBe(4);
        expect(result.data).toBeInstanceOf(Uint8Array);
    });

    it('throws for zero-width canvas', () => {
        const canvas = { width: 0, height: 100 } as HTMLCanvasElement;
        expect(() => sampleCanvasElement(canvas, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws for zero-height canvas', () => {
        const canvas = { width: 100, height: 0 } as HTMLCanvasElement;
        expect(() => sampleCanvasElement(canvas, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when canvas exceeds maxPixels', () => {
        const canvas = { width: 10000, height: 10000 } as HTMLCanvasElement;
        expect(() => sampleCanvasElement(canvas, 150, 1_000_000)).toThrow(
            ColorExtractorError,
        );
    });
});

describe('sampleImageDataInput (ADZ-61)', () => {
    it('returns pixels from ImageData directly', () => {
        const data = new Uint8ClampedArray(100 * 80 * 4);
        const imageData = { data, width: 100, height: 80 } as ImageData;
        const result = sampleImageDataInput(imageData, 150, MAX_PIXELS);

        expect(result.width).toBe(100);
        expect(result.height).toBe(80);
        expect(result.channels).toBe(4);
        expect(result.data).toBeInstanceOf(Uint8Array);
        expect(result.data.length).toBe(100 * 80 * 4);
    });

    it('returns pixel data with same buffer content', () => {
        const buffer = new Uint8ClampedArray(16);
        buffer[0] = 255;
        buffer[1] = 128;
        buffer[2] = 64;
        buffer[3] = 32;
        const imageData = { data: buffer, width: 2, height: 2 } as ImageData;
        const result = sampleImageDataInput(imageData, 150, MAX_PIXELS);

        expect(result.data[0]).toBe(255);
        expect(result.data[1]).toBe(128);
        expect(result.data[2]).toBe(64);
        expect(result.data[3]).toBe(32);
    });

    it('throws for zero-width ImageData', () => {
        const imageData = {
            data: new Uint8ClampedArray(0),
            width: 0,
            height: 100,
        } as ImageData;
        expect(() => sampleImageDataInput(imageData, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws for zero-height ImageData', () => {
        const imageData = {
            data: new Uint8ClampedArray(0),
            width: 100,
            height: 0,
        } as ImageData;
        expect(() => sampleImageDataInput(imageData, 150, MAX_PIXELS)).toThrow(
            ColorExtractorError,
        );
    });

    it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when ImageData exceeds maxPixels', () => {
        const imageData = {
            data: new Uint8ClampedArray(1200 * 1200 * 4),
            width: 1200,
            height: 1200,
        } as ImageData;
        expect(() => sampleImageDataInput(imageData, 150, 1_000_000)).toThrow(
            ColorExtractorError,
        );
    });

    describe('without OffscreenCanvas — software nearest-neighbor fallback', () => {
        beforeAll(() => {
            vi.stubGlobal('OffscreenCanvas', undefined);
        });

        afterAll(() => {
            vi.unstubAllGlobals();
        });

        it('downsamples to maxDimension with correct nearest-neighbor pixels', () => {
            // Create a 300×100 ImageData: first half red, second half blue
            const w = 300;
            const h = 100;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    if (x < w / 2) {
                        data[i] = 255;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                    } else {
                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 255;
                    }
                    data[i + 3] = 255;
                }
            }
            const imageData = { data, width: w, height: h } as ImageData;
            const result = sampleImageDataInput(imageData, 150, MAX_PIXELS);

            // Result should fit within 150×150
            expect(result.width).toBeLessThanOrEqual(150);
            expect(result.height).toBeLessThanOrEqual(150);
            expect(result.width).toBeGreaterThan(0);
            expect(result.height).toBeGreaterThan(0);

            // First pixel should be red (nearest neighbor from left half)
            expect(result.data[0]).toBe(255);
            expect(result.data[1]).toBe(0);
            expect(result.data[2]).toBe(0);

            // Last pixel should be blue (nearest neighbor from right half)
            const last = (result.width * result.height - 1) * 4;
            expect(result.data[last]).toBe(0);
            expect(result.data[last + 1]).toBe(0);
            expect(result.data[last + 2]).toBe(255);
        });

        it('rejects with decode.maxPixels when source exceeds limit', () => {
            const imageData = {
                data: new Uint8ClampedArray(1200 * 1200 * 4),
                width: 1200,
                height: 1200,
            } as ImageData;
            expect(() =>
                sampleImageDataInput(imageData, 150, 1_000_000),
            ).toThrow(ColorExtractorError);
        });

        it('uses the DOM canvas fallback and preserves requested smoothing', () => {
            smoothingValues = [];
            const Canvas = createMockOffscreenCanvas();
            vi.stubGlobal('document', {
                createElement: vi.fn(() => new Canvas(1, 1)),
            });
            const imageData = {
                data: new Uint8ClampedArray(300 * 100 * 4),
                width: 300,
                height: 100,
            } as ImageData;

            sampleImageDataInput(imageData, 150, MAX_PIXELS, true);

            expect(smoothingValues).toContain(true);
            vi.unstubAllGlobals();
        });

        it.each([0, -1, 1.5, Number.NaN])(
            'rejects invalid sampleSize %p consistently without OffscreenCanvas',
            (sampleSize) => {
                const imageData = {
                    data: new Uint8ClampedArray(300 * 100 * 4),
                    width: 300,
                    height: 100,
                } as ImageData;

                expect(() =>
                    sampleImageDataInput(imageData, sampleSize, MAX_PIXELS),
                ).toThrow(
                    expect.objectContaining({
                        code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                    }),
                );
            },
        );

        it('pins nearest-neighbor convention on non-integral resize ratio', () => {
            // 300 → 130: x-ratio = 300/130 ≈ 2.3077
            // dst_x=0  → floor(0  × 300/130) = floor(0.00)  = 0
            // dst_x=1  → floor(1  × 300/130) = floor(2.31)  = 2
            // dst_x=50 → floor(50 × 300/130) = floor(115.38) = 115
            const w = 300;
            const h = 1;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let x = 0; x < w; x++) {
                const i = x * 4;
                data[i] = x; // R = source x
                data[i + 1] = 0;
                data[i + 2] = 0;
                data[i + 3] = 255;
            }
            const imageData = { data, width: w, height: h } as ImageData;
            const result = sampleImageDataInput(imageData, 130, MAX_PIXELS);

            expect(result.width).toBe(130);
            expect(result.height).toBe(1);

            // dst_x=0  should sample src_x=0  → R=0
            expect(result.data[0]).toBe(0);

            // dst_x=1  should sample src_x=2  → R=2
            expect(result.data[4]).toBe(2);

            // dst_x=50 should sample src_x=115 → R=115
            expect(result.data[200]).toBe(115);
        });

        it('preserves alpha and does not mutate input buffer', () => {
            const w = 300;
            const h = 100;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 100;
                data[i + 1] = 150;
                data[i + 2] = 200;
                data[i + 3] = 64; // semi-transparent
            }
            const original = new Uint8ClampedArray(data);
            const imageData = { data, width: w, height: h } as ImageData;
            const result = sampleImageDataInput(imageData, 80, MAX_PIXELS);

            // Every output pixel preserves alpha=64
            for (let i = 3; i < result.data.length; i += 4) {
                expect(result.data[i]).toBe(64);
            }

            // Source buffer untouched
            expect(data).toStrictEqual(original);
        });
    });

    describe('extractPaletteFromImageData — without OffscreenCanvas', () => {
        beforeAll(() => {
            vi.stubGlobal('OffscreenCanvas', undefined);
        });

        afterAll(() => {
            vi.unstubAllGlobals();
        });

        it('reports reduced dimensions in metadata after software downsampling', async () => {
            const w = 600;
            const h = 400;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 200;
                data[i + 1] = 100;
                data[i + 2] = 50;
                data[i + 3] = 255;
            }
            const imageData = { data, width: w, height: h } as ImageData;

            const { extractPaletteFromImageData: ep } = await import(
                '../../src/browser/index.js'
            );

            const result = await ep(imageData, {
                sampling: { maxDimension: 200 },
                filtering: {
                    minBrightness: 0,
                    maxBrightness: 255,
                    minSaturation: 0,
                },
                result: { maxColors: 1 },
                advanced: { labKmeans: { clusters: 1 } },
            });

            expect(result.metadata.sampledWidth).toBe(200);
            expect(result.metadata.sampledHeight).toBeLessThanOrEqual(200);
            expect(result.metadata.sampledWidth).toBeGreaterThan(0);
            expect(result.metadata.sampledHeight).toBeGreaterThan(0);
            expect(result.metadata.runtime).toBe('browser');
            expect(result.metadata.decoder).toBe('image-data');
        });
    });
});

describe('decodeFileOrBlob (ADZ-54)', () => {
    let bitmapClose: ReturnType<typeof vi.fn>;
    let mockCreateImageBitmap: ReturnType<typeof vi.fn>;
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

    beforeAll(() => {
        drawCalls = [];
        bitmapClose = vi.fn();

        mockCreateImageBitmap = vi.fn();

        mockCreateObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
        mockRevokeObjectURL = vi.fn();

        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    describe('primary path: createImageBitmap succeeds', () => {
        beforeAll(() => {
            drawCalls = [];
            mockCreateImageBitmap = vi.fn();
            vi.stubGlobal('createImageBitmap', mockCreateImageBitmap);
        });

        afterAll(() => {
            vi.stubGlobal('createImageBitmap', undefined);
        });

        it('decodes a blob via createImageBitmap and canvas downsample', async () => {
            const bitmap = {
                width: 3000,
                height: 2000,
                close: bitmapClose,
            } as unknown as ImageBitmap;
            mockCreateImageBitmap.mockResolvedValue(bitmap);

            const blob = new Blob(['fake-image-data'], { type: 'image/png' });
            const result = await decodeFileOrBlob(blob, 150, MAX_PIXELS);

            expect(mockCreateImageBitmap).toHaveBeenCalledWith(blob);
            expect(result.width).toBe(150);
            expect(result.height).toBe(100);
            expect(result.channels).toBe(4);
            expect(result.data).toBeInstanceOf(Uint8Array);
            expect(result.data.length).toBe(150 * 100 * 4);
        });

        it('closes the bitmap after use', async () => {
            bitmapClose.mockClear();
            const bitmap = {
                width: 100,
                height: 100,
                close: bitmapClose,
            } as unknown as ImageBitmap;
            mockCreateImageBitmap.mockResolvedValue(bitmap);

            const blob = new Blob(['x'], { type: 'image/png' });
            await decodeFileOrBlob(blob, 150, MAX_PIXELS);

            expect(bitmapClose).toHaveBeenCalledOnce();
        });

        it('draws the bitmap to canvas at target size', async () => {
            drawCalls = [];
            const bitmap = {
                width: 2000,
                height: 1000,
                close: vi.fn(),
            } as unknown as ImageBitmap;
            mockCreateImageBitmap.mockResolvedValue(bitmap);

            const blob = new Blob(['y'], { type: 'image/png' });
            await decodeFileOrBlob(blob, 100, MAX_PIXELS);

            expect(drawCalls).toHaveLength(1);
            expect(drawCalls[0]!.image).toBe(bitmap);
            expect(drawCalls[0]!.dw).toBe(100);
            expect(drawCalls[0]!.dh).toBe(50);
        });

        it('throws COLOR_EXTRACTOR_IMAGE_TOO_LARGE when bitmap exceeds maxPixels', async () => {
            const bitmap = {
                width: 10000,
                height: 10000,
                close: vi.fn(),
            } as unknown as ImageBitmap;
            mockCreateImageBitmap.mockResolvedValue(bitmap);

            const blob = new Blob(['x'], { type: 'image/png' });
            const err = await decodeFileOrBlob(blob, 150, 1_000_000).catch(
                (e) => e,
            );
            expect(err).toBeInstanceOf(ColorExtractorError);
            expect((err as ColorExtractorError).code).toBe(
                'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
            );
        });
    });

    describe('primary path: createImageBitmap unavailable', () => {
        beforeAll(() => {
            vi.stubGlobal('createImageBitmap', undefined);
        });

        afterAll(() => {
            vi.stubGlobal('createImageBitmap', undefined);
        });

        it('falls back to Image element when createImageBitmap is not available', async () => {
            const mockImage = vi.fn();
            let onloadCallback: (() => void) | null = null;
            let currentSrc = '';

            function MockImageConstructor() {
                const img = {
                    get src() {
                        return currentSrc;
                    },
                    set src(val: string) {
                        currentSrc = val;
                        setTimeout(() => {
                            if (onloadCallback) onloadCallback();
                        }, 0);
                    },
                    onload: null as (() => void) | null,
                    onerror: null as (() => void) | null,
                    naturalWidth: 100,
                    naturalHeight: 80,
                };
                Object.defineProperty(img, 'onload', {
                    get() {
                        return onloadCallback;
                    },
                    set(fn: (() => void) | null) {
                        onloadCallback = fn;
                    },
                });
                mockImage();
                return img;
            }

            vi.stubGlobal(
                'Image',
                MockImageConstructor as unknown as typeof Image,
            );
            vi.stubGlobal('URL', {
                createObjectURL: mockCreateObjectURL,
                revokeObjectURL: mockRevokeObjectURL,
            });

            const blob = new Blob(['fake'], { type: 'image/png' });
            const result = await decodeFileOrBlob(blob, 150, MAX_PIXELS);

            expect(result.width).toBe(100);
            expect(result.height).toBe(80);
            expect(result.channels).toBe(4);
            expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
            expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        });
    });

    describe('error handling', () => {
        beforeAll(() => {
            vi.stubGlobal('createImageBitmap', undefined);
            vi.stubGlobal('Image', undefined);
            vi.stubGlobal('URL', {
                createObjectURL: mockCreateObjectURL,
                revokeObjectURL: mockRevokeObjectURL,
            });
        });

        afterAll(() => {
            vi.stubGlobal('createImageBitmap', undefined);
        });

        it('throws ColorExtractorError when no decoding method is available', async () => {
            const blob = new Blob(['fake'], { type: 'image/png' });

            await expect(
                decodeFileOrBlob(blob, 150, MAX_PIXELS),
            ).rejects.toThrow(ColorExtractorError);
        });
    });
});

describe('decodeRemoteUrl (ADZ-50)', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let mockCreateImageBitmap: ReturnType<typeof vi.fn>;

    beforeAll(() => {
        drawCalls = [];
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    function stubAbortableFetch(resolvedValue: unknown) {
        mockFetch = vi
            .fn()
            .mockImplementation(
                (_url: string, init?: { signal?: AbortSignal }) => {
                    if (init?.signal) {
                        init.signal.addEventListener('abort', () => {});
                    }
                    return Promise.resolve(resolvedValue);
                },
            );
        vi.stubGlobal('fetch', mockFetch);
    }

    it('fetches a URL with timeout and decodes the blob', async () => {
        const mockBlob = new Blob(['fake-image'], { type: 'image/png' });
        const mockResponse = {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue(null) },
            body: null,
            blob: vi.fn().mockResolvedValue(mockBlob),
        };
        mockCreateImageBitmap = vi.fn().mockResolvedValue({
            width: 100,
            height: 100,
            close: vi.fn(),
        } as unknown as ImageBitmap);
        vi.stubGlobal('createImageBitmap', mockCreateImageBitmap);
        stubAbortableFetch(mockResponse);

        const result = await decodeRemoteUrl(
            'https://example.com/image.png',
            150,
            MAX_PIXELS,
            TIMEOUT_MS,
            MAX_BYTES,
        );

        expect(mockFetch).toHaveBeenCalledWith(
            'https://example.com/image.png',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(result.width).toBe(100);
        expect(result.height).toBe(100);
        expect(result.channels).toBe(4);
    });

    it('throws on fetch failure', async () => {
        mockFetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
        vi.stubGlobal('fetch', mockFetch);

        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                TIMEOUT_MS,
                MAX_BYTES,
            ),
        ).rejects.toThrow(ColorExtractorError);
    });

    it('throws on non-2xx status', async () => {
        const mockResponse = {
            ok: false,
            status: 404,
            headers: { get: vi.fn().mockReturnValue(null) },
            body: null,
            blob: vi.fn(),
        };
        stubAbortableFetch(mockResponse);

        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                TIMEOUT_MS,
                MAX_BYTES,
            ),
        ).rejects.toThrow(ColorExtractorError);
    });

    it('throws on Content-Length exceeding maxBytes', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue('99999999999') },
            body: { cancel: vi.fn() },
            blob: vi.fn(),
        };
        stubAbortableFetch(mockResponse);

        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                TIMEOUT_MS,
                100,
            ),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
            }),
        );
    });

    it('throws on empty body', async () => {
        const mockBlob = new Blob([], { type: '' });
        const mockResponse = {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue(null) },
            body: null,
            blob: vi.fn().mockResolvedValue(mockBlob),
        };
        stubAbortableFetch(mockResponse);

        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                TIMEOUT_MS,
                MAX_BYTES,
            ),
        ).rejects.toThrow(ColorExtractorError);
    });

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid timeoutMs (0)', async () => {
        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                0,
                MAX_BYTES,
            ),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            }),
        );
    });

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid timeoutMs (negative)', async () => {
        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                -1,
                MAX_BYTES,
            ),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            }),
        );
    });

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid timeoutMs (NaN)', async () => {
        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                Number.NaN,
                MAX_BYTES,
            ),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            }),
        );
    });

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid maxBytes (0)', async () => {
        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                TIMEOUT_MS,
                0,
            ),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            }),
        );
    });

    it('throws COLOR_EXTRACTOR_UNSUPPORTED_INPUT for invalid maxBytes (negative)', async () => {
        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                TIMEOUT_MS,
                -1,
            ),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            }),
        );
    });
});

describe('decode.maxPixels enforced post-decode (platform limitation)', () => {
    beforeAll(() => {
        drawCalls = [];
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
        vi.stubGlobal('createImageBitmap', vi.fn());
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('validates maxPixels after createImageBitmap decodes the image', async () => {
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn().mockResolvedValue({
                width: 100,
                height: 100,
                close: vi.fn(),
            } as unknown as ImageBitmap),
        );

        await expect(
            decodeFileOrBlob(new Blob(['x'.repeat(100)]), 150, 10),
        ).rejects.toThrowError(
            expect.objectContaining({
                code: 'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
            }),
        );
    });
});

describe('decodeFileOrBlob — abort with arbitrary reason', () => {
    beforeAll(() => {
        vi.stubGlobal('createImageBitmap', undefined);
        vi.stubGlobal('Image', vi.fn().mockReturnValue({}));
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal is already aborted with string reason', async () => {
        const ac = new AbortController();
        ac.abort('user cancelled');

        await expect(
            decodeFileOrBlob(
                new Blob(['fake'], { type: 'image/png' }),
                150,
                MAX_PIXELS,
                ac.signal,
            ),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_ABORTED' });
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal is already aborted with non-ABORTED ColorExtractorError', async () => {
        const ac = new AbortController();
        ac.abort(
            new ColorExtractorError('COLOR_EXTRACTOR_TIMEOUT', 'from caller'),
        );

        await expect(
            decodeFileOrBlob(
                new Blob(['fake'], { type: 'image/png' }),
                150,
                MAX_PIXELS,
                ac.signal,
            ),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_ABORTED' });
    });
});

describe('decodeFileOrBlob — abort during pending Image load', () => {
    beforeAll(() => {
        vi.stubGlobal('createImageBitmap', undefined);
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue('blob:mock'),
            revokeObjectURL: vi.fn(),
        });
        vi.stubGlobal('Image', function (this: { [k: string]: unknown }) {
            this.onload = null;
            this.onerror = null;
            const self = this;
            Object.defineProperty(this, 'src', {
                get() {
                    return self._src as string;
                },
                set(v: string) {
                    self._src = v;
                },
            });
            this._src = '';
            this.naturalWidth = 100;
            this.naturalHeight = 100;
        } as unknown as typeof Image);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal fires during pending Image load', async () => {
        const ac = new AbortController();

        const promise = decodeFileOrBlob(
            new Blob(['fake'], { type: 'image/png' }),
            150,
            MAX_PIXELS,
            ac.signal,
        );

        await new Promise((r) => setTimeout(r, 10));
        ac.abort('user cancelled');

        await expect(promise).rejects.toMatchObject({
            code: 'COLOR_EXTRACTOR_ABORTED',
        });
    });
});

describe('decodeFileOrBlob — abort during pending createImageBitmap', () => {
    beforeAll(() => {
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn().mockImplementation(
                () =>
                    new Promise<ImageBitmap>(() => {
                        /* never settles */
                    }),
            ),
        );
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal fires during createImageBitmap', async () => {
        const ac = new AbortController();

        const promise = decodeFileOrBlob(
            new Blob(['fake'], { type: 'image/png' }),
            150,
            MAX_PIXELS,
            ac.signal,
        );

        await new Promise((r) => setTimeout(r, 10));
        ac.abort('user cancelled');

        await expect(promise).rejects.toMatchObject({
            code: 'COLOR_EXTRACTOR_ABORTED',
        });
    });
});

describe('decodeRemoteUrl — abort with arbitrary reason', () => {
    beforeAll(() => {
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
        vi.stubGlobal('createImageBitmap', vi.fn());
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal is pre-aborted with string reason', async () => {
        const ac = new AbortController();
        ac.abort('user cancelled');

        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                5000,
                MAX_BYTES,
                ac.signal,
            ),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_ABORTED' });
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal is pre-aborted with non-ABORTED ColorExtractorError', async () => {
        const ac = new AbortController();
        ac.abort(
            new ColorExtractorError('COLOR_EXTRACTOR_TIMEOUT', 'from caller'),
        );

        await expect(
            decodeRemoteUrl(
                'https://example.com/image.png',
                150,
                MAX_PIXELS,
                5000,
                MAX_BYTES,
                ac.signal,
            ),
        ).rejects.toMatchObject({ code: 'COLOR_EXTRACTOR_ABORTED' });
    });

    it('rejects with COLOR_EXTRACTOR_ABORTED when signal fires during in-flight fetch', async () => {
        const ac = new AbortController();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(
                (_url: string, init?: { signal?: AbortSignal }) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(new DOMException('Aborted', 'AbortError'));
                        });
                    }),
            ),
        );

        const promise = decodeRemoteUrl(
            'https://example.com/image.png',
            150,
            MAX_PIXELS,
            5000,
            MAX_BYTES,
            ac.signal,
        );

        await new Promise((r) => setTimeout(r, 10));
        ac.abort('user cancelled');

        await expect(promise).rejects.toMatchObject({
            code: 'COLOR_EXTRACTOR_ABORTED',
        });
    }, 10_000);
});
