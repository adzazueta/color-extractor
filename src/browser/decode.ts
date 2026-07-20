import { ColorExtractorError, checkAborted } from '../core/errors.js';
import {
    computeCanvasTargetSize,
    createOffscreenCanvas,
    sampleImageToCanvas,
} from './canvas.js';

export interface DecodedPixels {
    readonly width: number;
    readonly height: number;
    readonly channels: 4;
    readonly data: Uint8Array;
}

function isCreateImageBitmapAvailable(): boolean {
    return typeof createImageBitmap === 'function';
}

function isImageConstructorAvailable(): boolean {
    return typeof Image === 'function';
}

function validateMaxPixels(
    width: number,
    height: number,
    maxPixels: number,
): void {
    if (!Number.isFinite(maxPixels) || maxPixels <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `decode.maxPixels must be a positive finite number, got ${maxPixels}`,
            { cause: maxPixels },
        );
    }
    const total = width * height;
    if (total > maxPixels) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
            `Image is too large (${total} pixels, max ${maxPixels}).`,
            { cause: { width, height, maxPixels } },
        );
    }
}

async function decodeViaImageElement(
    url: string,
    sampleSize: number,
    maxPixels: number,
    signal?: AbortSignal,
    smooth?: boolean,
): Promise<DecodedPixels> {
    checkAborted(signal);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();

        const onAbort = () => {
            image.onload = null;
            image.onerror = null;
            image.src = '';
            reject(
                new ColorExtractorError(
                    'COLOR_EXTRACTOR_ABORTED',
                    'Operation was aborted while decoding image.',
                ),
            );
        };

        const onSettle = () => {
            signal?.removeEventListener('abort', onAbort);
        };

        image.onload = () => {
            onSettle();
            resolve(image);
        };
        image.onerror = () => {
            onSettle();
            reject(
                new ColorExtractorError(
                    'COLOR_EXTRACTOR_DECODE_FAILED',
                    'Failed to decode image from blob.',
                ),
            );
        };

        if (signal?.aborted) {
            reject(
                new ColorExtractorError(
                    'COLOR_EXTRACTOR_ABORTED',
                    'Operation was aborted before decoding image.',
                ),
            );
            return;
        }

        signal?.addEventListener('abort', onAbort, { once: true });
        image.src = url;
    });
    checkAborted(signal);

    validateMaxPixels(img.naturalWidth, img.naturalHeight, maxPixels);
    const result = sampleImageToCanvas(
        img,
        img.naturalWidth,
        img.naturalHeight,
        sampleSize,
        smooth,
    );
    return decodeCanvasResult(result);
}

async function decodeViaCreateImageBitmap(
    input: File | Blob,
    sampleSize: number,
    maxPixels: number,
    signal?: AbortSignal,
    smooth?: boolean,
): Promise<DecodedPixels> {
    checkAborted(signal);
    let bitmap: ImageBitmap | null = null;
    let onAbort: (() => void) | null = null;

    try {
        if (signal) {
            const deferred = createImageBitmap(input);
            const aborted = new Promise<never>((_, reject) => {
                onAbort = () => {
                    reject(
                        new ColorExtractorError(
                            'COLOR_EXTRACTOR_ABORTED',
                            'Operation was aborted during bitmap decode.',
                        ),
                    );
                };
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener('abort', onAbort, { once: true });
            });
            try {
                bitmap = await Promise.race([deferred, aborted]);
            } catch (err) {
                if (signal.aborted) {
                    deferred.then((b) => b.close()).catch(() => {});
                }
                throw err;
            }
        } else {
            bitmap = await createImageBitmap(input);
        }
        checkAborted(signal);
        validateMaxPixels(bitmap.width, bitmap.height, maxPixels);
        const result = sampleImageToCanvas(
            bitmap,
            bitmap.width,
            bitmap.height,
            sampleSize,
            smooth,
        );
        return decodeCanvasResult(result);
    } finally {
        if (onAbort) {
            signal?.removeEventListener('abort', onAbort);
        }
        if (bitmap !== null) {
            bitmap.close();
        }
    }
}

