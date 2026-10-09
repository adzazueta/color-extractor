/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/browser/index.js";
import { blocks } from "../../support/pixels.js";
import { BASE, fixture, rejection } from "./helpers.js";

describe("limits", () => {
  test("maxBytes rejects every encoded kind", async () => {
    const bytes = await fixture("blocks.png");
    const limits = { maxBytes: bytes.length - 1 };
    const inputs = [
      new Blob([bytes]),
      new File([bytes], "a.png"),
      bytes,
      bytes.buffer.slice(0),
      `${BASE}blocks.png`,
      new URL(`${BASE}blocks.png`, document.baseURI),
      `${BASE}blocks.png?chunked=1`,
    ];
    for (const input of inputs) {
      const error = await rejection(extractColors(input, { limits }));
      expect(error.code).toBe("INPUT_TOO_LARGE");
    }
  });

  test("a download over maxBytes with no content-length is INPUT_TOO_LARGE", async () => {
    const error = await rejection(
      extractColors(`${BASE}filler?bytes=5000&chunked=1`, { limits: { maxBytes: 1000 } }),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });

  test("maxPixels rejects pixels and encoded images alike", async () => {
    const limits = { maxPixels: 64 * 48 - 1 };
    expect((await rejection(extractColors(blocks(), { limits }))).code).toBe("INPUT_TOO_LARGE");
    expect((await rejection(extractColors(await fixture("blocks.png"), { limits }))).code).toBe(
      "INPUT_TOO_LARGE",
    );
    await expect(
      extractColors(await fixture("blocks.png"), { limits: { maxPixels: 64 * 48 } }),
    ).resolves.toBeDefined();
  });
});

describe("errors", () => {
  test("FETCH_FAILED with the HTTP status", async () => {
    for (const status of [404, 500]) {
      const error = await rejection(extractColors(`${BASE}blocks.png?status=${status}`));
      expect(error.code).toBe("FETCH_FAILED");
      expect(error.status).toBe(status);
    }
  });

  test("FETCH_FAILED when nothing listens", async () => {
    const error = await rejection(extractColors("http://127.0.0.1:1/blocks.png"));
    expect(error.code).toBe("FETCH_FAILED");
  });

  test("an empty download is DECODE_FAILED, and empty data is INVALID_INPUT", async () => {
    expect((await rejection(extractColors(`${BASE}empty.bin`))).code).toBe("DECODE_FAILED");
    for (const input of [new Blob([]), new Uint8Array(0), new ArrayBuffer(0)]) {
      expect((await rejection(extractColors(input))).code).toBe("INVALID_INPUT");
    }
  });

  test("blob: and data: URLs and blank strings are INVALID_INPUT", async () => {
    const blobUrl = URL.createObjectURL(new Blob([await fixture("blocks.png")]));
    try {
      for (const input of [blobUrl, "data:image/png;base64,AAAA", " "]) {
        expect((await rejection(extractColors(input))).code).toBe("INVALID_INPUT");
      }
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  });

  test("INVALID_OPTIONS and INVALID_INPUT surface from the public entry", async () => {
    const bytes = await fixture("blocks.png");
    expect((await rejection(extractColors(bytes, { count: 17 }))).code).toBe("INVALID_OPTIONS");
    expect((await rejection(extractColors(42 as never))).code).toBe("INVALID_INPUT");
  });
});
