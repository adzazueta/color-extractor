import type { HslColor, LabColor, RgbColor } from './palette-types.js';

/**
 * Scheduled for deprecation in 0.3.0. Use {@link RgbColor} instead.
 */
export type RGB = RgbColor;

/**
 * Scheduled for deprecation in 0.3.0. Use {@link HslColor} instead.
 */
export type HSL = HslColor;

/**
 * Scheduled for deprecation in 0.3.0. Use {@link LabColor} instead.
 */
export type Lab = LabColor;

export type ColorRole = 'primary' | 'secondary' | 'accent' | 'palette';

export type ColorSource = 'cluster' | 'fallback' | 'adjusted';

export interface ExtractedColor {
    readonly hex: string;
    readonly rgb: RGB;
    readonly hsl?: HSL;
    readonly lab?: Lab;
    readonly chroma?: number;
    readonly population?: number;
    readonly proportion?: number;
    readonly score?: number;
    readonly role?: ColorRole;
    readonly source?: ColorSource;
}
