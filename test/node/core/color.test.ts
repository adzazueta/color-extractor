import { describe, expect, it } from "vite-plus/test";
import { cbrt } from "@/core/color/cbrt.js";
import { srgbToOklab, srgbToOklabInto } from "@/core/color/oklab.js";
import { srgbToLinear } from "@/core/color/srgb.js";
import { fromWords, mulberry32, toBits, toHex, ulpDistance } from "./helpers.js";

describe("srgbToLinear", () => {
  it("maps the endpoints exactly", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBe(1);
  });

  it("is strictly increasing", () => {
    for (let i = 1; i < 256; i++) {
      expect(srgbToLinear(i)).toBeGreaterThan(srgbToLinear(i - 1));
    }
  });

  // The table holds the exactly rounded doubles of the transfer function. Evaluating the formula
  // in doubles with Math.pow differs by a few ULP on some entries, so only a tolerance is checked.
  it("matches the sRGB formula evaluated with Math.pow within 1e-15", () => {
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      const expected = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      expect(Math.abs(srgbToLinear(i) - expected)).toBeLessThan(1e-15);
    }
  });

  it("returns NaN for out-of-range or non-integer channels", () => {
    for (const channel of [-1, 256, 1.5, 0.5, Number.NaN, Infinity, -Infinity]) {
      expect(srgbToLinear(channel)).toBeNaN();
    }
  });
});

describe("cbrt", () => {
  it("handles the special values", () => {
    expect(Object.is(cbrt(0), 0)).toBe(true);
    expect(Object.is(cbrt(-0), -0)).toBe(true);
    expect(cbrt(Infinity)).toBe(Infinity);
    expect(cbrt(-Infinity)).toBe(-Infinity);
    expect(cbrt(Number.NaN)).toBeNaN();
  });

  it("is odd", () => {
    const next = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const x = next() * 1000;
      expect(cbrt(-x)).toBe(-cbrt(x));
    }
  });

  it("returns exact roots for exact cubes", () => {
    const roots = [1, 2, 3, 5, 7, 10, 1000, 12345, 0.5, 0.125, 0.1, 2 ** 100, 2 ** -100];
    for (const root of roots) {
      expect(cbrt(root * root * root)).toBe(root);
      expect(cbrt(-(root * root * root))).toBe(-root);
    }
    expect(cbrt(8)).toBe(2);
    expect(cbrt(27)).toBe(3);
    expect(cbrt(0.125)).toBe(0.5);
  });

  it("returns exact roots in the subnormal range", () => {
    // (2^-358)^3 = 2^-1074, the smallest subnormal; (2^-340)^3 = 2^-1020 is a normal number.
    expect(cbrt(2 ** -1074)).toBe(2 ** -358);
    expect(cbrt(2 ** -1071)).toBe(2 ** -357);
    expect(cbrt(2 ** -1020)).toBe(2 ** -340);
    expect(cbrt(Number.MIN_VALUE * 8)).toBe(2 ** -357);
  });

  it("handles the extremes of the range", () => {
    expect(cbrt(Number.MAX_VALUE)).toBeCloseTo(Math.cbrt(Number.MAX_VALUE), -300);
    expect(ulpDistance(cbrt(Number.MAX_VALUE), Math.cbrt(Number.MAX_VALUE))).toBeLessThanOrEqual(
      1n,
    );
    expect(cbrt(2.2250738585072014e-308)).toBeGreaterThan(0);
  });

  it("is within 1 ULP of Math.cbrt over a deterministic sample of many magnitudes", () => {
    const next = mulberry32(20260101);
    let worst = 0n;
    for (let i = 0; i < 200_000; i++) {
      // Random bit patterns: every normal exponent, plus subnormals every 10th sample.
      const exponentField = i % 10 === 0 ? 0 : 1 + Math.floor(next() * 2046);
      const high = (exponentField << 20) | Math.floor(next() * 0x100000);
      const low = Math.floor(next() * 0x100000000);
      const x = fromWords(high, low);
      if (x === 0) continue;
      const distance = ulpDistance(cbrt(x), Math.cbrt(x));
      if (distance > worst) worst = distance;
    }
    expect(worst <= 1n).toBe(true);
  });

  it("is within 1 ULP of Math.cbrt on the unit interval", () => {
    let worst = 0n;
    for (let i = 1; i <= 100_000; i++) {
      const x = i / 100_000;
      const distance = ulpDistance(cbrt(x), Math.cbrt(x));
      if (distance > worst) worst = distance;
    }
    expect(worst <= 1n).toBe(true);
  });
});

