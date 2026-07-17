import { describe, expect, it } from 'vitest';
import { runExtractionPipeline } from '../../src/core/extract.js';
import { FIXTURES } from './fixtures.js';

const INPUT = FIXTURES.multiColorPalette;

describe('output flags through pipeline (ADZ-75)', () => {
    describe('AC: default result contains only required public color fields', () => {
        it('primary has hex, rgb, hsl but no lab or score', () => {
            const result = runExtractionPipeline(INPUT);
            expect(result.primary.hex).toBeTruthy();
            expect(result.primary.rgb).toBeDefined();
            expect(result.primary.hsl).toBeDefined();
            expect(
                (result.primary as unknown as Record<string, unknown>).lab,
            ).toBeUndefined();
            expect(
                (result.primary as unknown as Record<string, unknown>).score,
            ).toBeUndefined();
        });

        it('palette and accents are absent by default', () => {
            const result = runExtractionPipeline(INPUT);
            expect(
                (result as unknown as Record<string, unknown>).palette,
            ).toBeUndefined();
            expect(
                (result as unknown as Record<string, unknown>).accents,
            ).toBeUndefined();
        });

        it('metadata is absent by default', () => {
            const result = runExtractionPipeline(INPUT);
            expect(
                (result as unknown as Record<string, unknown>).metadata,
            ).toBeUndefined();
        });
    });

    describe('AC: optional fields are present when flags are enabled', () => {
        it('includePalette adds palette array', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includePalette: true },
            });
            expect(
                (result as unknown as Record<string, unknown>).palette,
            ).toBeDefined();
            expect(
                Array.isArray(
                    (result as unknown as Record<string, unknown>).palette,
                ),
            ).toBe(true);
        });

        it('includeAccents adds accents array', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includeAccents: true },
            });
            expect(
                (result as unknown as Record<string, unknown>).accents,
            ).toBeDefined();
            expect(
                Array.isArray(
                    (result as unknown as Record<string, unknown>).accents,
                ),
            ).toBe(true);
        });

        it('includeMetadata adds metadata object', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includeMetadata: true },
            });
            expect(
                (result as unknown as Record<string, unknown>).metadata,
            ).toBeDefined();
        });

        it('includeLab adds lab to primary', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includeLab: true },
            });
            expect(
                (result.primary as unknown as Record<string, unknown>).lab,
            ).toBeDefined();
        });

        it('includeScores adds score to primary', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includeScores: true },
            });
            expect(
                (result.primary as unknown as Record<string, unknown>).score,
            ).toBeDefined();
        });
    });

    describe('AC: RGB and HEX are always present', () => {
        it('primary always has rgb and hex even with lab and scores', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includeLab: true, includeScores: true },
            });
            expect(result.primary.rgb).toBeDefined();
            expect(result.primary.hex).toBeTruthy();
        });

        it('secondary always has rgb and hex', () => {
            const result = runExtractionPipeline(INPUT);
            if (result.secondary) {
                expect(result.secondary.rgb).toBeDefined();
                expect(result.secondary.hex).toBeTruthy();
            }
        });

        it('palette colors always have rgb and hex', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includePalette: true },
            });
            const palette = (result as unknown as Record<string, unknown>)
                .palette as Array<Record<string, unknown>>;
            expect(palette).toBeDefined();
            expect(palette.length).toBeGreaterThan(0);
            for (const color of palette) {
                expect(color.rgb).toBeDefined();
                expect(color.hex).toBeTruthy();
            }
        });
    });

    describe('AC: HSL can be excluded', () => {
        it('includeHsl: false removes hsl from primary', () => {
            const result = runExtractionPipeline(INPUT, {
                output: { includeHsl: false },
            });
            expect(
                (result.primary as unknown as Record<string, unknown>).hsl,
            ).toBeUndefined();
        });
    });
});
