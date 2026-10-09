import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import type { ResolvedLimits } from "@/core/validate.js";
import { readImageFile } from "@/node/file.js";

// Pass-through spies: the real functions run, and the tests can count calls or inject one result.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    stat: vi.fn(actual.stat),
  };
});

const limits: ResolvedLimits = { maxBytes: 1024, maxPixels: 1_000_000 };
const canChmod = process.platform !== "win32" && process.getuid?.() !== 0;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "color-extractor-file-"));
  vi.mocked(readFile).mockClear();
  vi.mocked(stat).mockClear();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeBytes(name: string, bytes: Uint8Array): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

describe("readImageFile", () => {
  test("returns the exact bytes of the file", async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
    const path = await writeBytes("sample.png", bytes);
    const result = await readImageFile(path, limits, undefined);
    expect(Array.from(result)).toEqual(Array.from(bytes));
  });

  test("rejects a missing file with READ_FAILED, the errno code as cause, and no path", async () => {
    const path = join(dir, "missing-name.png");
    const error = await readImageFile(path, limits, undefined).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ColorExtractorError);
    expect(error).toMatchObject({ code: "READ_FAILED" });
    expect((error as ColorExtractorError).message).toBe("Could not read the image file (ENOENT).");
    expect((error as ColorExtractorError).message).not.toContain(dir);
    expect((error as ColorExtractorError).cause).toMatchObject({ code: "ENOENT" });
  });

  test("rejects a directory with READ_FAILED", async () => {
    const subdirectory = join(dir, "folder");
    await mkdir(subdirectory);
    await expect(readImageFile(subdirectory, limits, undefined)).rejects.toMatchObject({
      code: "READ_FAILED",
      message: "The path does not point to a regular file.",
    });
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  test("reads a file of exactly maxBytes", async () => {
    const path = await writeBytes("exact.bin", new Uint8Array(limits.maxBytes).fill(7));
    const result = await readImageFile(path, limits, undefined);
    expect(result.byteLength).toBe(limits.maxBytes);
    expect(vi.mocked(readFile)).toHaveBeenCalledTimes(1);
  });

  test("rejects a file of maxBytes + 1 with INPUT_TOO_LARGE before reading it", async () => {
    const path = await writeBytes("too-big.bin", new Uint8Array(limits.maxBytes + 1));
    await expect(readImageFile(path, limits, undefined)).rejects.toMatchObject({
      code: "INPUT_TOO_LARGE",
    });
    expect(vi.mocked(stat)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  test.skipIf(!canChmod)(
    "rejects an unreadable file with READ_FAILED (skipped as root or on Windows)",
    async () => {
      const path = await writeBytes("locked.png", Uint8Array.from([1, 2, 3]));
      await chmod(path, 0o000);
      try {
        await expect(readImageFile(path, limits, undefined)).rejects.toMatchObject({
          code: "READ_FAILED",
          cause: { code: "EACCES" },
        });
      } finally {
        await chmod(path, 0o600);
      }
    },
  );

  test("rejects at once with ABORTED, using the reason as cause, when the signal is already aborted", async () => {
    const path = await writeBytes("ready.png", Uint8Array.from([1]));
    const controller = new AbortController();
    controller.abort("stop");
    const error = await readImageFile(path, limits, controller.signal).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "ABORTED", cause: "stop" });
    expect(vi.mocked(stat)).not.toHaveBeenCalled();
  });

  test("rejects with ABORTED, using the reason as cause, when the abort comes before stat settles", async () => {
    const path = await writeBytes("slow.png", Uint8Array.from([1]));
    vi.mocked(stat).mockImplementationOnce(() => new Promise<never>(() => {}));
    const controller = new AbortController();
    const reading = readImageFile(path, limits, controller.signal);
    controller.abort("too slow");
    await expect(reading).rejects.toMatchObject({ code: "ABORTED", cause: "too slow" });
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  test("rejects with ABORTED when the abort interrupts readFile", async () => {
    const path = await writeBytes("interrupted.png", Uint8Array.from([1, 2]));
    const controller = new AbortController();
    vi.mocked(readFile).mockImplementationOnce(async () => {
      controller.abort("cancelled");
      throw new Error("The operation was aborted");
    });
    await expect(readImageFile(path, limits, controller.signal)).rejects.toMatchObject({
      code: "ABORTED",
      cause: "cancelled",
    });
  });

  test("checks the size again after reading, when the file grew after stat", async () => {
    const path = await writeBytes("growing.bin", new Uint8Array(limits.maxBytes));
    vi.mocked(readFile).mockImplementationOnce(async () => {
      return Buffer.alloc(limits.maxBytes + 1);
    });
    await expect(readImageFile(path, limits, undefined)).rejects.toMatchObject({
      code: "INPUT_TOO_LARGE",
    });
  });
});
