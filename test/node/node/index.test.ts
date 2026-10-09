import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import * as browserEntry from "@/browser/index.js";
import * as coreEntry from "@/core/index.js";
import { ColorExtractorError } from "@/core/errors.js";
import type { PixelInput } from "@/core/types.js";
import * as nodeEntry from "@/node/index.js";
import { decodeImage } from "@/node/decode.js";
import { encodeTestImage } from "../../support/images.js";
import { startTestImageServer, type TestImageServer } from "../../support/image-server.js";
import { blocks, rgbaSample } from "../../support/pixels.js";

vi.mock("@/core/extract.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/extract.js")>();
  return { ...original, extractColorsFromPixels: vi.fn(original.extractColorsFromPixels) };
});

const { extractColors } = nodeEntry;
const { extractColorsFromPixels } = await import("@/core/extract.js");

const SECRET = "secret-token-xyz";

async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

async function invalid(input: unknown, message?: string): Promise<ColorExtractorError> {
  const error = await rejection(extractColors(input as never));
  expect(error.code).toBe("INVALID_INPUT");
  if (message !== undefined) expect(error.message).toBe(message);
  expect(error.message).not.toContain(SECRET);
  return error;
}

describe("exports", () => {
  test("have the same key sets in every entry", () => {
    const names = ["ColorExtractorError", "extractColors", "extractColorsFromPixels"];
    expect(Object.keys(coreEntry).sort()).toEqual(names);
    expect(Object.keys(nodeEntry).sort()).toEqual(names);
    expect(Object.keys(browserEntry).sort()).toEqual(names);
  });

  test("the entries share one error class and one pixel function", () => {
    expect(nodeEntry.ColorExtractorError).toBe(coreEntry.ColorExtractorError);
    expect(browserEntry.ColorExtractorError).toBe(coreEntry.ColorExtractorError);
    expect(nodeEntry.extractColorsFromPixels).toBe(coreEntry.extractColorsFromPixels);
    expect(nodeEntry.extractColors).not.toBe(coreEntry.extractColors);
  });
});

describe("Node classification", () => {
  test("empty and NUL strings", async () => {
    await invalid("", "Input string is empty.");
    await invalid(`a${SECRET}\0b`, "Input file path contains a NUL character.");
  });

  test("an invalid http string and non-http URL objects", async () => {
    await invalid(`http://[::1/${SECRET}`, "Input is not a valid URL.");
    await invalid(new URL(`file:///${SECRET}.png`));
    await invalid(new URL(`ftp://example.com/${SECRET}`));
  });

  test("empty bytes", async () => {
    for (const input of [new Uint8Array(0), Buffer.alloc(0), new ArrayBuffer(0)]) {
      await invalid(input, "Input data is empty.");
    }
  });

  test("Blob and File", async () => {
    const message = "Blob inputs are only supported in the browser.";
    await invalid(new Blob([new Uint8Array([1])]), message);
    await invalid(new File([new Uint8Array([1])], `${SECRET}.png`), message);
  });

  test("other objects go through the pixel validation", async () => {
    await invalid({ data: new Uint8Array(3), width: 1, height: 1, secret: SECRET });
    await invalid([1, 2, 3]);
    await invalid({});
    await invalid(new Uint8ClampedArray(4));
  });

  test("anything else", async () => {
    const message = (type: string) =>
      `Input must be pixels, bytes, a file path, or an http(s) URL, received ${type}.`;
    await invalid(undefined, message("type undefined"));
    await invalid(null, message("null"));
    await invalid(42, message("type number"));
    await invalid(true, message("type boolean"));
    await invalid(() => SECRET, message("type function"));
    await invalid(Symbol(SECRET), message("type symbol"));
  });

  test("a missing file does not echo the path", async () => {
    const error = await rejection(extractColors(`/nonexistent/${SECRET}.png`));
    expect(error.code).toBe("READ_FAILED");
    expect(error.message).not.toContain(SECRET);
  });

  test("an unknown signature is UNSUPPORTED_FORMAT", async () => {
    expect((await rejection(extractColors(new Uint8Array([1, 2, 3, 4])))).code).toBe(
      "UNSUPPORTED_FORMAT",
    );
  });
});

