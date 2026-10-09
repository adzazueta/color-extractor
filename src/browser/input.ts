import { ColorExtractorError } from "@/core/errors.js";
import { validatePixels } from "@/core/validate.js";
import { asBytes, requireNonEmpty, typeTag, type ClassifiedInput } from "@/shared/input.js";
import { parseHttpUrl, resolveBrowserUrl } from "@/shared/url.js";

function invalidInput(message: string): ColorExtractorError {
  return new ColorExtractorError("INVALID_INPUT", message);
}

/**
 * Decides what a browser input is. The messages never echo the value.
 *
 * @param input - The value passed to `extractColors`.
 * @returns The classified input.
 * @throws ColorExtractorError with code `INVALID_INPUT`.
 */
export function classifyBrowserInput(input: unknown): ClassifiedInput {
  if (typeof input === "string") {
    if (input.trim().length === 0) {
      throw invalidInput("Input string is empty.");
    }
    return { kind: "url", url: resolveBrowserUrl(input) };
  }
  const tag = typeTag(input);
  if (tag === "[object URL]") {
    return { kind: "url", url: parseHttpUrl(input as URL) };
  }
  if (tag === "[object Blob]" || tag === "[object File]") {
    const blob = input as Blob;
    requireNonEmpty(blob.size);
    return { kind: "blob", blob };
  }
  const bytes = asBytes(input);
  if (bytes !== undefined) {
    requireNonEmpty(bytes.byteLength);
    return { kind: "bytes", bytes };
  }
  if (typeof input === "object" && input !== null) {
    return { kind: "pixels", pixels: validatePixels(input) };
  }
  throw invalidInput(
    `Input must be pixels, a Blob, bytes, or a URL, received ${input === null ? "null" : `type ${typeof input}`}.`,
  );
}
