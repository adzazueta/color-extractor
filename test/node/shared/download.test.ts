import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ColorExtractorError } from "@/core/errors.js";
import type { ResolvedLimits } from "@/core/validate.js";
import { downloadImage, type DownloadOptions } from "@/shared/download.js";
import { encodeTestImage } from "../../support/images.js";
import { startTestImageServer, type TestImageServer } from "../../support/image-server.js";

const LIMITS: ResolvedLimits = { maxBytes: 1024 * 1024, maxPixels: 100_000_000 };
const MIB = 1024 * 1024;

let server: TestImageServer;
beforeAll(async () => {
  server = await startTestImageServer({ cors: false });
});
afterAll(async () => {
  await server.close();
});

function url(path: string): URL {
  return new URL(`/__test-images__/${path}`, server.origin);
}

function download(path: string, options: Partial<DownloadOptions> = {}): Promise<Uint8Array> {
  return downloadImage(url(path), { limits: LIMITS, ...options });
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

function streamOf(...chunks: unknown[]): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe("successful downloads", () => {
  test("returns the exact bytes, with and without chunking", async () => {
    const expected = await encodeTestImage("blocks.png");
    expect(await download("blocks.png")).toEqual(expected);
    expect(await download("blocks.png?chunked=1")).toEqual(expected);
  });

  test("exactly maxBytes passes, with and without content-length", async () => {
    const limits = { ...LIMITS, maxBytes: 5000 };
    expect((await download("filler?bytes=5000", { limits })).byteLength).toBe(5000);
    expect((await download("filler?bytes=5000&chunked=1", { limits })).byteLength).toBe(5000);
  });

  test("an empty body gives empty bytes", async () => {
    expect((await download("filler?bytes=0")).byteLength).toBe(0);
    const empty = await downloadImage(url("x"), {
      limits: LIMITS,
      fetch: async () => new Response(null, { status: 200 }),
    });
    expect(empty.byteLength).toBe(0);
  });

  test("a single chunk is returned as is", async () => {
    const chunk = new Uint8Array([1, 2, 3]);
    const bytes = await downloadImage(url("x"), {
      limits: LIMITS,
      fetch: async () => new Response(streamOf(chunk)),
    });
    expect(bytes).toBe(chunk);
  });
});

describe("HTTP failures", () => {
  test.each([404, 500])("status %i sets status", async (status) => {
    const error = await failure(download(`blocks.png?status=${status}`));
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.status).toBe(status);
    expect(error.message).toBe(`The server responded with HTTP status ${status}.`);
  });

  test("an opaque response has no status", async () => {
    const error = await failure(
      downloadImage(url("x"), {
        limits: LIMITS,
        fetch: async () => ({ ok: false, status: 0, headers: new Headers(), body: null }) as never,
      }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.status).toBeUndefined();
    expect(error.message).toBe("The response is opaque and cannot be read.");
  });

  test("a refused connection has a cause, no status, and no CORS text", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const error = await failure(
      downloadImage(new URL(`http://127.0.0.1:${port}/x.png`), { limits: LIMITS }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.status).toBeUndefined();
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).toBe(`Could not download the image from http://127.0.0.1:${port}.`);
    expect(error.message).not.toMatch(/CORS/);
  });

  test("the message never echoes the path, query, or credentials", async () => {
    const error = await failure(
      downloadImage(new URL("http://user:secret@127.0.0.1:1/private?token=abc"), {
        limits: LIMITS,
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    );
    expect(error.message).toBe("Could not download the image from http://127.0.0.1:1.");
  });
});

describe("byte limit", () => {
  test("content-length over the limit fails before the body arrives", async () => {
    const started = Date.now();
    const error = await failure(download(`filler?bytes=${10 * MIB}`));
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("a chunked body over the limit is aborted", async () => {
    const error = await failure(download(`filler?bytes=${2 * MIB}&chunked=1`));
    expect(error.code).toBe("INPUT_TOO_LARGE");
    expect(error.message).toBe(`The download exceeded the limit of ${MIB} bytes.`);
  });

  test("the running count cancels the stream", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600));
      },
      cancel,
    });
    const error = await failure(
      downloadImage(url("x"), {
        limits: { ...LIMITS, maxBytes: 1000 },
        fetch: async () => new Response(stream),
      }),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  test("content-length is ignored when the body is encoded", async () => {
    const bytes = await downloadImage(url("x"), {
      limits: { ...LIMITS, maxBytes: 10 },
      fetch: async () =>
        new Response(new Uint8Array(5), {
          headers: { "content-length": "5000", "content-encoding": "gzip" },
        }),
    });
    expect(bytes.byteLength).toBe(5);
  });

  test("content-length over the limit cancels the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const error = await failure(
      downloadImage(url("x"), {
        limits: { ...LIMITS, maxBytes: 10 },
        fetch: async () => new Response(body, { headers: { "content-length": "11" } }),
      }),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  test("a response with only arrayBuffer() is checked after reading", async () => {
    const fake = (size: number) => async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => new ArrayBuffer(size),
      }) as never;
    const limits = { ...LIMITS, maxBytes: 100 };
    expect((await downloadImage(url("x"), { limits, fetch: fake(100) })).byteLength).toBe(100);
    const error = await failure(downloadImage(url("x"), { limits, fetch: fake(101) }));
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });
});

