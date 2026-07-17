const M = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041],
] as const;

const M_INV = [
    [3.2404542, -1.5371385, -0.4985314],
    [-0.969266, 1.8760108, 0.041556],
    [0.0556434, -0.2040259, 1.0572252],
] as const;

export function linearRgbToXyz(
    r: number,
    g: number,
    b: number,
): { x: number; y: number; z: number } {
    return {
        x: M[0][0] * r + M[0][1] * g + M[0][2] * b,
        y: M[1][0] * r + M[1][1] * g + M[1][2] * b,
        z: M[2][0] * r + M[2][1] * g + M[2][2] * b,
    };
}

export function xyzToLinearRgb(
    x: number,
    y: number,
    z: number,
): { r: number; g: number; b: number } {
    return {
        r: M_INV[0][0] * x + M_INV[0][1] * y + M_INV[0][2] * z,
        g: M_INV[1][0] * x + M_INV[1][1] * y + M_INV[1][2] * z,
        b: M_INV[2][0] * x + M_INV[2][1] * y + M_INV[2][2] * z,
    };
}
