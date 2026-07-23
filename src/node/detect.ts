import { ColorExtractorError } from '../core/errors.js';

export type NodeInputKind =
    | 'buffer'
    | 'bytes'
    | 'arrayBuffer'
    | 'remoteUrl'
    | 'localPath'
    | 'unsupported';

function isBuffer(value: unknown): value is Buffer {
    return typeof Buffer !== 'undefined' && value instanceof Buffer;
}

function isUint8Array(value: unknown): value is Uint8Array {
    if (typeof Uint8Array === 'undefined') return false;
    if (value instanceof Uint8Array) return true;
    if (
        typeof Uint8ClampedArray !== 'undefined' &&
        value instanceof Uint8ClampedArray
    ) {
        return true;
    }
    return false;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
    if (typeof ArrayBuffer === 'undefined') return false;
    if (value instanceof ArrayBuffer) return true;
    if (
        typeof SharedArrayBuffer !== 'undefined' &&
        value instanceof SharedArrayBuffer
    ) {
        return true;
    }
    return false;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

export function detectNodeInputKind(input: unknown): NodeInputKind {
    if (input === null || input === undefined) {
        return 'unsupported';
    }
    if (isBuffer(input)) {
        return 'buffer';
    }
    if (isUint8Array(input)) {
        if (isBuffer(input)) {
            return 'buffer';
        }
        return 'bytes';
    }
    if (isArrayBuffer(input)) {
        return 'arrayBuffer';
    }
    if (typeof input === 'string') {
        if (isHttpUrl(input)) {
            return 'remoteUrl';
        }
        if (input.length > 0) {
            return 'localPath';
        }
        return 'unsupported';
    }
    return 'unsupported';
}

export function assertSupportedNodeInput(
    input: unknown,
): asserts input is NonNullable<unknown> {
    const kind = detectNodeInputKind(input);
    if (kind === 'unsupported') {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            'Node input must be a Buffer, Uint8Array, ArrayBuffer, http(s) URL string, or local path string.',
            { cause: input },
        );
    }
}
