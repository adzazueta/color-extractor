import { describe, expect, it } from 'vitest';
import {
    assertSupportedBrowserInput,
    detectBrowserInputKind,
} from '../../src/browser/detect.js';
import { ColorExtractorError } from '../../src/core/errors.js';

function mockFile(name: string, content: string, type: string): File {
    return new File([content], name, { type });
}

describe('detectBrowserInputKind (ADZ-53)', () => {
    describe('AC: File input is detected as file', () => {
        it('returns "file" for a File', () => {
            const file = mockFile('img.png', 'fake-png-content', 'image/png');
            expect(detectBrowserInputKind(file)).toBe('file');
        });
    });

    describe('AC: Blob input is detected as blob', () => {
        it('returns "blob" for a Blob', () => {
            const blob = new Blob(['fake-content'], { type: 'image/png' });
            expect(detectBrowserInputKind(blob)).toBe('blob');
        });
    });

    describe('AC: URL string is detected as url', () => {
        it('returns "url" for an http URL', () => {
            expect(detectBrowserInputKind('http://example.com/image.png')).toBe(
                'url',
            );
        });

        it('returns "url" for an https URL', () => {
            expect(
                detectBrowserInputKind('https://example.com/image.png'),
            ).toBe('url');
        });

        it('returns "url" for an uppercase HTTPS:// URL', () => {
            expect(
                detectBrowserInputKind('HTTPS://example.com/image.png'),
            ).toBe('url');
        });

        it('returns "unsupported" for a data URL', () => {
            expect(
                detectBrowserInputKind('data:image/png;base64,iVBORw0KGgo='),
            ).toBe('unsupported');
        });
    });

    describe('AC: unsupported inputs are rejected', () => {
        it('returns "unsupported" for null', () => {
            expect(detectBrowserInputKind(null)).toBe('unsupported');
        });

        it('returns "unsupported" for undefined', () => {
            expect(detectBrowserInputKind(undefined)).toBe('unsupported');
        });

        it('returns "unsupported" for a number', () => {
            expect(detectBrowserInputKind(42)).toBe('unsupported');
        });

        it('returns "unsupported" for a Buffer (Node-only type)', () => {
            expect(detectBrowserInputKind(Buffer.from([1]))).toBe(
                'unsupported',
            );
        });

        it('returns "unsupported" for an empty string', () => {
            expect(detectBrowserInputKind('')).toBe('unsupported');
        });

        it('returns "unsupported" for a boolean', () => {
            expect(detectBrowserInputKind(true)).toBe('unsupported');
        });
    });

    describe('AC: assertSupportedBrowserInput throws ColorExtractorError', () => {
        it('does not throw for supported inputs', () => {
            expect(() =>
                assertSupportedBrowserInput('https://x.com/y.png'),
            ).not.toThrow();
            expect(() =>
                assertSupportedBrowserInput(new Blob(['x'])),
            ).not.toThrow();
        });

        it('throws for null', () => {
            expect(() => assertSupportedBrowserInput(null)).toThrow(
                ColorExtractorError,
            );
        });

        it('throws for unsupported types', () => {
            expect(() => assertSupportedBrowserInput(42)).toThrow(
                ColorExtractorError,
            );
        });

        it('error code is COLOR_EXTRACTOR_UNSUPPORTED_INPUT', () => {
            try {
                assertSupportedBrowserInput({} as unknown);
                expect.fail('should have thrown');
            } catch (e) {
                expect((e as ColorExtractorError).code).toBe(
                    'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                );
            }
        });
    });
});
