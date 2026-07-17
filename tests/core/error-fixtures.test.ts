import { describe, expect, it } from 'vitest';
import { runExtractionPipeline } from '../../src/core/extract.js';
import {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
} from '../../src/core/index.js';
import { validateCoreInput } from '../../src/core/validation.js';
import { FIXTURES } from './fixtures.js';

function expectCode(fn: () => unknown, expectedCode: string): void {
    try {
        fn();
        expect.fail('Expected function to throw');
    } catch (e) {
        expect(e).toBeInstanceOf(ColorExtractorError);
        expect((e as ColorExtractorError).code).toBe(expectedCode);
    }
}

describe('typed errors with fixtures (ADZ-80)', () => {
    describe('AC: errors are instances of ColorExtractorError', () => {
        it('ColorExtractorError is a subclass of Error', () => {
            const err = new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                'test',
            );
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(ColorExtractorError);
        });

        it('ColorExtractorError has code and cause properties', () => {
            const cause = { foo: 1 };
            const err = new ColorExtractorError(
                'COLOR_EXTRACTOR_NO_VALID_PIXELS',
                'msg',
                { cause },
            );
            expect(err.code).toBe('COLOR_EXTRACTOR_NO_VALID_PIXELS');
            expect(err.cause).toEqual(cause);
        });
    });

    describe('AC: error codes match public documentation', () => {
        it('COLOR_EXTRACTOR_ERROR_CODES contains all documented codes', () => {
            const codes = COLOR_EXTRACTOR_ERROR_CODES;
            expect(codes).toContain('COLOR_EXTRACTOR_UNSUPPORTED_INPUT');
            expect(codes).toContain('COLOR_EXTRACTOR_NO_VALID_PIXELS');
            expect(codes).toContain('COLOR_EXTRACTOR_UNSAFE_URL');
            expect(codes).toContain('COLOR_EXTRACTOR_TIMEOUT');
            expect(codes).toContain('COLOR_EXTRACTOR_FETCH_FAILED');
            expect(codes).toContain('COLOR_EXTRACTOR_DECODE_FAILED');
            expect(codes).toContain('COLOR_EXTRACTOR_CORS_ERROR');
            expect(codes).toContain('COLOR_EXTRACTOR_INPUT_TOO_LARGE');
            expect(codes).toContain('COLOR_EXTRACTOR_IMAGE_TOO_LARGE');
            expect(codes).toContain('COLOR_EXTRACTOR_UNSUPPORTED_FORMAT');
            expect(codes).toContain('COLOR_EXTRACTOR_SHARP_MISSING');
            expect(codes.length).toBeGreaterThanOrEqual(11);
        });
    });

    describe('AC: representative error paths are covered', () => {
        it('validateCoreInput rejects null input with UNSUPPORTED_INPUT', () => {
            expectCode(
                () => validateCoreInput(null as unknown as never),
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            );
        });

        it('validateCoreInput rejects non-object input', () => {
            expectCode(
                () => validateCoreInput(42 as unknown as never),
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            );
        });

        it('transparent fixture throws NO_VALID_PIXELS through the pipeline', () => {
            expectCode(
                () => runExtractionPipeline(FIXTURES.transparent),
                'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            );
        });

        it('semiTransparent fixture also throws NO_VALID_PIXELS', () => {
            expectCode(
                () => runExtractionPipeline(FIXTURES.semiTransparent),
                'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            );
        });

        it('valid bicolorRedBlue fixture does NOT throw any error', () => {
            expect(() =>
                runExtractionPipeline(FIXTURES.bicolorRedBlue),
            ).not.toThrow();
        });
    });
});
