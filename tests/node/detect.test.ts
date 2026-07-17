import { describe, expect, it } from 'vitest';
import { ColorExtractorError } from '../../src/core/errors.js';
import {
    assertSupportedNodeInput,
    detectNodeInputKind,
} from '../../src/node/detect.js';

describe('detectNodeInputKind (ADZ-56)', () => {
    describe('AC: Buffer input is detected as buffer', () => {
        it('returns "buffer" for a Node Buffer', () => {
            const buf = Buffer.from([1, 2, 3]);
            expect(detectNodeInputKind(buf)).toBe('buffer');
        });

        it('returns "buffer" for an empty Buffer', () => {
            expect(detectNodeInputKind(Buffer.alloc(0))).toBe('buffer');
        });
    });

    describe('AC: Uint8Array input is detected as bytes', () => {
        it('returns "bytes" for a plain Uint8Array', () => {
            const arr = new Uint8Array([1, 2, 3]);
            expect(detectNodeInputKind(arr)).toBe('bytes');
        });

        it('returns "bytes" for a Uint8ClampedArray', () => {
            const arr = new Uint8ClampedArray([1, 2, 3]);
            expect(detectNodeInputKind(arr)).toBe('bytes');
        });
    });

    describe('AC: ArrayBuffer input is detected as arrayBuffer', () => {
        it('returns "arrayBuffer" for an ArrayBuffer', () => {
            const ab = new ArrayBuffer(8);
            expect(detectNodeInputKind(ab)).toBe('arrayBuffer');
        });

        it('returns "arrayBuffer" for a SharedArrayBuffer', () => {
            const sab = new SharedArrayBuffer(8);
            expect(detectNodeInputKind(sab)).toBe('arrayBuffer');
        });
    });

    describe('AC: http(s) string is treated as a remote URL', () => {
        it('returns "remoteUrl" for https://', () => {
            expect(detectNodeInputKind('https://example.com/image.png')).toBe(
                'remoteUrl',
            );
        });

        it('returns "remoteUrl" for http://', () => {
            expect(detectNodeInputKind('http://example.com/image.png')).toBe(
                'remoteUrl',
            );
        });
    });

    describe('AC: non-http strings are treated as local paths', () => {
        it('returns "localPath" for an absolute path', () => {
            expect(detectNodeInputKind('/tmp/image.png')).toBe('localPath');
        });

        it('returns "localPath" for a relative path', () => {
            expect(detectNodeInputKind('./image.png')).toBe('localPath');
        });

        it('returns "localPath" for a Windows-style path', () => {
            expect(detectNodeInputKind('C:\\images\\photo.jpg')).toBe(
                'localPath',
            );
        });
    });

    describe('AC: unsupported inputs are rejected', () => {
        it('returns "unsupported" for null', () => {
            expect(detectNodeInputKind(null)).toBe('unsupported');
        });

        it('returns "unsupported" for undefined', () => {
            expect(detectNodeInputKind(undefined)).toBe('unsupported');
        });

        it('returns "unsupported" for a number', () => {
            expect(detectNodeInputKind(42)).toBe('unsupported');
        });

        it('returns "unsupported" for a plain object', () => {
            expect(detectNodeInputKind({ data: Buffer.alloc(1) })).toBe(
                'unsupported',
            );
        });

        it('returns "unsupported" for an empty string', () => {
            expect(detectNodeInputKind('')).toBe('unsupported');
        });

        it('returns "unsupported" for a boolean', () => {
            expect(detectNodeInputKind(true)).toBe('unsupported');
        });
    });

    describe('AC: assertSupportedNodeInput throws ColorExtractorError', () => {
        it('does not throw for supported inputs', () => {
            expect(() =>
                assertSupportedNodeInput(Buffer.alloc(1)),
            ).not.toThrow();
            expect(() =>
                assertSupportedNodeInput('https://x.com/y.png'),
            ).not.toThrow();
        });

        it('throws for null', () => {
            expect(() => assertSupportedNodeInput(null)).toThrow(
                ColorExtractorError,
            );
        });

        it('throws for unsupported types', () => {
            expect(() => assertSupportedNodeInput(42)).toThrow(
                ColorExtractorError,
            );
        });

        it('error code is COLOR_EXTRACTOR_UNSUPPORTED_INPUT', () => {
            try {
                assertSupportedNodeInput({} as unknown);
                expect.fail('should have thrown');
            } catch (e) {
                expect((e as ColorExtractorError).code).toBe(
                    'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                );
            }
        });
    });
});
