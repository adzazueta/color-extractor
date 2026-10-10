import { expect, test } from "vite-plus/test";
import { srgbToOklab } from "@/core/color/oklab.js";
import {
  formatHex,
  isNearBlack,
  oklabDistance,
  oklabOf,
  parseHex,
  type Rgb,
} from "../../../eval/lib/color.js";

test("parseHex and formatHex round-trip every value of each channel", () => {
  for (let value = 0; value < 256; value++) {
    const hex = formatHex(value, 255 - value, value);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseHex(hex)).toEqual([value, 255 - value, value]);
  }
  expect(formatHex(217, 130, 43)).toBe("#d9822b");
  expect(parseHex("#00ff10")).toEqual([0, 255, 16]);
});

test("uppercase, short, and malformed hex are rejected", () => {
  for (const bad of [
    "#D9822B",
    "#fff",
    "d9822b",
    "#d9822",
    "#d9822bb",
    "",
    "#gggggg",
    " #d9822b",
  ]) {
    expect(() => parseHex(bad), JSON.stringify(bad)).toThrow(RangeError);
  }
});

test("formatHex rejects channels outside 0..255 or not integers", () => {
  for (const bad of [-1, 256, 1.5, Number.NaN]) {
    expect(() => formatHex(bad, 0, 0)).toThrow(RangeError);
  }
});

test("oklabOf is the package's own conversion", () => {
  expect(oklabOf([12, 200, 99])).toEqual(srgbToOklab(12, 200, 99));
});

test("the distance is 0 for equal colors and symmetric", () => {
  const a: Rgb = [217, 130, 43];
  const b: Rgb = [40, 170, 180];
  expect(oklabDistance(a, a)).toBe(0);
  expect(oklabDistance(a, b)).toBe(oklabDistance(b, a));
  expect(oklabDistance(a, b)).toBeGreaterThan(0.2);
});

test("oklabDistance of black and #0a0a0a is 0.1448 and matches the inline formula bit for bit", () => {
  const distance = oklabDistance([0, 0, 0], [10, 10, 10]);
  expect(Math.round(distance * 10_000) / 10_000).toBe(0.1448);
  const x = srgbToOklab(0, 0, 0);
  const y = srgbToOklab(10, 10, 10);
  const dL = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  expect(Object.is(distance, Math.sqrt(dL * dL + da * da + db * db))).toBe(true);
});

test("neighboring grays are as far apart as the design measured", () => {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  expect(round(oklabDistance([10, 10, 10], [20, 20, 20]))).toBe(0.046);
  expect(round(oklabDistance([20, 20, 20], [30, 30, 30]))).toBe(0.044);
});

test.each([
  ["gray 0", "#000000", 0, true],
  ["gray 10", "#0a0a0a", 0.145, true],
  ["gray 32", "#202020", 0.244, true],
  ["gray 40", "#282828", 0.277, false],
  ["ink", "#101418", 0.189, true],
  ["dark brown", "#2b1d14", 0.245, true],
  // The design table lists #1e2226 as "L is not < 0.25", but its L is 0.24957, which rounds to 0.250.
  ["charcoal, just under", "#1e2226", 0.25, true],
  ["charcoal, just over", "#202428", 0.258, false],
  ["navy", "#000040", 0.168, false],
  ["dark red", "#3a0b0b", 0.235, false],
] as const)("near-black: %s (%s)", (_name, hex, lightness, expected) => {
  expect(Math.round(oklabOf(parseHex(hex)).L * 1000) / 1000).toBe(lightness);
  expect(isNearBlack(parseHex(hex))).toBe(expected);
});
