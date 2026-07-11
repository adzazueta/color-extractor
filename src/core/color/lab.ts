const LAB_F_THRESHOLD = (6 / 29) ** 3
const LAB_F_LINEAR_SLOPE = (29 / 6) ** 2 / 3
const LAB_F_LINEAR_OFFSET = 4 / 29

const LAB_WHITE_X = 0.95047
const LAB_WHITE_Y = 1.0
const LAB_WHITE_Z = 1.08883

function f(t: number): number {
  if (t > LAB_F_THRESHOLD) {
    return Math.cbrt(t)
  }
  return LAB_F_LINEAR_SLOPE * t + LAB_F_LINEAR_OFFSET
}

export function xyzToLab(
  x: number,
  y: number,
  z: number,
): { L: number; a: number; b: number } {
  const fx = f(x / LAB_WHITE_X)
  const fy = f(y / LAB_WHITE_Y)
  const fz = f(z / LAB_WHITE_Z)
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function labSquaredDistance(
  a: { L: number; a: number; b: number },
  b: { L: number; a: number; b: number },
): number {
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return dL * dL + da * da + db * db
}

export function labDistance(
  a: { L: number; a: number; b: number },
  b: { L: number; a: number; b: number },
): number {
  return Math.sqrt(labSquaredDistance(a, b))
}