async function decodeViaObjectUrl(
    input: File | Blob,
    sampleSize: number,
    maxPixels: number,
    signal?: AbortSignal,
    smooth?: boolean,
): Promise<DecodedPixels> {
    const url = URL.createObjectURL(input);
    try {
        return await decodeViaImageElement(
            url,
            sampleSize,
            maxPixels,
            signal,
            smooth,
        );
    } finally {
        URL.revokeObjectURL(url);
    }
}

function decodeCanvasResult(result: {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
}): DecodedPixels {
    return {
        width: result.width,
        height: result.height,
        channels: 4 as const,
        data: new Uint8Array(
            result.pixels.buffer,
            result.pixels.byteOffset,
            result.pixels.byteLength,
        ),
    };
}

export function sampleImageElement(
    img: HTMLImageElement,
    sampleSize: number,
    maxPixels: number,
    smooth?: boolean,
): DecodedPixels {
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'HTMLImageElement is not fully loaded or has zero dimensions.',
        );
    }
    validateMaxPixels(img.naturalWidth, img.naturalHeight, maxPixels);
    try {
        const result = sampleImageToCanvas(
            img,
            img.naturalWidth,
            img.naturalHeight,
            sampleSize,
            smooth,
        );
        return decodeCanvasResult(result);
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'SecurityError') {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_CORS_ERROR',
                'HTMLImageElement is tainted by cross-origin content and cannot be read.',
                { cause },
            );
        }
        throw cause;
    }
}

export function sampleImageBitmap(
    bitmap: ImageBitmap,
    sampleSize: number,
    maxPixels: number,
    smooth?: boolean,
): DecodedPixels {
    if (bitmap.width === 0 || bitmap.height === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'ImageBitmap has zero dimensions and cannot be decoded.',
        );
    }
    validateMaxPixels(bitmap.width, bitmap.height, maxPixels);
    try {
        const result = sampleImageToCanvas(
            bitmap,
            bitmap.width,
            bitmap.height,
            sampleSize,
            smooth,
        );
        return decodeCanvasResult(result);
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'SecurityError') {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_CORS_ERROR',
                'ImageBitmap originates from cross-origin content and cannot be read.',
                { cause },
            );
        }
        throw cause;
    }
}

export function sampleCanvasElement(
    canvas: HTMLCanvasElement,
    sampleSize: number,
    maxPixels: number,
    smooth?: boolean,
): DecodedPixels {
    if (canvas.width === 0 || canvas.height === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'Canvas has zero dimensions and cannot be decoded.',
        );
    }
    validateMaxPixels(canvas.width, canvas.height, maxPixels);
    try {
        const result = sampleImageToCanvas(
            canvas,
            canvas.width,
            canvas.height,
            sampleSize,
            smooth,
        );
        return decodeCanvasResult(result);
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'SecurityError') {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_CORS_ERROR',
                'Canvas is tainted by cross-origin content and cannot be read.',
                { cause },
            );
        }
        throw cause;
    }
}

export function sampleImageDataInput(
    imageData: ImageData,
    sampleSize: number,
    maxPixels: number,
    smooth?: boolean,
): DecodedPixels {
    if (!Number.isInteger(sampleSize) || sampleSize < 1) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'sampleSize must be a positive integer.',
            { cause: sampleSize },
        );
    }
    if (imageData.width === 0 || imageData.height === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            'ImageData has zero dimensions and cannot be decoded.',
        );
    }
    validateMaxPixels(imageData.width, imageData.height, maxPixels);

    const maxDim = Math.max(imageData.width, imageData.height);
    if (maxDim <= sampleSize) {
        return rawImageData(imageData);
    }

    if (
        typeof OffscreenCanvas !== 'undefined' ||
        typeof document !== 'undefined'
    ) {
        const { canvas: srcCanvas, ctx: srcCtx } = createOffscreenCanvas(
            imageData.width,
            imageData.height,
        );
        srcCtx.putImageData(imageData, 0, 0);

        const result = sampleImageToCanvas(
            srcCanvas,
            imageData.width,
            imageData.height,
            sampleSize,
            smooth,
        );
        return decodeCanvasResult(result);
    }

    const target = computeCanvasTargetSize(
        imageData.width,
        imageData.height,
        sampleSize,
    );
    return {
        width: target.width,
        height: target.height,
        channels: 4 as const,
        data: nearestNeighborRGBA(
            imageData.data,
            imageData.width,
            imageData.height,
            target.width,
            target.height,
        ),
    };
}

