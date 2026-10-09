import { extractColorsFromPixels } from "@/core/extract.js";
import type { AsyncExtractionOptions, ExtractionResult, PixelInput } from "@/core/types.js";
import { checkByteLimit, checkPixelLimit, resolveOptions } from "@/core/validate.js";
import { decodeImage } from "@/node/decode.js";
import { readImageFile } from "@/node/file.js";
import { classifyNodeInput } from "@/node/input.js";
import { normalizeError, throwIfAborted } from "@/shared/abort.js";
import { downloadImage } from "@/shared/download.js";

export { ColorExtractorError } from "@/core/errors.js";
export type { ColorExtractorErrorCode } from "@/core/errors.js";
export type {
  AsyncExtractionOptions,
  ExtractedColor,
  ExtractionOptions,
  ExtractionResult,
  Mode,
  PixelInput,
} from "@/core/types.js";
export { extractColorsFromPixels } from "@/core/extract.js";

/** What `extractColors` accepts in Node.js. */
export type ImageInput = PixelInput | Uint8Array | ArrayBuffer | URL | string;

/**
 * Extracts the main colors of an image.
 *
 * Accepted inputs:
 * - raw RGBA pixels (`{ data, width, height }`);
 * - encoded JPEG, PNG, WebP, or AVIF bytes (`Uint8Array`, `Buffer`, or `ArrayBuffer`);
 * - a file path (any string that does not start with `http://` or `https://`);
 * - an `http` or `https` URL, as a string or a `URL` object.
 *
 * Blobs are only supported in the browser. Decoding needs the optional package `sharp`; without
 * it, encoded images fail with `DECODER_MISSING`, and raw pixels keep working.
 *
 * Limitations:
 * - Animated images are rejected with `UNSUPPORTED_FORMAT`.
 * - Embedded color profiles are converted to sRGB by sharp.
 * - URLs are fetched as given, with no protection against server-side request forgery (SSRF).
 *   Validate URLs that come from untrusted users before passing them, or pass a restricted
 *   `fetch`. Redirects follow the fetch defaults.
 * - `signal` rejects promptly with `ABORTED`, but a decode already started in sharp, and the
 *   analysis itself, cannot be interrupted and finish in the background.
 *
 * @param input The image to analyze.
 * @param options Optional `count` (1 to 16, default 5), `mode`, `limits`, `signal`, and `fetch`.
 * @returns The extraction result, as plain objects.
 * @throws ColorExtractorError with the code that describes the failure.
 */
export async function extractColors(
  input: ImageInput,
  options?: AsyncExtractionOptions,
): Promise<ExtractionResult> {
  const resolved = resolveOptions(options, "async");
  const source = classifyNodeInput(input);
  const { limits, signal } = resolved;
  if (source.kind === "pixels") checkPixelLimit(source.pixels.width, source.pixels.height, limits);
  if (source.kind === "bytes") checkByteLimit(source.bytes.byteLength, limits);
  let pixels: PixelInput;
  try {
    throwIfAborted(signal);
    if (source.kind === "pixels") {
      pixels = source.pixels;
    } else {
      let bytes: Uint8Array;
      if (source.kind === "path") {
        bytes = await readImageFile(source.path, limits, signal);
      } else if (source.kind === "url") {
        bytes = await downloadImage(source.url, { limits, signal, fetch: resolved.fetch });
      } else if (source.kind === "bytes") {
        bytes = source.bytes;
      } else {
        // The classifier never returns a Blob in Node.js.
        throw new TypeError("Unexpected Blob input.");
      }
      pixels = await decodeImage(bytes, limits, signal);
    }
    throwIfAborted(signal);
  } catch (error) {
    throw normalizeError(error, signal);
  }
  return extractColorsFromPixels(pixels, { count: resolved.count, mode: resolved.mode, limits });
}
