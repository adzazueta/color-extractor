import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/node/index.js";
import { encodeTestImage } from "../../support/images.js";
import { startTestImageServer, type TestImageServer } from "../../support/image-server.js";
import { blocks } from "../../support/pixels.js";
import { rejection } from "./helpers.js";

let directory: string;
let server: TestImageServer;
let bytes: Uint8Array;
const url = (route: string) => `${server.origin}/__test-images__/${route}`;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "color-extractor-adapters-limits-"));
  server = await startTestImageServer({ cors: false });
  bytes = await encodeTestImage("blocks.png");
  await writeFile(join(directory, "blocks.png"), bytes);
  await writeFile(join(directory, "empty.bin"), new Uint8Array(0));
  await writeFile(join(directory, "garbage.bin"), await encodeTestImage("garbage.bin"));
});

afterAll(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

describe("limits", () => {
  test("maxBytes rejects every encoded kind", async () => {
    const limits = { maxBytes: bytes.length - 1 };
    const inputs = [
      join(directory, "blocks.png"),
      Buffer.from(bytes),
      new Uint8Array(bytes),
      bytes.slice().buffer,
      url("blocks.png"),
      new URL(url("blocks.png")),
      url("blocks.png?chunked=1"),
    ];
    for (const input of inputs) {
      const error = await rejection(extractColors(input, { limits }));
      expect(error.code).toBe("INPUT_TOO_LARGE");
    }
  });

  test("maxBytes accepts an input of exactly that size", async () => {
    const result = await extractColors(Buffer.from(bytes), { limits: { maxBytes: bytes.length } });
    expect(result.colors.length).toBeGreaterThan(0);
  });

  test("a download over maxBytes with no content-length is INPUT_TOO_LARGE", async () => {
    const error = await rejection(
      extractColors(url("filler?bytes=5000&chunked=1"), { limits: { maxBytes: 1000 } }),
    );
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });

  test("maxPixels rejects pixels, and the same limit applies to encoded images", async () => {
    const limits = { maxPixels: 64 * 48 - 1 };
    expect((await rejection(extractColors(blocks(), { limits }))).code).toBe("INPUT_TOO_LARGE");
    expect((await rejection(extractColors(Buffer.from(bytes), { limits }))).code).toBe(
      "INPUT_TOO_LARGE",
    );
    await expect(
      extractColors(blocks(), { limits: { maxPixels: 64 * 48 } }),
    ).resolves.toBeDefined();
  });

  test("a header that claims a huge image is INPUT_TOO_LARGE before decoding", async () => {
    const error = await rejection(extractColors(await encodeTestImage("large-header.png")));
    expect(error.code).toBe("INPUT_TOO_LARGE");
  });
});

describe("errors", () => {
  test("READ_FAILED for a missing path", async () => {
    const error = await rejection(extractColors(join(directory, "missing.png")));
    expect(error.code).toBe("READ_FAILED");
  });

  test("READ_FAILED for a directory", async () => {
    const error = await rejection(extractColors(directory));
    expect(error.code).toBe("READ_FAILED");
  });

  test("FETCH_FAILED with the HTTP status", async () => {
    for (const status of [404, 500]) {
      const error = await rejection(extractColors(url(`blocks.png?status=${status}`)));
      expect(error.code).toBe("FETCH_FAILED");
      expect(error.status).toBe(status);
    }
  });

  test("FETCH_FAILED when nothing listens", async () => {
    const closed = await startTestImageServer({ cors: false });
    const origin = closed.origin;
    await closed.close();
    const error = await rejection(extractColors(`${origin}/__test-images__/blocks.png`));
    expect(error.code).toBe("FETCH_FAILED");
  });

  test("UNSUPPORTED_FORMAT for unknown signatures, from every kind", async () => {
    const garbage = await encodeTestImage("garbage.bin");
    for (const input of [
      garbage,
      Buffer.from(garbage),
      garbage.slice().buffer,
      join(directory, "garbage.bin"),
      url("garbage.bin"),
    ]) {
      expect((await rejection(extractColors(input))).code).toBe("UNSUPPORTED_FORMAT");
    }
  });

  test("empty bytes are INVALID_INPUT, and an empty file or download is DECODE_FAILED", async () => {
    expect((await rejection(extractColors(new Uint8Array(0)))).code).toBe("INVALID_INPUT");
    expect((await rejection(extractColors(join(directory, "empty.bin")))).code).toBe(
      "DECODE_FAILED",
    );
    expect((await rejection(extractColors(url("empty.bin")))).code).toBe("DECODE_FAILED");
  });

  test("DECODE_FAILED for damaged data", async () => {
    for (const name of ["truncated.jpg", "corrupt.png"] as const) {
      const error = await rejection(extractColors(await encodeTestImage(name)));
      expect(error.code).toBe("DECODE_FAILED");
      expect(error.cause).toBeDefined();
    }
  });

  test("INVALID_OPTIONS and INVALID_INPUT surface from the public entry", async () => {
    expect((await rejection(extractColors(bytes, { count: 17 }))).code).toBe("INVALID_OPTIONS");
    expect((await rejection(extractColors(42 as never))).code).toBe("INVALID_INPUT");
  });
});
