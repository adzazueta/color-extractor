import { extractColorsFromPixels } from "@/core/extract.js";
import type { AsyncExtractionOptions, ExtractionResult, PixelInput } from "@/core/types.js";
import { checkByteLimit, checkPixelLimit, resolveOptions } from "@/core/validate.js";
import { decodeImage } from "@/browser/decode.js";
import { classifyBrowserInput } from "@/browser/input.js";
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

/** What `extractColors` accepts in a browser. */
export type ImageInput = PixelInput | Blob | Uint8Array | ArrayBuffer | URL | string;

/**
 * Extracts the main colors of an image.
 *
 * Accepted inputs:
 * - raw RGBA pixels (`{ data, width, height }`), including `ImageData`;
 * - a `Blob` or `File` with JPEG, PNG, WebP, or AVIF data;
 * - encoded bytes (`Uint8Array` or `ArrayBuffer`);
 * - an `http` or `https` URL, as a string or a `URL` object. Relative strings resolve against
 *   the document's (or worker's) base URL; `blob:` and `data:` URLs are rejected.
 *
 * Limitations:
 * - A cross-origin URL needs CORS headers. A CORS block cannot be told apart from a network
 *   failure, so both are `FETCH_FAILED`; the message adds a CORS hint for another origin.
 * - URLs are fetched as given, with no protection against server-side request forgery (SSRF).
 *   Validate URLs that come from untrusted users before passing them, or pass a restricted
 *   `fetch`. Redirects follow the fetch defaults.
 * - Animated images are analyzed from their first frame.
 * - Semi-transparent pixels lose some color precision, because the 2D canvas is premultiplied;
 *   alpha stays exact. The loss grows as alpha gets lower.
 * - Color management depends on the browser engine: embedded color profiles may be ignored, and
 *   CMYK conversions can differ from other environments.
 * - Truncated or corrupt data is rejected with `DECODE_FAILED` in Chromium, but Firefox and
 *   WebKit can return a partial image.
 * - `signal` rejects promptly with `ABORTED`, but a decode already started in the browser, and
 *   the analysis itself, cannot be interrupted and finish in the background.
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
  const source = classifyBrowserInput(input);
  const { limits, signal } = resolved;
  if (source.kind === "pixels") checkPixelLimit(source.pixels.width, source.pixels.height, limits);
  if (source.kind === "bytes") checkByteLimit(source.bytes.byteLength, limits);
  if (source.kind === "blob") checkByteLimit(source.blob.size, limits);
  let pixels: PixelInput;
  try {
    throwIfAborted(signal);
    if (source.kind === "pixels") {
      pixels = source.pixels;
    } else {
      let encoded: Uint8Array | Blob;
      if (source.kind === "url") {
        encoded = await downloadImage(source.url, {
          limits,
          signal,
          fetch: resolved.fetch,
          pageOrigin: globalThis.location?.origin,
        });
      } else if (source.kind === "blob") {
        encoded = source.blob;
      } else if (source.kind === "bytes") {
        encoded = source.bytes;
      } else {
        // The classifier never returns a path in a browser.
        throw new TypeError("Unexpected path input.");
      }
      pixels = await decodeImage(encoded, limits, signal);
    }
    throwIfAborted(signal);
  } catch (error) {
    throw normalizeError(error, signal);
  }
  return extractColorsFromPixels(pixels, { count: resolved.count, mode: resolved.mode, limits });
}
