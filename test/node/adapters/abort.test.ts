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
  directory = await mkdtemp(join(tmpdir(), "color-extractor-adapters-abort-"));
  server = await startTestImageServer({ cors: false });
  bytes = await encodeTestImage("blocks.png");
  await writeFile(join(directory, "blocks.png"), bytes);
});

afterAll(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

describe("abort", () => {
  test("before the call, for every input kind", async () => {
    const reason = new Error("stop");
    const signal = AbortSignal.abort(reason);
    const inputs = [
      blocks(),
      Buffer.from(bytes),
      bytes.slice().buffer,
      join(directory, "blocks.png"),
      url("blocks.png"),
      new URL(url("blocks.png")),
    ];
    for (const input of inputs) {
      const error = await rejection(extractColors(input, { signal }));
      expect(error.code).toBe("ABORTED");
      expect(error.cause).toBe(reason);
    }
  });

  test("mid-download, while the body stalls", async () => {
    const controller = new AbortController();
    const pending = extractColors(url("blocks.png?stall=1"), { signal: controller.signal });
    const settled = rejection(pending);
    // The stalled body never completes, so the only way out is the signal.
    setTimeout(() => controller.abort("enough"), 100);
    const error = await settled;
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("enough");
  });

  test("before the headers arrive", async () => {
    const controller = new AbortController();
    const settled = rejection(
      extractColors(url("blocks.png?delay=3000"), { signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 50);
    expect((await settled).code).toBe("ABORTED");
  });

  test("mid-decode: aborting right after the call starts", async () => {
    for (const input of [Buffer.from(bytes), join(directory, "blocks.png")]) {
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
      extractColors(url("blocks.png?delay=3000"), { signal: AbortSignal.timeout(50) }),
    );
    expect(error.code).toBe("ABORTED");
    expect((error.cause as { name?: string } | undefined)?.name).toBe("TimeoutError");
  });

  test("an unaborted signal does not interfere", async () => {
    const controller = new AbortController();
    const result = await extractColors(Buffer.from(bytes), { signal: controller.signal });
    expect(result.colors.length).toBeGreaterThan(0);
  });
});