describe("abort", () => {
  test("a pre-aborted signal never calls fetch", async () => {
    const fetch = vi.fn();
    const controller = new AbortController();
    controller.abort("stop");
    const error = await failure(download("blocks.png", { signal: controller.signal, fetch }));
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("stop");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("aborting during a stalled body gives ABORTED with the reason", async () => {
    const controller = new AbortController();
    const pending = download("filler?bytes=100000&stall=1", { signal: controller.signal });
    setTimeout(() => controller.abort("enough"), 100);
    const error = await failure(pending);
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("enough");
  });

  test("aborting before the headers arrive gives ABORTED", async () => {
    const controller = new AbortController();
    const pending = download("blocks.png?delay=1000", { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    expect((await failure(pending)).code).toBe("ABORTED");
  });

  test("a timeout signal gives ABORTED with a TimeoutError cause", async () => {
    const error = await failure(
      download("blocks.png?delay=5000", { signal: AbortSignal.timeout(50) }),
    );
    expect(error.code).toBe("ABORTED");
    expect((error.cause as Error).name).toBe("TimeoutError");
  });
});

describe("custom fetch", () => {
  test("receives href and signal", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([7])));
    const controller = new AbortController();
    const target = new URL("https://example.com/a.png?x=1");
    await downloadImage(target, { limits: LIMITS, signal: controller.signal, fetch });
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.png?x=1", {
      signal: controller.signal,
    });
  });

  test("passes no signal when there is none", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([7])));
    await downloadImage(new URL("https://example.com/a.png"), { limits: LIMITS, fetch });
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.png", {});
  });

  test("one that ignores the signal still aborts promptly", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const late = new Response(new ReadableStream({ cancel }));
    const pending = downloadImage(url("x"), {
      limits: LIMITS,
      signal: controller.signal,
      fetch: () => new Promise<Response>((resolve) => setTimeout(() => resolve(late), 200)),
    });
    setTimeout(() => controller.abort("now"), 20);
    const started = Date.now();
    const error = await failure(pending);
    expect(Date.now() - started).toBeLessThan(150);
    expect(error.code).toBe("ABORTED");
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  test("a rejection after the signal aborted is ABORTED, not FETCH_FAILED", async () => {
    const controller = new AbortController();
    const error = await failure(
      downloadImage(url("x"), {
        limits: LIMITS,
        signal: controller.signal,
        fetch: async () => {
          controller.abort(new Error("reason"));
          throw new DOMException("aborted", "AbortError");
        },
      }),
    );
    expect(error.code).toBe("ABORTED");
  });

  test("a non-Response gives FETCH_FAILED", async () => {
    const error = await failure(
      downloadImage(url("x"), { limits: LIMITS, fetch: (async () => ({})) as never }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.message).toBe("The fetch implementation did not return a Response.");
  });

  test("a synchronous throw gives FETCH_FAILED with the cause", async () => {
    const boom = new Error("boom");
    const error = await failure(
      downloadImage(url("x"), {
        limits: LIMITS,
        fetch: () => {
          throw boom;
        },
      }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.cause).toBe(boom);
  });

  test("a chunk that is not a Uint8Array gives FETCH_FAILED", async () => {
    const error = await failure(
      downloadImage(url("x"), {
        limits: LIMITS,
        fetch: async () =>
          ({ ok: true, status: 200, headers: new Headers(), body: streamOf("text") }) as never,
      }),
    );
    expect(error.code).toBe("FETCH_FAILED");
  });

  test("a read error gives FETCH_FAILED with the cause", async () => {
    const boom = new Error("reset");
    const body = new ReadableStream({
      start(controller) {
        controller.error(boom);
      },
    });
    const error = await failure(
      downloadImage(url("x"), {
        limits: LIMITS,
        fetch: async () => ({ ok: true, status: 200, headers: new Headers(), body }) as never,
      }),
    );
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.message).toBe("The download was interrupted.");
    expect(error.cause).toBe(boom);
  });

  test("a missing fetch gives FETCH_FAILED", async () => {
    vi.stubGlobal("fetch", undefined);
    try {
      const error = await failure(downloadImage(url("x"), { limits: LIMITS }));
      expect(error.code).toBe("FETCH_FAILED");
      expect(error.message).toBe("No fetch implementation is available. Pass the fetch option.");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("pageOrigin", () => {
  const failing = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  test("a different origin adds the CORS hint to network failures", async () => {
    const error = await failure(
      downloadImage(new URL("https://img.example/a.png"), {
        limits: LIMITS,
        fetch: failing,
        pageOrigin: "https://page.example",
      }),
    );
    expect(error.message).toMatch(/^Could not download the image from https:\/\/img\.example\./);
    expect(error.message).toMatch(/CORS/);
  });

  test("the same origin, or no origin, adds no hint", async () => {
    for (const pageOrigin of ["https://img.example", undefined]) {
      const error = await failure(
        downloadImage(new URL("https://img.example/a.png"), {
          limits: LIMITS,
          fetch: failing,
          pageOrigin,
        }),
      );
      expect(error.message).not.toMatch(/CORS/);
    }
  });

  test("a different port counts as another origin", async () => {
    const error = await failure(
      downloadImage(new URL("http://localhost:4000/a.png"), {
        limits: LIMITS,
        fetch: failing,
        pageOrigin: "http://localhost:3000",
      }),
    );
    expect(error.message).toMatch(/CORS/);
  });

  test("HTTP errors do not get the hint", async () => {
    const error = await failure(
      downloadImage(url("blocks.png?status=404"), {
        limits: LIMITS,
        pageOrigin: "https://page.example",
      }),
    );
    expect(error.status).toBe(404);
    expect(error.message).not.toMatch(/CORS/);
  });
});
