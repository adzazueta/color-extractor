export function normalizeHue(hue: number): number {
  const wrapped = hue % 360
  if (wrapped === 0) return 0
  return wrapped < 0 ? wrapped + 360 : wrapped
}

export function chromaFromLab(a: number, b: number): number {
  return Math.sqrt(a * a + b * b)
}

export function hueFromLab(a: number, b: number): number {
  return normalizeHue((Math.atan2(b, a) * 180) / Math.PI)
}

export function circularHueDistance(h1: number, h2: number): number {
  const diff = Math.abs(normalizeHue(h1) - normalizeHue(h2))
  return Math.min(diff, 360 - diff)
}
