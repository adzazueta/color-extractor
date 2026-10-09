import { afterAll, describe, expect, test, vi } from "vite-plus/test";
import type { ColorExtractorError } from "@/core/errors.js";
import { encodeTestImage } from "../../support/images.js";
import { blocks } from "../../support/pixels.js";

// The mock must not leak, so this test lives in its own file. src/node/decode.ts imports the loader
// as "./sharp.js", which resolves to the same module id as "@/node/sharp.js".
// The error class comes from the fresh module graph, as in a real failure, so instanceof checks hold.
const loadSharp = vi.fn(async () => {
  const { ColorExtractorError } = await import("@/core/errors.js");
  throw new ColorExtractorError("DECODER_MISSING", "mocked: sharp is not installed.");
});

describe("DECODER_MISSING", () => {
  afterAll(() => {
    vi.doUnmock("@/node/sharp.js");
    vi.resetModules();
  });

  test("encoded inputs fail with DECODER_MISSING when sharp cannot load, but pixels still work", async () => {
    vi.resetModules();
    vi.doMock("@/node/sharp.js", () => ({ loadSharp }));
    const entry = await import("@/node/index.js");
    const bytes = await encodeTestImage("blocks.png");
    const error: unknown = await entry.extractColors(bytes).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(loadSharp).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(entry.ColorExtractorError);
    expect((error as ColorExtractorError).code).toBe("DECODER_MISSING");
    expect((error as ColorExtractorError).message).toContain("mocked");
    const pixels = await entry.extractColors(blocks());
    expect(pixels).toEqual(entry.extractColorsFromPixels(blocks()));
  });
});
