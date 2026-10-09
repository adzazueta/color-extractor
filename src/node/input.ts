import { ColorExtractorError } from "@/core/errors.js";
import { validatePixels } from "@/core/validate.js";
import { asBytes, requireNonEmpty, typeTag, type ClassifiedInput } from "@/shared/input.js";
import { isHttpUrlString, parseHttpUrl } from "@/shared/url.js";

function invalidInput(message: string): ColorExtractorError {
  return new ColorExtractorError("INVALID_INPUT", message);
}

/**
 * Decides what a Node input is. The messages never echo the value.
 *
 * @param input - The value passed to `extractColors`.
 * @returns The classified input.
 * @throws ColorExtractorError with code `INVALID_INPUT`.
 */
export function classifyNodeInput(input: unknown): ClassifiedInput {
  if (typeof input === "string") {
    if (input.length === 0) {
      throw invalidInput("Input string is empty.");
    }
    if (isHttpUrlString(input)) {
      return { kind: "url", url: parseHttpUrl(input) };
    }
    if (input.includes("\0")) {
      throw invalidInput("Input file path contains a NUL character.");
    }
    return { kind: "path", path: input };
  }
  const tag = typeTag(input);
  if (tag === "[object URL]") {
    return { kind: "url", url: parseHttpUrl(input as URL) };
  }
  const bytes = asBytes(input);
  if (bytes !== undefined) {
    requireNonEmpty(bytes.byteLength);
    return { kind: "bytes", bytes };
  }
  if (tag === "[object Blob]" || tag === "[object File]") {
    throw invalidInput("Blob inputs are only supported in the browser.");
  }
  if (typeof input === "object" && input !== null) {
    return { kind: "pixels", pixels: validatePixels(input) };
  }
  throw invalidInput(
    `Input must be pixels, bytes, a file path, or an http(s) URL, received ${input === null ? "null" : `type ${typeof input}`}.`,
  );
}
