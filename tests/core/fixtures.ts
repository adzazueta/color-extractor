import type { PixelInput } from '../../src/core/validation.js';

export interface RgbColor {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

function makePixels(
    width: number,
    height: number,
    fill: (i: number, total: number) => RgbColor,
    alpha: number = 255,
    _offsetX: number = 0,
    _offsetY: number = 0,
): PixelInput {
    const total = width * height;
    const data = new Uint8Array(total * 4);
    for (let i = 0; i < total; i++) {
        const c = fill(i, total);
        const o = i * 4;
        data[o] = c.r;
        data[o + 1] = c.g;
        data[o + 2] = c.b;
        data[o + 3] = alpha;
    }
    return { data, width, height };
}

function solidColor(
    r: number,
    g: number,
    b: number,
    a: number = 255,
): PixelInput {
    return makePixels(10, 10, () => ({ r, g, b }), a);
}

function bicolorBlocks(
    colorA: RgbColor,
    colorB: RgbColor,
    w: number = 10,
    h: number = 10,
): PixelInput {
    const half = (w * h) / 2;
    return makePixels(w, h, (i) => (i < half ? colorA : colorB));
}

const RED: RgbColor = { r: 244, g: 10, b: 10 };
const GREEN: RgbColor = { r: 10, g: 244, b: 10 };
const BLUE: RgbColor = { r: 10, g: 10, b: 244 };
const WHITE: RgbColor = { r: 244, g: 244, b: 244 };
const BLACK: RgbColor = { r: 10, g: 10, b: 10 };
const GRAY128: RgbColor = { r: 128, g: 128, b: 128 };
const MUTED_GRAY: RgbColor = { r: 150, g: 140, b: 130 };
const CRIMSON: RgbColor = { r: 220, g: 20, b: 60 };
const TEAL: RgbColor = { r: 10, g: 128, b: 128 };
const PURPLE: RgbColor = { r: 128, g: 10, b: 128 };
const ORANGE: RgbColor = { r: 244, g: 160, b: 10 };
const YELLOW: RgbColor = { r: 244, g: 244, b: 10 };
const DARK_GRAY: RgbColor = { r: 50, g: 50, b: 50 };
const _LIGHT_GRAY: RgbColor = { r: 200, g: 200, b: 200 };

function solid(rgb: RgbColor): PixelInput {
    return solidColor(rgb.r, rgb.g, rgb.b);
}

export const FIXTURES = {
    red: solid(RED),
    green: solid(GREEN),
    blue: solid(BLUE),
    white: solid(WHITE),
    black: solid(BLACK),
    gray: solid(GRAY128),
    transparent: solidColor(128, 128, 128, 0),
    semiTransparent: solidColor(128, 128, 128, 64),

    bicolorRedBlue: bicolorBlocks(RED, BLUE, 10, 10),
    bicolorGreenBlack: bicolorBlocks(GREEN, BLACK, 10, 10),
    bicolorWhiteGray: bicolorBlocks(WHITE, GRAY128, 10, 10),

    mutedPlusVivid: (() => {
        const w = 16;
        const h = 16;
        const total = w * h;
        const mutedCount = Math.floor(total * 0.75);
        return makePixels(w, h, (i) => (i < mutedCount ? MUTED_GRAY : CRIMSON));
    })(),

    monochrome: makePixels(8, 8, (i, total) => {
        const v = Math.round((i / (total - 1)) * 255);
        return { r: v, g: v, b: v };
    }),

    transparentInput: solidColor(128, 128, 128, 0),

    mostlyTransparent: (() => {
        const w = 10;
        const h = 10;
        const total = w * h;
        return makePixels(
            w,
            h,
            (i) => (i < total - 3 ? { r: 128, g: 128, b: 128 } : RED),
            0,
        );
    })(),

    rainbowPalette: (() => {
        const colors: RgbColor[] = [
            RED,
            GREEN,
            BLUE,
            YELLOW,
            PURPLE,
            ORANGE,
            TEAL,
            CRIMSON,
            WHITE,
            BLACK,
        ];
        const w = 50;
        const h = 50;
        const total = w * h;
        const blockSize = Math.floor(total / colors.length);
        return makePixels(w, h, (i) => {
            const idx = Math.min(Math.floor(i / blockSize), colors.length - 1);
            return colors[idx]!;
        });
    })(),

    multiColorPalette: (() => {
        const w = 20;
        const h = 20;
        const quadW = w / 2;
        const quadH = h / 2;
        const colors: RgbColor[] = [RED, GREEN, BLUE, YELLOW];
        return makePixels(w, h, (i) => {
            const x = i % w;
            const y = Math.floor(i / w);
            const cx = Math.floor(x / quadW);
            const cy = Math.floor(y / quadH);
            return colors[cy * 2 + cx]!;
        });
    })(),

    darkMuted: (() => {
        const w = 10;
        const h = 10;
        const total = w * h;
        const mutedCount = Math.floor(total * 0.9);
        return makePixels(w, h, (i) => (i < mutedCount ? DARK_GRAY : ORANGE));
    })(),

    highDiversity: (() => {
        const w = 32;
        const h = 32;
        return makePixels(w, h, (i) => ({
            r: (i * 7) % 256,
            g: (i * 13) % 256,
            b: (i * 23) % 256,
        }));
    })(),
} as const satisfies Record<string, PixelInput>;
