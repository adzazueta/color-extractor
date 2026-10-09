import { ColorExtractorError } from "./errors.js";
import { extractColorsFromPixels } from "./extract.js";
import type { AsyncExtractionOptions, ExtractionResult, PixelInput } from "./types.js";
import { checkPixelLimit, readTypedArrayName, resolveOptions, validatePixels } from "./validate.js";

function isOtherInput(input: unknown): boolean {
  if (typeof input === "string") return true;
  if (readTypedArrayName(input) === "Uint8Array") return true;
  const tag = Object.prototype.toString.call(input);
  return (
    tag === "[object URL]" ||
    tag === "[object ArrayBuffer]" ||
    tag === "[object Blob]" ||
    tag === "[object File]"
  );
}

/**
 * Extracts the main colors of raw RGBA pixels, asynchronously. This entry only accepts pixels: it
 * does not read files, decode images, or download URLs, and it uses no DOM, file system, or
 * network. Import `@adzazueta/color-extractor` (or `/node`, `/browser`) to load files, bytes,
 * Blobs, or URLs. The result is the same as `extractColorsFromPixels`.
 *
 * `options` also accepts `signal`, which is checked before the analysis starts (an aborted signal
 * rejects with `ABORTED`; the analysis itself cannot be interrupted), and `fetch`, which is
 * accepted and ignored.
 *
 * @param input Raw RGBA pixels: `data` of length `width * height * 4`, `width`, and `height`.
 * @param options Optional `count` (1 to 16, default 5), `mode`, `limits`, `signal`, and `fetch`.
 * @returns The extraction result, as plain objects.
 * @throws ColorExtractorError with code `INVALID_INPUT` for a string, URL, byte array, or Blob
 *   and for invalid pixels, `INVALID_OPTIONS`, `INPUT_TOO_LARGE`, `ABORTED`, or
 *   `PROCESSING_FAILED`.
 */
export async function extractColors(
  input: PixelInput,
  options?: AsyncExtractionOptions,
): Promise<ExtractionResult> {
  // Options come first, as in every entry (specification 6.4).
  const resolved = resolveOptions(options, "async");
  if (isOtherInput(input)) {
    throw new ColorExtractorError(
      "INVALID_INPUT",
      'The /core entry only accepts pixels. Import "@adzazueta/color-extractor" (or /node, /browser) to load files, bytes, or URLs.',
    );
  }
  const pixels = validatePixels(input);
  checkPixelLimit(pixels.width, pixels.height, resolved.limits);
  const { signal } = resolved;
  if (signal?.aborted === true) {
    throw new ColorExtractorError("ABORTED", "The operation was aborted.", {
      cause: signal.reason,
    });
  }
  return extractColorsFromPixels(pixels, {
    count: resolved.count,
    mode: resolved.mode,
    limits: resolved.limits,
  });
}
