import { describe, expect, it } from "vite-plus/test";
import { extractColorsFromPixels } from "@/core/index.js";
import type { PixelInput } from "@/core/types.js";
import {
  colorBlocks,
  colorNoise,
  coverImage,
  grayGradient,
  grayNoise,
  linearGradient,
  manyCells,
  transparencyMix,
} from "./images.js";

// These snapshots hold the EXACT results of extractColorsFromPixels for synthetic images generated
// in code (gradients, color blocks, and noise from a fixed-seed generator). CI compares them on
// every supported Node version and on x64 and ARM (section 9.1 of the specification), and Vitest
// never writes snapshots in CI. They change only with an intentional algorithm change, which also
// changes `algorithmVersion`: regenerate them then with `vp test -u`, and never to make a test
// pass.
const images: [string, () => PixelInput][] = [
  ["linear gradient, RGB, 256x32", () => linearGradient(256, 32, [220, 30, 40], [20, 80, 230])],
  ["linear gradient, gray, 256x16", () => grayGradient(256, 16)],
  ["color blocks, 3x2 grid, 192x128", () => colorBlocks(192, 128, 3, 2)],
  ["cover: blocks plus gradient with grain, 160x240", () => coverImage(160, 240, 2024)],
  ["color noise, seed 7, 128x128", () => colorNoise(128, 128, 7)],
  ["gray noise, seed 8, 128x128", () => grayNoise(128, 128, 8)],
  [
    "transparency mix: semi-transparent band, hidden region, 192x128",
    () => transparencyMix(192, 128, 99),
  ],
  ["many cells: 12x12 tiles with grain, seed 5, 240x240", () => manyCells(240, 240, 5)],
];

describe("determinism of extractColorsFromPixels on synthetic images", () => {
  describe.each(images)("%s", (_name, make) => {
    for (const mode of ["population", "perceptual"] as const) {
      it(`mode ${mode}, count 16`, () => {
        expect(extractColorsFromPixels(make(), { mode, count: 16 })).toMatchSnapshot();
      });
    }

    it("default options", () => {
      expect(extractColorsFromPixels(make())).toMatchSnapshot();
    });

    it("gives the same result when run twice", () => {
      expect(extractColorsFromPixels(make(), { count: 16 })).toEqual(
        extractColorsFromPixels(make(), { count: 16 }),
      );
    });
  });
});
