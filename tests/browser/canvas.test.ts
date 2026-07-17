import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    computeCanvasTargetSize,
    createOffscreenCanvas,
    sampleImageToCanvas,
} from '../../src/browser/canvas.js';
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

function createMockOffscreenCanvas(): typeof OffscreenCanvas {
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
        get height() {
            return this._height;
        }

        getContext(type: string) {
            if (type !== '2d') return null;
            return {
                drawImage: vi.fn(),
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

describe('computeCanvasTargetSize (ADZ-60)', () => {
    it('returns original dimensions when already within sample size', () => {
        const result = computeCanvasTargetSize(100, 80, 150);
        expect(result).toEqual({ width: 100, height: 80 });
    });

    it('clamps width to sampleSize for landscape images', () => {
        const result = computeCanvasTargetSize(3000, 2000, 150);
        expect(result.width).toBe(150);
        expect(result.height).toBe(100);
    });

    it('clamps height to sampleSize for portrait images', () => {
        const result = computeCanvasTargetSize(2000, 3000, 150);
        expect(result.width).toBe(100);
        expect(result.height).toBe(150);
    });

    it('handles square images', () => {
        const result = computeCanvasTargetSize(2000, 2000, 100);
        expect(result).toEqual({ width: 100, height: 100 });
    });

    it('preserves aspect ratio for landscape', () => {
        const result = computeCanvasTargetSize(4000, 1000, 200);
        expect(result.width).toBe(200);
        expect(result.height).toBe(50);
    });

    it('preserves aspect ratio for portrait', () => {
        const result = computeCanvasTargetSize(1000, 4000, 200);
        expect(result.width).toBe(50);
        expect(result.height).toBe(200);
    });

    it('never returns zero dimension', () => {
        const result = computeCanvasTargetSize(4000, 1, 200);
        expect(result.width).toBe(200);
        expect(result.height).toBe(1);
    });

    it('returns sampleSize dimensions for zero source dimensions', () => {
        const result = computeCanvasTargetSize(0, 0, 150);
        expect(result).toEqual({ width: 150, height: 150 });
    });

    it('returns sampleSize dimensions for negative source dimensions', () => {
        const result = computeCanvasTargetSize(-100, 200, 150);
        expect(result).toEqual({ width: 150, height: 150 });
    });

    it('handles very small images', () => {
        const result = computeCanvasTargetSize(1, 1, 150);
        expect(result).toEqual({ width: 1, height: 1 });
    });

    it('handles sampleSize of 1', () => {
        const result = computeCanvasTargetSize(1920, 1080, 1);
        expect(result.width).toBe(1);
        expect(result.height).toBe(1);
    });
});

describe('sampleImageToCanvas (ADZ-60)', () => {
    beforeAll(() => {
        vi.stubGlobal('OffscreenCanvas', createMockOffscreenCanvas());
        vi.stubGlobal('ImageData', MockImageData);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('returns pixel data at target size', () => {
        const source = { width: 3000, height: 2000 } as CanvasImageSource;
        const result = sampleImageToCanvas(source, 3000, 2000, 150);

        expect(result.width).toBe(150);
        expect(result.height).toBe(100);
        expect(result.pixels).toBeInstanceOf(Uint8ClampedArray);
        expect(result.pixels.length).toBe(150 * 100 * 4);
    });

    it('returns pixel data at original size when already small', () => {
        const source = { width: 100, height: 80 } as CanvasImageSource;
        const result = sampleImageToCanvas(source, 100, 80, 150);

        expect(result.width).toBe(100);
        expect(result.height).toBe(80);
    });

    it('throws for invalid sampleSize (zero)', () => {
        expect(() =>
            sampleImageToCanvas({} as CanvasImageSource, 100, 100, 0),
        ).toThrow(ColorExtractorError);
    });

    it('throws for invalid sampleSize (negative)', () => {
        expect(() =>
            sampleImageToCanvas({} as CanvasImageSource, 100, 100, -1),
        ).toThrow(ColorExtractorError);
    });

    it('throws for invalid sampleSize (float)', () => {
        expect(() =>
            sampleImageToCanvas({} as CanvasImageSource, 100, 100, 1.5),
        ).toThrow(ColorExtractorError);
    });
});

describe('createOffscreenCanvas (ADZ-60)', () => {
    it('throws when OffscreenCanvas is unavailable', () => {
        vi.stubGlobal('OffscreenCanvas', undefined);
        expect(() => createOffscreenCanvas(100, 100)).toThrow(
            ColorExtractorError,
        );
        vi.unstubAllGlobals();
    });
});