function rawImageData(imageData: ImageData): DecodedPixels {
    return {
        width: imageData.width,
        height: imageData.height,
        channels: 4 as const,
        data: new Uint8Array(
            imageData.data.buffer,
            imageData.data.byteOffset,
            imageData.data.byteLength,
        ),
    };
}

function nearestNeighborRGBA(
    src: Uint8ClampedArray,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
): Uint8Array {
    const out = new Uint8Array(dstW * dstH * 4);
    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let y = 0; y < dstH; y++) {
        const srcY = (y * yRatio) | 0;
        const srcRow = srcY * srcW * 4;
        const dstRow = y * dstW * 4;
        for (let x = 0; x < dstW; x++) {
            const srcX = ((x * xRatio) | 0) * 4;
            const si = srcRow + srcX;
            const di = dstRow + x * 4;
            out[di] = src[si]!;
            out[di + 1] = src[si + 1]!;
            out[di + 2] = src[si + 2]!;
            out[di + 3] = src[si + 3]!;
        }
    }
    return out;
}

function wireSignal(
    controller: AbortController,
    externalSignal: AbortSignal,
): { signal: AbortSignal; remove: () => void } {
    const onAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
        return { signal: controller.signal, remove: () => {} };
    }
    externalSignal.addEventListener('abort', onAbort, { once: true });
    return {
        signal: controller.signal,
        remove: () => externalSignal.removeEventListener('abort', onAbort),
    };
}

function isAbortError(cause: unknown): boolean {
    if (
        cause instanceof ColorExtractorError &&
        cause.code === 'COLOR_EXTRACTOR_TIMEOUT'
    ) {
        return true;
    }
    return (
        cause instanceof DOMException &&
        (cause.name === 'AbortError' || cause.name === 'TimeoutError')
    );
}

