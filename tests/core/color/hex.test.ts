import { describe, expect, it } from 'vitest';
import { rgbToHex } from '../../../src/core/color/hex.js';

describe('rgbToHex', () => {
    it('formats RGB channels as lowercase hex', () => {
        expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    });

    it('zero-pads single-digit channels', () => {
        expect(rgbToHex({ r: 1, g: 15, b: 16 })).toBe('#010f10');
    });

    it('rounds fractional channels deterministically', () => {
        expect(rgbToHex({ r: 127.5, g: 127.4, b: 0.5 })).toBe('#807f01');
    });

    it('clamps out-of-range channels', () => {
        expect(rgbToHex({ r: -1, g: 128, b: 300 })).toBe('#0080ff');
    });

    it('rejects non-finite channels', () => {
        expect(() => rgbToHex({ r: Number.NaN, g: 0, b: 0 })).toThrow(
            RangeError,
        );
        expect(() => rgbToHex({ r: Infinity, g: 0, b: 0 })).toThrow(RangeError);
    });
});
