import { describe, expect, test } from "vite-plus/test";
import {
  clientToPixel,
  displayScale,
  floatingPosition,
  magnifierWindow,
  pixelCenter,
} from "../../../../lab/ui/geometry.js";

const rect = { left: 100, top: 50, width: 200, height: 100 };
const size = { width: 20, height: 10 };

describe("clientToPixel", () => {
  test("maps the corners and the middle", () => {
    expect(clientToPixel(100, 50, rect, size)).toEqual({ x: 0, y: 0 });
    expect(clientToPixel(299.9, 149.9, rect, size)).toEqual({ x: 19, y: 9 });
    expect(clientToPixel(205, 105, rect, size)).toEqual({ x: 10, y: 5 });
  });

  test("is null outside the rectangle", () => {
    expect(clientToPixel(99.9, 60, rect, size)).toBeNull();
    expect(clientToPixel(300, 60, rect, size)).toBeNull();
    expect(clientToPixel(150, 150, rect, size)).toBeNull();
    expect(clientToPixel(150, 49, rect, size)).toBeNull();
  });

  test("is null for an empty rectangle or image", () => {
    expect(clientToPixel(0, 0, { left: 0, top: 0, width: 0, height: 0 }, size)).toBeNull();
    expect(clientToPixel(10, 10, rect, { width: 0, height: 0 })).toBeNull();
  });

  test("stays inside the image when scaled by a fraction", () => {
    const tiny = { left: 0, top: 0, width: 3, height: 3 };
    expect(clientToPixel(2.99, 2.99, tiny, { width: 1000, height: 1000 })).toEqual({
      x: 996,
      y: 996,
    });
  });
});

describe("pixelCenter", () => {
  test("is the center of the pixel in the rectangle's coordinates", () => {
    expect(pixelCenter(0, 0, rect, size)).toEqual({ left: 105, top: 55 });
    expect(pixelCenter(19, 9, rect, size)).toEqual({ left: 295, top: 145 });
  });

  test("round-trips with clientToPixel", () => {
    const center = pixelCenter(7, 3, rect, size);
    expect(clientToPixel(center.left, center.top, rect, size)).toEqual({ x: 7, y: 3 });
  });
});

test("the magnifier window is 11 pixels centered on the pixel", () => {
  expect(magnifierWindow(10, 20)).toEqual({ sx: 5, sy: 15, size: 11 });
  expect(magnifierWindow(0, 0)).toEqual({ sx: -5, sy: -5, size: 11 });
});

describe("displayScale", () => {
  test("a fixed zoom is the scale", () => {
    expect(displayScale(2, { width: 10, height: 10 }, { width: 100, height: 100 })).toBe(2);
  });

  test("fit uses the limiting axis", () => {
    expect(displayScale("fit", { width: 500, height: 200 }, { width: 1000, height: 1000 })).toBe(
      0.2,
    );
  });

  test("fit falls back to 1 for empty sizes", () => {
    expect(displayScale("fit", { width: 0, height: 0 }, { width: 10, height: 10 })).toBe(1);
  });
});

describe("floatingPosition", () => {
  const box = { width: 100, height: 100 };
  const viewport = { width: 800, height: 600 };

  test("sits down and right of the cursor", () => {
    expect(floatingPosition(10, 10, box, viewport)).toEqual({ left: 30, top: 30 });
  });

  test("flips at the right and bottom edges", () => {
    expect(floatingPosition(790, 590, box, viewport)).toEqual({ left: 670, top: 470 });
  });

  test("never goes negative", () => {
    expect(floatingPosition(0, 0, { width: 900, height: 700 }, viewport)).toEqual({
      left: 0,
      top: 0,
    });
  });
});
