import { describe, expect, test, vi } from "vite-plus/test";
import pkg from "../../../package.json" with { type: "json" };
import { ColorExtractorError } from "@/core/errors.js";
import { createSharpLoader, loadSharp } from "@/node/sharp.js";

const NOT_INSTALLED =
  'Decoding images in Node.js needs the optional package "sharp" (^0.35.0), which is not installed. Install it next to @adzazueta/color-extractor with "npm install sharp", "pnpm add sharp", or "yarn add sharp". Raw pixels ({ data, width, height }) work without it.';

const COULD_NOT_LOAD =
  'The optional package "sharp" is installed but could not be loaded (see the cause). Reinstall it for this platform with "npm install sharp", "pnpm add sharp", or "yarn add sharp"; see https://sharp.pixelplumbing.com/install.';

function moduleError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function fakeSharp(): () => void {
  return () => {};
}

async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

describe("loadSharp", () => {
  test("loads the installed sharp", async () => {
    const sharp = await loadSharp();
    expect(sharp).toBe((await import("sharp")).default);
    expect(await loadSharp()).toBe(sharp);
  });

  test("the not-installed message names the peer range from package.json", async () => {
    const cause = moduleError("ERR_MODULE_NOT_FOUND", "Cannot find package 'sharp'");
    const error = await rejection(createSharpLoader(() => Promise.reject(cause))());
    expect(error.message).toContain(`"sharp" (${pkg.peerDependencies.sharp})`);
  });
});

describe("createSharpLoader", () => {
  test.each([
    [
      "ERR_MODULE_NOT_FOUND",
      "Cannot find package 'sharp' imported from /app/node_modules/@adzazueta/color-extractor/dist/node.js",
    ],
    ["MODULE_NOT_FOUND", "Cannot find module 'sharp'\nRequire stack:\n- /app/index.cjs"],
  ])("%s for sharp itself gives the not-installed message", async (code, message) => {
    const cause = moduleError(code, message);
    const error = await rejection(createSharpLoader(() => Promise.reject(cause))());
    expect(error.code).toBe("DECODER_MISSING");
    expect(error.message).toBe(NOT_INSTALLED);
    expect(error.message).toContain('"npm install sharp"');
    expect(error.message).toContain('"pnpm add sharp"');
    expect(error.message).toContain('"yarn add sharp"');
    expect(error.cause).toBe(cause);
  });

  test.each([
    [
      "a missing dependency of sharp",
      moduleError(
        "ERR_MODULE_NOT_FOUND",
        "Cannot find package '@img/sharp-darwin-arm64' imported from /app/node_modules/sharp/dist/sharp.mjs",
      ),
    ],
    [
      "a missing file inside sharp",
      moduleError(
        "ERR_MODULE_NOT_FOUND",
        "Cannot find module '/app/node_modules/sharp/dist/index.mjs' imported from /app/index.js",
      ),
    ],
    [
      "a binary for another platform",
      new Error('Could not load the "sharp" module using the linux-x64 runtime'),
    ],
    ["a code without a message", Object.assign(Object.create(null), { code: "MODULE_NOT_FOUND" })],
    ["a non-Error reason", "boom"],
  ])("%s gives the could-not-load message", async (_label, cause) => {
    const error = await rejection(createSharpLoader(() => Promise.reject(cause))());
    expect(error.code).toBe("DECODER_MISSING");
    expect(error.message).toBe(COULD_NOT_LOAD);
    expect(error.cause).toBe(cause);
  });

  test("a synchronous throw from the import gives DECODER_MISSING", async () => {
    const cause = new Error("sync");
    const error = await rejection(
      createSharpLoader(() => {
        throw cause;
      })(),
    );
    expect(error).toMatchObject({ code: "DECODER_MISSING", message: COULD_NOT_LOAD, cause });
  });

  test.each([
    ["no default export", {}],
    ["a non-function default export", { default: { sharp: true } }],
    ["a null module", null],
    ["a function module without default", fakeSharp()],
  ])("%s gives DECODER_MISSING with a TypeError cause", async (_label, module) => {
    const error = await rejection(createSharpLoader(() => Promise.resolve(module))());
    expect(error.code).toBe("DECODER_MISSING");
    expect(error.message).toBe(COULD_NOT_LOAD);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  test("memoizes a successful load", async () => {
    const sharp = fakeSharp();
    const importSharp = vi.fn(() => Promise.resolve({ default: sharp }));
    const load = createSharpLoader(importSharp);
    const [first, second] = await Promise.all([load(), load()]);
    expect(first).toBe(sharp);
    expect(second).toBe(sharp);
    expect(await load()).toBe(sharp);
    expect(importSharp).toHaveBeenCalledOnce();
  });

  test("retries after a failure", async () => {
    const sharp = fakeSharp();
    const importSharp = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(moduleError("ERR_MODULE_NOT_FOUND", "Cannot find package 'sharp'"))
      .mockResolvedValue({ default: sharp });
    const load = createSharpLoader(importSharp);
    await expect(load()).rejects.toMatchObject({ code: "DECODER_MISSING" });
    expect(await load()).toBe(sharp);
    expect(await load()).toBe(sharp);
    expect(importSharp).toHaveBeenCalledTimes(2);
  });
});