export async function decodeRemoteUrl(
    url: string,
    sampleSize: number,
    maxPixels: number,
    timeoutMs: number,
    maxBytes: number,
    signal?: AbortSignal,
    smooth?: boolean,
): Promise<DecodedPixels> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.timeoutMs must be a positive number, got ${timeoutMs}`,
            { cause: timeoutMs },
        );
    }
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `remote.maxBytes must be a positive number, got ${maxBytes}`,
            { cause: maxBytes },
        );
    }

    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => {
        timeoutController.abort(
            new ColorExtractorError(
                'COLOR_EXTRACTOR_TIMEOUT',
                `Remote fetch to ${url} exceeded ${timeoutMs}ms timeout.`,
            ),
        );
    }, timeoutMs);

    let removeSignalListener: (() => void) | undefined;
    let fetchSignal: AbortSignal;

    if (signal) {
        if (typeof AbortSignal.any === 'function') {
            fetchSignal = AbortSignal.any([timeoutController.signal, signal]);
        } else {
            const wired = wireSignal(timeoutController, signal);
            fetchSignal = wired.signal;
            removeSignalListener = wired.remove;
        }
    } else {
        fetchSignal = timeoutController.signal;
    }

    try {
        let response: Response;
        try {
            response = await fetch(url, { signal: fetchSignal });
        } catch (cause) {
            if (signal?.aborted) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_ABORTED',
                    'Operation was aborted during remote fetch.',
                    { cause: signal.reason },
                );
            }
            if (cause instanceof ColorExtractorError) {
                throw cause;
            }
            if (isAbortError(cause)) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_TIMEOUT',
                    `Remote fetch to ${url} aborted after ${timeoutMs}ms.`,
                    { cause },
                );
            }
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_FETCH_FAILED',
                `Failed to fetch remote URL: ${url}.`,
                { cause },
            );
        }

        if (!response.ok) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_FETCH_FAILED',
                `Remote fetch to ${url} failed with status ${response.status}.`,
            );
        }

        const contentLength = Number.parseInt(
            response.headers.get('content-length') ?? '',
            10,
        );
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            await response.body?.cancel();
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                `Remote response from ${url} advertises ${contentLength} bytes which exceeds the ${maxBytes}-byte limit.`,
                { cause: { url, contentLength, maxBytes } },
            );
        }

        let blob: Blob;
        if (response.body) {
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;
            try {
                while (true) {
                    checkAborted(signal);

                    let result: ReadableStreamReadResult<Uint8Array>;
                    try {
                        result = await reader.read();
                    } catch (cause) {
                        if (signal?.aborted) {
                            throw new ColorExtractorError(
                                'COLOR_EXTRACTOR_ABORTED',
                                'Operation was aborted while reading response body.',
                                { cause: signal.reason },
                            );
                        }
                        if (cause instanceof ColorExtractorError) {
                            throw cause;
                        }
                        if (isAbortError(cause)) {
                            throw new ColorExtractorError(
                                'COLOR_EXTRACTOR_TIMEOUT',
                                `Remote fetch to ${url} timed out while reading body after ${timeoutMs}ms.`,
                                { cause },
                            );
                        }
                        throw new ColorExtractorError(
                            'COLOR_EXTRACTOR_FETCH_FAILED',
                            `Failed to read response body from ${url}.`,
                            { cause },
                        );
                    }
                    if (result.done) break;
                    if (result.value) {
                        received += result.value.byteLength;
                        if (received > maxBytes) {
                            await reader.cancel();
                            throw new ColorExtractorError(
                                'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                                `Remote response from ${url} exceeded the ${maxBytes}-byte limit while streaming.`,
                                { cause: { url, maxBytes, received } },
                            );
                        }
                        chunks.push(result.value);
                    }
                }
            } finally {
                try {
                    reader.releaseLock();
                } catch {
                    /* already released */
                }
            }
            blob = new Blob(chunks as BlobPart[]);
        } else {
            blob = await response.blob();
            if (blob.size > maxBytes) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                    `Remote response from ${url} is ${blob.size} bytes which exceeds the ${maxBytes}-byte limit.`,
                    { cause: { url, size: blob.size, maxBytes } },
                );
            }
        }

        if (blob.size === 0) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_FETCH_FAILED',
                `Remote fetch to ${url} returned an empty body.`,
            );
        }

        return decodeFileOrBlob(blob, sampleSize, maxPixels, signal, smooth);
    } finally {
        clearTimeout(timeoutHandle);
        removeSignalListener?.();
    }
}

/**
 * Decodes a File or Blob into raw pixel data.
 *
 * **Platform limitation — `maxPixels` cannot be enforced before decode:**
 * No browser API provides image dimensions without first decoding (or at least
 * partially decoding) the image. `createImageBitmap` only surfaces `width` and
 * `height` after the full bitmap has been allocated, and there is no portable
 * way to parse format headers (PNG, JPEG, WebP, etc.) for pre-decode validation.
 * As a result, `maxPixels` is checked *after* `createImageBitmap` completes;
 * a highly-compressible image (e.g. uniform 10 000×10 000 PNG) will still be
 * fully decoded into memory before the check rejects it. This is an accepted
 * trade-off of the browser decode pipeline.
 */
export async function decodeFileOrBlob(
    input: File | Blob,
    sampleSize: number,
    maxPixels: number,
    signal?: AbortSignal,
    smooth?: boolean,
): Promise<DecodedPixels> {
    if (isCreateImageBitmapAvailable()) {
        try {
            return await decodeViaCreateImageBitmap(
                input,
                sampleSize,
                maxPixels,
                signal,
                smooth,
            );
        } catch (cause) {
            if (cause instanceof ColorExtractorError) {
                throw cause;
            }
            if (isImageConstructorAvailable()) {
                return await decodeViaObjectUrl(
                    input,
                    sampleSize,
                    maxPixels,
                    signal,
                    smooth,
                );
            }
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_DECODE_FAILED',
                'Failed to decode File or Blob input.',
                { cause },
            );
        }
    }

    if (isImageConstructorAvailable()) {
        return await decodeViaObjectUrl(
            input,
            sampleSize,
            maxPixels,
            signal,
            smooth,
        );
    }

    throw new ColorExtractorError(
        'COLOR_EXTRACTOR_DECODE_FAILED',
        'No decoding method available for File or Blob input in this environment.',
    );
}
