import type { Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { ColorExtractorError } from "@/core/errors.js";
import { checkByteLimit, type ResolvedLimits } from "@/core/validate.js";
import { abortedError, raceAbort, throwIfAborted } from "@/shared/abort.js";

/** Returns the errno code of a system error, such as `ENOENT`, or `unknown` for anything else. */
function errnoCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string") {
      return code;
    }
  }
  return "unknown";
}

/** Builds the `READ_FAILED` error. The message names the errno code only, never the path. */
function readFailed(error: unknown): ColorExtractorError {
  return new ColorExtractorError(
    "READ_FAILED",
    `Could not read the image file (${errnoCode(error)}).`,
    { cause: error },
  );
}

/**
 * Reads an image file. The byte limit is checked from `stat` before reading, and again after.
 *
 * @param path - The file path. Relative paths resolve against `process.cwd()`.
 * @param limits - The resolved limits; only `maxBytes` applies here.
 * @param signal - The caller's signal, if any.
 * @returns The file's bytes.
 * @throws ColorExtractorError with code `READ_FAILED`, `INPUT_TOO_LARGE`, or `ABORTED`.
 */
export async function readImageFile(
  path: string,
  limits: ResolvedLimits,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  throwIfAborted(signal);

  let stats: Stats;
  try {
    stats = await raceAbort(stat(path), signal);
  } catch (error) {
    if (error instanceof ColorExtractorError) {
      throw error;
    }
    throw readFailed(error);
  }
  if (!stats.isFile()) {
    throw new ColorExtractorError("READ_FAILED", "The path does not point to a regular file.");
  }
  checkByteLimit(stats.size, limits);

  let buffer: Buffer;
  try {
    buffer = await readFile(path, { signal });
  } catch (error) {
    if (signal?.aborted === true) {
      throw abortedError(signal);
    }
    throw readFailed(error);
  }
  checkByteLimit(buffer.byteLength, limits);
  return buffer;
}