describe("Oklab", () => {
  // Reference values from Björn Ottosson's "A perceptual color space for image processing"
  // (https://bottosson.github.io/posts/oklab/, 2021-01-25 matrices) and the CSS Color 4 / oklab
  // examples for the sRGB primaries and gray.
  const references: Array<{
    name: string;
    rgb: [number, number, number];
    lab: [number, number, number];
  }> = [
    { name: "white", rgb: [255, 255, 255], lab: [1, 0, 0] },
    { name: "black", rgb: [0, 0, 0], lab: [0, 0, 0] },
    { name: "red", rgb: [255, 0, 0], lab: [0.627955, 0.224863, 0.125846] },
    { name: "green", rgb: [0, 255, 0], lab: [0.86644, -0.233888, 0.179498] },
    { name: "blue", rgb: [0, 0, 255], lab: [0.452014, -0.032457, -0.311528] },
    { name: "#808080", rgb: [128, 128, 128], lab: [0.599871, 0, 0] },
  ];

  for (const { name, rgb, lab } of references) {
    it(`matches the published value for ${name}`, () => {
      const result = srgbToOklab(...rgb);
      expect(Math.abs(result.L - lab[0])).toBeLessThan(5e-6);
      expect(Math.abs(result.a - lab[1])).toBeLessThan(5e-6);
      expect(Math.abs(result.b - lab[2])).toBeLessThan(5e-6);
    });
  }

  it("srgbToOklab and srgbToOklabInto agree bit for bit", () => {
    const out = new Float64Array(3);
    const next = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const r = Math.floor(next() * 256);
      const g = Math.floor(next() * 256);
      const b = Math.floor(next() * 256);
      srgbToOklabInto(r, g, b, out, 0);
      const lab = srgbToOklab(r, g, b);
      expect(toBits(lab.L)).toBe(toBits(out[0]!));
      expect(toBits(lab.a)).toBe(toBits(out[1]!));
      expect(toBits(lab.b)).toBe(toBits(out[2]!));
    }
  });

  it("writes at the given offset and leaves other entries alone", () => {
    const out = new Float64Array(7).fill(-9);
    srgbToOklabInto(255, 0, 0, out, 2);
    const lab = srgbToOklab(255, 0, 0);
    expect([out[0], out[1], out[5], out[6]]).toEqual([-9, -9, -9, -9]);
    expect(toHex(out[2]!)).toBe(toHex(lab.L));
    expect(toHex(out[3]!)).toBe(toHex(lab.a));
    expect(toHex(out[4]!)).toBe(toHex(lab.b));
  });

  it("returns NaN for channels that are not integers from 0 to 255", () => {
    for (const lab of [srgbToOklab(-1, 0, 0), srgbToOklab(0, 256, 0), srgbToOklab(0, 0, 1.5)]) {
      expect(lab.L).toBeNaN();
      expect(lab.a).toBeNaN();
      expect(lab.b).toBeNaN();
    }
  });

  it("keeps lightness monotonic along the gray ramp", () => {
    let previous = -1;
    for (let i = 0; i < 256; i++) {
      const { L } = srgbToOklab(i, i, i);
      expect(L).toBeGreaterThan(previous);
      previous = L;
    }
  });
});
