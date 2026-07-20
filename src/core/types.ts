import type { HslColor, LabColor, RgbColor } from './palette-types.js';

export type RGB = RgbColor;

export type HSL = HslColor;

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
