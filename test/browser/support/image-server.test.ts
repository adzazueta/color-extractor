/// <reference lib="dom" />
import { expect, test } from "vite-plus/test";

const BASE = "/__test-images__/";

async function crossOrigin(): Promise<string> {
  const response = await fetch(`${BASE}cross-origin`);
  return ((await response.json()) as { origin: string }).origin;
}

test("same-origin images load and decode", async () => {
  const response = await fetch(`${BASE}blocks.png`);
  expect(response.ok).toBe(true);
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  const bitmap = await createImageBitmap(await response.blob());
  expect([bitmap.width, bitmap.height]).toEqual([64, 48]);
  bitmap.close();
});

test("cross-origin requests are blocked without cors=1 and allowed with it", async () => {
  const origin = await crossOrigin();
  expect(origin).not.toBe(location.origin);
  await expect(fetch(`${origin}${BASE}blocks.png`)).rejects.toBeInstanceOf(TypeError);
  const allowed = await fetch(`${origin}${BASE}blocks.png?cors=1`);
  expect(allowed.status).toBe(200);
  const bitmap = await createImageBitmap(await allowed.blob());
  expect(bitmap.width).toBe(64);
  bitmap.close();
});

test("status, filler, chunked, and delay routes", async () => {
  expect((await fetch(`${BASE}blocks.png?status=404`)).status).toBe(404);
  const filler = await fetch(`${BASE}filler?bytes=1000`);
  expect(filler.headers.get("content-length")).toBe("1000");
  expect((await filler.arrayBuffer()).byteLength).toBe(1000);
  const chunked = await fetch(`${BASE}filler?bytes=1000&chunked=1`);
  expect(chunked.headers.get("content-length")).toBeNull();
  expect((await chunked.arrayBuffer()).byteLength).toBe(1000);
  const started = performance.now();
  await fetch(`${BASE}blocks.png?delay=150`);
  expect(performance.now() - started).toBeGreaterThanOrEqual(100);
});

test("a stalled body never completes", async () => {
  const response = await fetch(`${BASE}filler?bytes=100000&stall=1`);
  expect(response.status).toBe(200);
  const outcome = await Promise.race([
    response.arrayBuffer().then(() => "completed"),
    new Promise((resolve) => setTimeout(() => resolve("stalled"), 400)),
  ]);
  expect(outcome).toBe("stalled");
  await response.body?.cancel().catch(() => {});
});