describe("check order", () => {
  test("invalid options win over invalid input", async () => {
    const error = await rejection(extractColors(42 as never, { count: 0 }));
    expect(error.code).toBe("INVALID_OPTIONS");
  });

  test("invalid input wins over a pre-aborted signal", async () => {
    const error = await rejection(extractColors(42 as never, { signal: AbortSignal.abort() }));
    expect(error.code).toBe("INVALID_INPUT");
  });

  test("oversized bytes win over a pre-aborted signal", async () => {
    const error = await rejection(
      extractColors(new Uint8Array(10), { signal: AbortSignal.abort(), limits: { maxBytes: 5 } }),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });

  test("oversized pixels win over a pre-aborted signal", async () => {
    const error = await rejection(
      extractColors(blocks(), { signal: AbortSignal.abort(), limits: { maxPixels: 10 } }),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });

  test("pixels ignore maxBytes", async () => {
    await expect(extractColors(blocks(), { limits: { maxBytes: 1 } })).resolves.toEqual(
      extractColorsFromPixels(blocks()),
    );
  });

  test("pre-aborted pixels, paths, and URLs reject with ABORTED and never start", async () => {
    const reason = new Error("stop");
    const signal = AbortSignal.abort(reason);
    const fetch = vi.fn();
    for (const input of [blocks(), "/nonexistent.png", "http://127.0.0.1:1/a.png"]) {
      const error = await rejection(
        extractColors(input, { signal, fetch: fetch as unknown as typeof globalThis.fetch }),
      );
      expect(error.code).toBe("ABORTED");
      expect(error.cause).toBe(reason);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("an abort while a custom fetch is pending rejects with ABORTED", async () => {
    const controller = new AbortController();
    const pending = extractColors("http://example.test/a.png", {
      signal: controller.signal,
      fetch: () => new Promise<Response>(() => undefined),
    });
    controller.abort();
    expect((await rejection(pending)).code).toBe("ABORTED");
  });
});

describe("the sync core call", () => {
  test("receives only count, mode, and limits", async () => {
    const mocked = vi.mocked(extractColorsFromPixels);
    mocked.mockClear();
    const fetch = vi.fn();
    await extractColors(blocks(), {
      count: 2,
      mode: "population",
      limits: { maxBytes: 1000, maxPixels: 100_000 },
      signal: new AbortController().signal,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(mocked).toHaveBeenCalledTimes(1);
    const options = mocked.mock.calls[0]?.[1];
    expect(Object.keys(options ?? {}).sort()).toEqual(["count", "limits", "mode"]);
    expect(options).toEqual({
      count: 2,
      mode: "population",
      limits: { maxBytes: 1000, maxPixels: 100_000 },
    });
  });
});

describe("happy paths", () => {
  let directory: string;
  let server: TestImageServer;
  let bytes: Uint8Array;
  let decoded: PixelInput;
  let expected: Awaited<ReturnType<typeof extractColors>>;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "color-extractor-index-"));
    server = await startTestImageServer({ cors: false });
    bytes = await encodeTestImage("blocks.png");
    await writeFile(join(directory, "blocks.png"), bytes);
    decoded = await decodeImage(
      bytes,
      {
        maxBytes: 33_554_432,
        maxPixels: 16_777_216,
      },
      undefined,
    );
    expected = extractColorsFromPixels(decoded);
  });

  afterAll(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  test("pixels", async () => {
    expect(await extractColors(rgbaSample())).toEqual(extractColorsFromPixels(rgbaSample()));
    expect(await extractColors(blocks())).toEqual(extractColorsFromPixels(blocks()));
  });

  test("decoded bytes match the sync core on the decoded pixels", () => {
    expect(expected.colors.length).toBeGreaterThan(0);
    expect(expected).toEqual(extractColorsFromPixels(blocks()));
  });

  test("Uint8Array, Buffer, and ArrayBuffer", async () => {
    expect(await extractColors(bytes)).toEqual(expected);
    expect(await extractColors(Buffer.from(bytes))).toEqual(expected);
    const copy = bytes.slice();
    expect(await extractColors(copy.buffer)).toEqual(expected);
    const padded = new Uint8Array(bytes.length + 10);
    padded.set(bytes, 7);
    expect(await extractColors(padded.subarray(7, 7 + bytes.length))).toEqual(expected);
  });

  test("a path to a temp file, absolute", async () => {
    expect(await extractColors(join(directory, "blocks.png"))).toEqual(expected);
  });

  test("an http URL string, in any case", async () => {
    const url = `${server.origin}/__test-images__/blocks.png`;
    expect(await extractColors(url)).toEqual(expected);
    expect(await extractColors(url.replace("http://", "HTTP://"))).toEqual(expected);
  });

  test("a URL object", async () => {
    expect(await extractColors(new URL(`${server.origin}/__test-images__/blocks.png`))).toEqual(
      expected,
    );
  });

  test("a custom fetch receives the href and the signal", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(bytes)));
    const controller = new AbortController();
    const result = await extractColors("https://example.test/cover.png?x=1", {
      fetch: fetch as unknown as typeof globalThis.fetch,
      signal: controller.signal,
    });
    expect(result).toEqual(expected);
    expect(fetch).toHaveBeenCalledWith("https://example.test/cover.png?x=1", {
      signal: controller.signal,
    });
  });

  test("download failures do not echo the URL path", async () => {
    const error = await rejection(
      extractColors(`${server.origin}/__test-images__/blocks.png?status=404&${SECRET}=1`),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.status).toBe(404);
    expect(error.message).not.toContain(SECRET);
  });

  test("limits apply to encoded inputs", async () => {
    const limits = { maxBytes: bytes.length - 1 };
    expect((await rejection(extractColors(bytes, { limits }))).code).toBe("INPUT_TOO_LARGE");
    expect((await rejection(extractColors(join(directory, "blocks.png"), { limits }))).code).toBe(
      "INPUT_TOO_LARGE",
    );
  });
});
