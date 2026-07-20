import { type FileHandle, open } from 'node:fs/promises';
import { ColorExtractorError } from '../core/errors.js';

function openWithAbort(
    path: string,
    signal?: AbortSignal,
): Promise<FileHandle> {
    if (!signal) return open(path, 'r');
    if (signal.aborted) {
        return Promise.reject(
            new ColorExtractorError(
                'COLOR_EXTRACTOR_ABORTED',
                'Operation was aborted while opening local file.',
                { cause: signal.reason },
            ),
        );
    }
    const opened = open(path, 'r');
    return new Promise<FileHandle>((resolve, reject) => {
        const onAbort = () => {
            reject(
                new ColorExtractorError(
                    'COLOR_EXTRACTOR_ABORTED',
                    'Operation was aborted while opening local file.',
                    { cause: signal.reason },
                ),
            );
        };
        signal.addEventListener('abort', onAbort, { once: true });
        opened.then(
            (handle) => {
                signal.removeEventListener('abort', onAbort);
                if (signal.aborted) {
                    handle.close().catch(() => {});
                    return;
                }
                resolve(handle);
            },
            (error: unknown) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

export async function loadLocalPath(
    path: string,
    maxBytes?: number,
    signal?: AbortSignal,
): Promise<Buffer> {
    let handle: FileHandle | undefined;
    try {
        handle = await openWithAbort(path, signal);
        const info = await handle.stat();
        if (maxBytes !== undefined && info.size > maxBytes) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
                `Local file ${path} is ${info.size} bytes which exceeds the ${maxBytes}-byte limit.`,
                { cause: { path, size: info.size, maxBytes } },
            );
        }

        const data = Buffer.allocUnsafe(info.size);
        let offset = 0;
        while (offset < data.length) {
            if (signal?.aborted) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_ABORTED',
                    'Operation was aborted while reading local file.',
                    { cause: signal.reason },
                );
            }
            const { bytesRead } = await handle.read(
                data,
                offset,
                data.length - offset,
                offset,
            );
            if (bytesRead === 0) break;
            offset += bytesRead;
        }
        return data.subarray(0, offset);
    } catch (err) {
        if (err instanceof ColorExtractorError) throw err;
        if (signal?.aborted) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_ABORTED',
                'Operation was aborted while reading local file.',
                { cause: signal.reason },
            );
        }
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_DECODE_FAILED',
            `Failed to read local file: ${path}`,
            { cause: err },
        );
    } finally {
        await handle?.close().catch(() => {});
    }
}
