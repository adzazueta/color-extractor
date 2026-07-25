import { describe, expect, it } from 'vitest';
import { extractColors } from '../../src/browser/index.js';
import { ColorExtractorError } from '../../src/core/errors.js';

describe('browser extractColors error handling (ADZ-51)', () => {
    it('rejects null input with unsupported input', async () => {
        await expect(extractColors(null as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });

    it('rejects undefined input', async () => {
        await expect(
            extractColors(undefined as unknown as never),
        ).rejects.toThrow(ColorExtractorError);
    });

    it('rejects number input', async () => {
        await expect(extractColors(42 as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });

    it('rejects boolean input', async () => {
        await expect(extractColors(true as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });

    it('rejects object input', async () => {
        await expect(extractColors({} as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });
});
