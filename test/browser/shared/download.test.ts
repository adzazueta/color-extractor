/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import type { ResolvedLimits } from "@/core/validate.js";
import { downloadImage } from "@/shared/download.js";
import { browserBaseUrl, resolveBrowserUrl } from "@/shared/url.js";

const BASE = "/__test-images__/";
const LIMITS: ResolvedLimits = { maxBytes: 1024 * 1024, maxPixels: 100_000_000 };

async function crossOrigin(): Promise<string> {
  const response = await fetch(`${BASE}cross-origin`);
  return ((await response.json()) as { origin: string }).origin;
}

async function failure(promise: Promise<unknown>): Promise<ColorExtractorError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError);
    return error as ColorExtractorError;
  }
  throw new Error("expected a rejection");
}

describe("downloadImage in the browser", () => {
  test("relative strings resolve against the document base", () => {
    expect(browserBaseUrl()).toBe(document.baseURI);
    expect(resolveBrowserUrl(`${BASE}blocks.png`).href).toBe(`${location.origin}${BASE}blocks.png`);
    expect(() => resolveBrowserUrl("blob:http://localhost/x")).toThrow(ColorExtractorError);
  });

  test("a same-origin fixture downloads", async () => {
    const bytes = await downloadImage(resolveBrowserUrl(`${BASE}blocks.png`), {
      limits: LIMITS,
      pageOrigin: location.origin,
    });
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  test("status 404 sets the status", async () => {
    const error = await failure(
      downloadImage(resolveBrowserUrl(`${BASE}blocks.png?status=404`), {
        limits: LIMITS,
        pageOrigin: location.origin,
      }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.status).toBe(404);
  });

  test("a body over the limit is rejected, by content-length and when chunked", async () => {
    const limits = { ...LIMITS, maxBytes: 1000 };
    for (const query of ["bytes=5000", "bytes=5000&chunked=1"]) {
      const error = await failure(
        downloadImage(resolveBrowserUrl(`${BASE}filler?${query}`), { limits }),
      );
      expect(error.code).toBe("INPUT_TOO_LARGE");
    }
  });

  test("a cross-origin server without CORS gives FETCH_FAILED with the hint", async () => {
    const origin = await crossOrigin();
    const error = await failure(
      downloadImage(new URL(`${origin}${BASE}blocks.png`), {
        limits: LIMITS,
        pageOrigin: location.origin,
      }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.status).toBeUndefined();
    expect(error.message).toMatch(/CORS/);
    expect(error.message).toContain(new URL(origin).origin);
  });

  test("with cors=1 the cross-origin download works", async () => {
    const origin = await crossOrigin();
    const bytes = await downloadImage(new URL(`${origin}${BASE}blocks.png?cors=1`), {
      limits: LIMITS,
      pageOrigin: location.origin,
    });
    expect(bytes.byteLength).toBeGreaterThan(8);
  });

  test("an abort during a stalled body gives ABORTED", async () => {
    const controller = new AbortController();
    const pending = downloadImage(resolveBrowserUrl(`${BASE}filler?bytes=100000&stall=1`), {
      limits: LIMITS,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort("stop"), 150);
    const error = await failure(pending);
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("stop");
  });

  test("a timeout signal gives ABORTED", async () => {
    const error = await failure(
      downloadImage(resolveBrowserUrl(`${BASE}blocks.png?delay=2000`), {
        limits: LIMITS,
        signal: AbortSignal.timeout(50),
      }),
    );
    expect(error.code).toBe("ABORTED");
  });
});
