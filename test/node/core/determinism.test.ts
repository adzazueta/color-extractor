import { describe, expect, it } from "vite-plus/test";
import { cbrt } from "@/core/color/cbrt.js";
import { srgbToOklabInto } from "@/core/color/oklab.js";
import { srgbToLinear } from "@/core/color/srgb.js";
import { Digest, fromWords, mulberry32, toHex } from "./helpers.js";

// These snapshots hold exact bit patterns (hex), not rounded decimals. CI runs them on every
// Node version and on x64 and ARM, so any platform difference in a result fails the build.
// Never update them to make a test pass; regenerate only for an intentional algorithm change.
describe("determinism across platforms", () => {
  it("sRGB table: bit patterns of the 256 entries", () => {
    const entries: string[] = [];
    for (let i = 0; i < 256; i++) {
      entries.push(`${i.toString().padStart(3, " ")} ${toHex(srgbToLinear(i))}`);
    }
    expect(entries.join("\n")).toMatchSnapshot();
  });

  it("cbrt: digest over a fixed sample and exact values", () => {
    const next = mulberry32(424242);
    const digest = new Digest();
    for (let i = 0; i < 300_000; i++) {
      const exponentField = i % 10 === 0 ? 0 : 1 + Math.floor(next() * 2046);
      const high = (exponentField << 20) | Math.floor(next() * 0x100000);
      const x = fromWords(high, Math.floor(next() * 0x100000000));
      digest.addDouble(cbrt(x));
      digest.addDouble(cbrt(-x));
    }
    // Also every value i / 4096 on [0, 64), which covers the range of the Oklab cone sums.
    for (let i = 0; i < 262_144; i++) {
      digest.addDouble(cbrt(i / 4096));
    }
    const values = [2, 3, 0.5, 0.1, 1e-5, 12345.678, 1e300, 5e-324].map(
      (x) => `${x}: ${toHex(cbrt(x))}`,
    );
    expect({ digest: digest.hex(), values }).toMatchSnapshot();
  });

  it("Oklab: digest over all 16,777,216 colors", () => {
    const out = new Float64Array(3);
    const digest = new Digest();
    for (let r = 0; r < 256; r++) {
      for (let g = 0; g < 256; g++) {
        for (let b = 0; b < 256; b++) {
          srgbToOklabInto(r, g, b, out, 0);
          digest.addDouble(out[0]!);
          digest.addDouble(out[1]!);
          digest.addDouble(out[2]!);
        }
      }
    }
    expect(digest.hex()).toMatchSnapshot();
  }, 60_000);

  it("Oklab: exact bit patterns of reference colors", () => {
    const out = new Float64Array(3);
    const colors: Array<[string, number, number, number]> = [
      ["black", 0, 0, 0],
      ["white", 255, 255, 255],
      ["red", 255, 0, 0],
      ["green", 0, 255, 0],
      ["blue", 0, 0, 255],
      ["gray #808080", 128, 128, 128],
      ["cyan", 0, 255, 255],
      ["magenta", 255, 0, 255],
      ["yellow", 255, 255, 0],
      ["#010203", 1, 2, 3],
      ["#fe7f01", 254, 127, 1],
      ["#123456", 0x12, 0x34, 0x56],
    ];
    const lines = colors.map(([name, r, g, b]) => {
      srgbToOklabInto(r, g, b, out, 0);
      return `${name.padEnd(12)} L=${toHex(out[0]!)} a=${toHex(out[1]!)} b=${toHex(out[2]!)}`;
    });
    expect(lines.join("\n")).toMatchSnapshot();
  });

  it("Oklab: digest is independent of the output offset", () => {
    const wide = new Float64Array(6);
    const narrow = new Float64Array(3);
    srgbToOklabInto(10, 200, 30, narrow, 0);
    srgbToOklabInto(10, 200, 30, wide, 3);
    expect([toHex(wide[3]!), toHex(wide[4]!), toHex(wide[5]!)]).toEqual(
      Array.from(narrow, (value) => toHex(value)),
    );
  });
});
