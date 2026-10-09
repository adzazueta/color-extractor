import { describe, expect, it, vi } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { extractColorsFromPixels } from "@/core/index.js";
import { solidImage } from "./images.js";

// Fault injection: the k-means module is replaced for this file only (vi.mock is scoped to the
// test file's module registry), so no other test is affected. It simulates an unexpected failure
// inside the pipeline, which must surface as PROCESSING_FAILED with the original error as cause.
const injected = new Error("injected k-means failure");

vi.mock("@/core/pipeline/kmeans.js", () => ({
  runKmeans: () => {
    throw injected;
  },
}));

describe("spec 7.1: unexpected internal failures", () => {
  it("wraps a pipeline failure as PROCESSING_FAILED with the original cause", () => {
    let caught: unknown;
    try {
      extractColorsFromPixels(solidImage(4, 4, [10, 20, 30, 255]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ColorExtractorError);
    const error = caught as ColorExtractorError;
    expect(error.code).toBe("PROCESSING_FAILED");
    expect(error.cause).toBe(injected);
  });

  it("does not wrap validation errors, which happen before the pipeline", () => {
    expect(() => extractColorsFromPixels(solidImage(2, 2, [1, 2, 3, 255]), { count: 0 })).toThrow(
      expect.objectContaining({ code: "INVALID_OPTIONS" }),
    );
  });

  it("does not reach the failing stage for a fully transparent image", () => {
    const result = extractColorsFromPixels(solidImage(4, 4, [10, 20, 30, 0]));
    expect(result.colors).toEqual([]);
  });
});
