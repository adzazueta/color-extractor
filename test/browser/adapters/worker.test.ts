/// <reference lib="dom" />
import { describe, expect, test } from "vite-plus/test";
import { extractColors } from "@/browser/index.js";
import type { ExtractionResult } from "@/core/types.js";
import { BASE, fixture } from "./helpers.js";

type Reply = { ok: true; result: ExtractionResult } | { ok: false; code?: string; message: string };

function askWorker(request: unknown): Promise<Reply> {
  const worker = new Worker(new URL("./extract.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Reply>((resolve, reject) => {
    worker.addEventListener("message", (event: MessageEvent<Reply>) => {
      worker.terminate();
      resolve(event.data);
    });
    worker.addEventListener("error", (event) => {
      worker.terminate();
      reject(new Error(`worker error: ${event.message}`));
    });
    worker.postMessage(request);
  });
}

describe("a module worker", () => {
  test("returns the same result as the main thread for bytes, a Blob, and a relative URL", async () => {
    const bytes = await fixture("blocks.png");
    const expected = await extractColors(bytes);
    const replies = await Promise.all([
      askWorker({ kind: "bytes", bytes }),
      askWorker({ kind: "blob", blob: new Blob([bytes]) }),
      // A worker resolves relative strings against its own base URL (the worker script's URL).
      askWorker({ kind: "url", url: `${location.origin}${BASE}blocks.png` }),
    ]);
    for (const reply of replies) {
      expect(reply.ok).toBe(true);
      if (reply.ok) expect(reply.result).toEqual(expected);
    }
  });

  test("reports errors with the same codes", async () => {
    const reply = await askWorker({ kind: "bytes", bytes: await fixture("garbage.bin") });
    expect(reply).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
  });
});
