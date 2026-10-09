import { ColorExtractorError } from "@/core/errors.js";

/** The `sharp` function. Type only; the public `.d.ts` files must never reference "sharp". */
export type SharpFunction = typeof import("sharp").default;

const NOT_INSTALLED =
  'Decoding images in Node.js needs the optional package "sharp" (^0.35.0), which is not installed. ' +
  'Install it next to @adzazueta/color-extractor with "npm install sharp", "pnpm add sharp", or ' +
  '"yarn add sharp". Raw pixels ({ data, width, height }) work without it.';

const COULD_NOT_LOAD =
  'The optional package "sharp" is installed but could not be loaded (see the cause). Reinstall it ' +
  'for this platform with "npm install sharp", "pnpm add sharp", or "yarn add sharp"; see ' +
  "https://sharp.pixelplumbing.com/install.";

/** The import failed because "sharp" itself cannot be found, not one of its dependencies. */
function isNotInstalled(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
    typeof message === "string" &&
    message.includes("'sharp'")
  );
}

async function importSharpFunction(importSharp: () => Promise<unknown>): Promise<SharpFunction> {
  let module: unknown;
  try {
    module = await importSharp();
  } catch (error) {
    throw new ColorExtractorError(
      "DECODER_MISSING",
      isNotInstalled(error) ? NOT_INSTALLED : COULD_NOT_LOAD,
      { cause: error },
    );
  }
  const candidate =
    typeof module === "object" && module !== null
      ? (module as { default?: unknown }).default
      : undefined;
  if (typeof candidate !== "function") {
    throw new ColorExtractorError("DECODER_MISSING", COULD_NOT_LOAD, {
      cause: new TypeError('The module "sharp" does not export a function as its default export.'),
    });
  }
  return candidate as SharpFunction;
}

/**
 * Creates a loader for the optional `sharp` package. A successful load is memoized; a failed one
 * is retried on the next call.
 *
 * @param importSharp - Imports the `sharp` module (normally `() => import("sharp")`).
 * @returns A function that resolves to the `sharp` function.
 * @throws ColorExtractorError with code `DECODER_MISSING`, with the original error as `cause`,
 * for every failure: sharp is not installed, it cannot be loaded, or its module has no function
 * as the default export.
 */
export function createSharpLoader(
  importSharp: () => Promise<unknown>,
): () => Promise<SharpFunction> {
  let loading: Promise<SharpFunction> | undefined;
  return () => {
    loading ??= importSharpFunction(importSharp).catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
    return loading;
  };
}

/** Loads the optional `sharp` package with a dynamic import, so it stays external and optional. */
export const loadSharp: () => Promise<SharpFunction> = createSharpLoader(() => import("sharp"));
