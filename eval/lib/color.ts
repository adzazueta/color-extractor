import { srgbToOklab, type Oklab } from "@/core/color/oklab.js";
import { NEAR_BLACK_MAX_CHROMA, NEAR_BLACK_MAX_LIGHTNESS } from "../config.js";

export type Rgb = readonly [number, number, number];

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

/** "#rrggbb" (lowercase) → [r, g, b]; throws RangeError otherwise. */
export function parseHex(hex: string): Rgb {
  if (!HEX_PATTERN.test(hex)) throw new RangeError('Expected a lowercase "#rrggbb" color.');
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Lowercase "#rrggbb". Throws RangeError unless each channel is an integer from 0 to 255. */
export function formatHex(red: number, green: number, blue: number): string {
  let hex = "#";
  for (const channel of [red, green, blue]) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new RangeError("Each channel must be an integer from 0 to 255.");
    }
    hex += channel.toString(16).padStart(2, "0");
  }
  return hex;
}

export function oklabOf(rgb: Rgb): Oklab {
  return srgbToOklab(rgb[0], rgb[1], rgb[2]);
}

/** Euclidean distance in Oklab: sqrt(dL² + da² + db²), in this order of operations. */
export function oklabDistance(a: Rgb, b: Rgb): number {
  const first = oklabOf(a);
  const second = oklabOf(b);
  const dL = first.L - second.L;
  const da = first.a - second.a;
  const db = first.b - second.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** L < NEAR_BLACK_MAX_LIGHTNESS and sqrt(a² + b²) < NEAR_BLACK_MAX_CHROMA. */
export function isNearBlack(rgb: Rgb): boolean {
  const { L, a, b } = oklabOf(rgb);
  return L < NEAR_BLACK_MAX_LIGHTNESS && Math.sqrt(a * a + b * b) < NEAR_BLACK_MAX_CHROMA;
}
