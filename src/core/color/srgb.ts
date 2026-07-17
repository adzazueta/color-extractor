const SRGB_LINEAR_THRESHOLD = 0.04045
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_POWER_OFFSET = 0.055
const SRGB_POWER_SCALE = 1.055
const SRGB_POWER_EXPONENT = 2.4

export function srgbToLinear(normalized: number): number {
  if (normalized <= SRGB_LINEAR_THRESHOLD) {
    return normalized / SRGB_LINEAR_DIVISOR
  }
  return ((normalized + SRGB_POWER_OFFSET) / SRGB_POWER_SCALE) ** SRGB_POWER_EXPONENT
}

export function srgbByteToLinear(byte: number): number {
  return srgbToLinear(byte / 255)
}

export function linearToSrgbByte(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear))
  let s = clamped
  if (s <= 0.0031308) {
    s = s * SRGB_LINEAR_DIVISOR
  } else {
    s = SRGB_POWER_SCALE * s ** (1 / SRGB_POWER_EXPONENT) - SRGB_POWER_OFFSET
  }
  return Math.round(s * 255)
}