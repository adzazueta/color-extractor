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