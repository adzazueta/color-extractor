import { normalizeHue } from './chroma-hue.js';

function clampUnit(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function clampByte(value: number): number {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return Math.round(value);
}

function positiveModulo(value: number, mod: number): number {
    return ((value % mod) + mod) % mod;
}

export function rgbToHsl(
    r: number,
    g: number,
    b: number,
): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    const l = (max + min) / 2;

    if (delta === 0) {
        return { h: 0, s: 0, l };
    }

    const s = delta / (1 - Math.abs(2 * l - 1));

    let h: number;
    if (max === rn) {
        h = 60 * positiveModulo((gn - bn) / delta, 6);
    } else if (max === gn) {
        h = 60 * ((bn - rn) / delta + 2);
    } else {
        h = 60 * ((rn - gn) / delta + 4);
    }

    return { h: normalizeHue(h), s, l };
}

export function hslToRgb(
    h: number,
    s: number,
    l: number,
): { r: number; g: number; b: number } {
    const hn = normalizeHue(h);
    const sn = clampUnit(s);
    const ln = clampUnit(l);

    if (sn === 0) {
        const v = clampByte(ln * 255);
        return { r: v, g: v, b: v };
    }

    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(positiveModulo(hn / 60, 2) - 1));
    const m = ln - c / 2;

    let rn: number;
    let gn: number;
    let bn: number;
    if (hn < 60) {
        rn = c;
        gn = x;
        bn = 0;
    } else if (hn < 120) {
        rn = x;
        gn = c;
        bn = 0;
    } else if (hn < 180) {
        rn = 0;
        gn = c;
        bn = x;
    } else if (hn < 240) {
        rn = 0;
        gn = x;
        bn = c;
    } else if (hn < 300) {
        rn = x;
        gn = 0;
        bn = c;
    } else {
        rn = c;
        gn = 0;
        bn = x;
    }

    return {
        r: clampByte((rn + m) * 255),
        g: clampByte((gn + m) * 255),
        b: clampByte((bn + m) * 255),
    };
}
