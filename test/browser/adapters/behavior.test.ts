/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/browser/index.js";
import { halves } from "../../support/pixels.js";
import { ENGINE, fixture, isRedDominant, rejection } from "./helpers.js";

describe("EXIF orientation", () => {
  test("orientation 6 rotates 40x20 to 20x40 with red on top", async () => {
    const result = await extractColors(await fixture("orientation-6.jpg"), { count: 2 });
    expect(result.meta.width).toBe(20);
    expect(result.meta.height).toBe(40);
    const red = result.colors.find((color) => color.rgba[0] > 200 && color.rgba[2] < 60);
    const blue = result.colors.find((color) => color.rgba[2] > 200 && color.rgba[0] < 60);
    expect(red?.position.y).toBeLessThan(20);
    expect(blue?.position.y).toBeGreaterThanOrEqual(20);
  });

  test("orientation 3 keeps the size and swaps the sides", async () => {
    const result = await extractColors(await fixture("orientation-3.jpg"), { count: 2 });
    expect(result.meta.width).toBe(halves().width);
    expect(result.meta.height).toBe(halves().height);
    const red = result.colors.find((color) => color.rgba[0] > 200 && color.rgba[2] < 60);
    expect(red?.position.x).toBeGreaterThanOrEqual(20);
  });
});

describe("color", () => {
  test("CMYK JPEG has the right size and a red-dominant hue (engines differ in exact values)", async () => {
    for (const name of ["cmyk.jpg", "cmyk-no-profile.jpg"] as const) {
      const result = await extractColors(await fixture(name), { count: 1 });
      expect(result.meta.width).toBe(16);
      expect(result.meta.height).toBe(16);
      expect(isRedDominant(result.colors[0])).toBe(true);
    }
  });

  // Firefox ignores the embedded ICC profile in this path and returns the raw values.
  test.skipIf(ENGINE === "firefox")("a Display P3 PNG has its profile applied", async () => {
    const result = await extractColors(await fixture("p3.png"), { count: 1 });
    // With the profile applied this fixture decodes to (200, 60, 30), as in sharp; ignoring the
    // profile gives about (185, 71, 43), so the tolerance tells the two apart.
    for (const [index, want] of [200, 60, 30].entries()) {
      expect(Math.abs((result.colors[0]?.rgba[index] ?? 999) - want)).toBeLessThanOrEqual(3);
    }
  });

  test("a Display P3 PNG is red-dominant in every engine", async () => {
    const result = await extractColors(await fixture("p3.png"), { count: 1 });
    expect(isRedDominant(result.colors[0])).toBe(true);
  });

  test("gray, gray with alpha, 16-bit, and palette images decode", async () => {
    for (const name of ["gray.png", "gray-alpha.png", "rgb16.png", "palette.png"] as const) {
      const result = await extractColors(await fixture(name));
      expect(result.colors.length).toBeGreaterThan(0);
    }
    const gray = await extractColors(await fixture("gray.png"), { count: 1 });
    const [r, g, b] = gray.colors[0]?.rgba ?? [0, 1, 2];
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
  });
});

describe("formats", () => {
  test("animated WebP and APNG give the first frame (red)", async () => {
    for (const name of ["animated.webp", "animated.png"] as const) {
      const result = await extractColors(await fixture(name), { count: 1 });
      expect(result.colors[0]?.hex).toBe("#ff0000");
    }
  });

  test("GIF (animated or still), TIFF, SVG, HEIC, and unknown bytes are UNSUPPORTED_FORMAT", async () => {
    for (const name of [
      "animated.gif",
      "static.gif",
      "image.tiff",
      "image.svg",
      "heic-brand.bin",
      "garbage.bin",
    ] as const) {
      const error = await rejection(extractColors(await fixture(name)));
      expect(error.code, name).toBe("UNSUPPORTED_FORMAT");
    }
  });

  test("a header that claims a huge image is INPUT_TOO_LARGE", async () => {
    const error = await rejection(extractColors(await fixture("large-header.png")));
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });

  // Decision 24 A: Firefox and WebKit can return a partial image for damaged data, so only
  // Chromium is required to fail. Any other engine either fails with DECODE_FAILED or succeeds.
  test.each(["truncated.jpg", "corrupt.png"] as const)("damaged data (%s)", async (name) => {
    const outcome = await extractColors(await fixture(name)).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    if (ENGINE === "chromium") {
      expect((outcome as { code?: string } | undefined)?.code).toBe("DECODE_FAILED");
    } else if (outcome !== undefined) {
      expect((outcome as { code?: string }).code).toBe("DECODE_FAILED");
    }
  });
});
