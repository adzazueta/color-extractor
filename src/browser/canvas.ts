import { ColorExtractorError } from '../core/errors.js';

type RasterCanvas = OffscreenCanvas | HTMLCanvasElement;
type RasterContext =
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;

export function computeCanvasTargetSize(
    sourceWidth: number,
    sourceHeight: number,
    sampleSize: number,
): { width: number; height: number } {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        return { width: sampleSize, height: sampleSize };
    }
    if (sourceWidth >= sourceHeight) {
        const w = Math.min(sourceWidth, sampleSize);
        const h = Math.max(1, Math.round((sourceHeight * w) / sourceWidth));
        return { width: w, height: h };
    }
    const h = Math.min(sourceHeight, sampleSize);
    const w = Math.max(1, Math.round((sourceWidth * h) / sourceHeight));
    return { width: w, height: h };
}

export function createOffscreenCanvas(
    width: number,
    height: number,
): { canvas: RasterCanvas; ctx: RasterContext } {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_DECODE_FAILED',
                'Failed to get 2D rendering context from OffscreenCanvas.',
            );
        }
        return { canvas, ctx };
    }
    if (typeof document === 'undefined') {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'No canvas implementation is available in this environment.',
        );
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'Failed to get 2D rendering context from canvas.',
        );
    }
    return { canvas, ctx };
}

export function sampleImageToCanvas(
    source: CanvasImageSource | OffscreenCanvas,
    sourceWidth: number,
    sourceHeight: number,
    sampleSize: number,
    smooth?: boolean,
): { pixels: Uint8ClampedArray; width: number; height: number } {
    if (!Number.isInteger(sampleSize) || sampleSize < 1) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'sampleSize must be a positive integer.',
            { cause: sampleSize },
        );
    }

    const target = computeCanvasTargetSize(
        sourceWidth,
        sourceHeight,
        sampleSize,
    );
    const { ctx } = createOffscreenCanvas(target.width, target.height);

    ctx.imageSmoothingEnabled = smooth ?? true;
    ctx.drawImage(source, 0, 0, target.width, target.height);

    const imageData = ctx.getImageData(0, 0, target.width, target.height);

    return {
        pixels: imageData.data,
        width: target.width,
        height: target.height,
    };
}
