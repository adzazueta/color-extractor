import { describe, expect, it } from 'vitest';
import { extractColor } from '../../src/browser/index.js';
import { ColorExtractorError } from '../../src/core/errors.js';

describe('browser extractColors error handling (ADZ-51)', () => {
    it('rejects null input with unsupported input', async () => {
        await expect(extractColor(null as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });

    it('rejects undefined input', async () => {
        await expect(
            extractColor(undefined as unknown as never),
        ).rejects.toThrow(ColorExtractorError);
    });

    it('rejects number input', async () => {
        await expect(extractColor(42 as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });

    it('rejects boolean input', async () => {
        await expect(extractColor(true as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });

    it('rejects object input', async () => {
        await expect(extractColor({} as unknown as never)).rejects.toThrow(
            ColorExtractorError,
        );
    });
});
