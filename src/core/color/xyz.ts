const M = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
] as const

export function linearRgbToXyz(
  r: number,
  g: number,
  b: number,
): { x: number; y: number; z: number } {
  return {
    x: M[0][0] * r + M[0][1] * g + M[0][2] * b,
    y: M[1][0] * r + M[1][1] * g + M[1][2] * b,
    z: M[2][0] * r + M[2][1] * g + M[2][2] * b,
  }
}
