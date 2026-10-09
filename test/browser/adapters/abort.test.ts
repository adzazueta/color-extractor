/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/browser/index.js";
import { blocks } from "../../support/pixels.js";
import { BASE, fixture, rejection } from "./helpers.js";

describe("abort", () => {
  test("before the call, for every input kind", async () => {
    const reason = new Error("stop");
    const signal = AbortSignal.abort(reason);
    const bytes = await fixture("blocks.png");
    const inputs = [
      blocks(),
      new Blob([bytes]),
      bytes,
      bytes.buffer.slice(0),
      `${BASE}blocks.png`,
      new URL(`${BASE}blocks.png`, document.baseURI),
    ];
    for (const input of inputs) {
      const error = await rejection(extractColors(input, { signal }));
      expect(error.code).toBe("ABORTED");
      expect(error.cause).toBe(reason);
    }
  });

  test("mid-download, while the body stalls", async () => {
    const controller = new AbortController();
    const settled = rejection(
      extractColors(`${BASE}blocks.png?stall=1`, { signal: controller.signal }),
    );
    setTimeout(() => controller.abort("enough"), 150);
    const error = await settled;
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("enough");
  });

  test("before the headers arrive", async () => {
    const controller = new AbortController();
    const settled = rejection(
      extractColors(`${BASE}blocks.png?delay=3000`, { signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 50);
    expect((await settled).code).toBe("ABORTED");
  });

  test("mid-decode: aborting right after the call starts", async () => {
    const bytes = await fixture("blocks.png");
    for (const input of [bytes, new Blob([bytes])]) {
      const controller = new AbortController();
      const settled = rejection(extractColors(input, { signal: controller.signal }));
      controller.abort("mid");
      const error = await settled;
      expect(error.code).toBe("ABORTED");
      expect(error.cause).toBe("mid");
    }
  });

  test("AbortSignal.timeout during a slow response", async () => {
    const error = await rejection(
      extractColors(`${BASE}blocks.png?delay=3000`, { signal: AbortSignal.timeout(50) }),
    );
    expect(error.code).toBe("ABORTED");
  });

  test("an unaborted signal does not interfere", async () => {
    const result = await extractColors(await fixture("blocks.png"), {
      signal: new AbortController().signal,
    });
    expect(result.colors.length).toBeGreaterThan(0);
  });
});
