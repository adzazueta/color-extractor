import { ColorExtractorError } from "@/core/errors.js";
import type { PixelInput } from "@/core/types.js";
import { checkPixelLimit, type ResolvedLimits } from "@/core/validate.js";
import { raceAbort, throwIfAborted } from "@/shared/abort.js";
import { inspectImage } from "@/shared/format.js";
import { loadSharp, type SharpFunction } from "./sharp.js";

const UNSUPPORTED = "Unsupported image format. Supported formats are JPEG, PNG, WebP, and AVIF.";
const ANIMATED = "Animated images are not supported in Node.js. Provide a still image instead.";

function decodeFailed(error: unknown): ColorExtractorError {
  // An ABORTED from raceAbort passes through unchanged.
  if (error instanceof ColorExtractorError) {
    return error;
  }
  return new ColorExtractorError("DECODE_FAILED", "The image could not be decoded.", {
    cause: error,
  });
}

async function readMetadata(
  sharp: SharpFunction,
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
) {
  try {
    // sharp's limit is off here: checkPixelLimit below reports it as INPUT_TOO_LARGE instead.
    return await raceAbort(sharp(bytes, { limitInputPixels: false }).metadata(), signal);
  } catch (error) {
    throw decodeFailed(error);
  }
}

async function readPixels(
  sharp: SharpFunction,
  bytes: Uint8Array,
  limits: ResolvedLimits,
  signal: AbortSignal | undefined,
) {
  try {
    return await raceAbort(
      sharp(bytes, {
        autoOrient: true,
        // Fail only on real errors, like browsers do; warnings do not reject the image.
        failOn: "error",
        limitInputPixels: limits.maxPixels,
        pages: 1,
      })
        .toColourspace("srgb")
        .ensureAlpha()
        .raw({ depth: "uchar" })
        .toBuffer({ resolveWithObject: true }),
      signal,
    );
  } catch (error) {
    if (
      !(error instanceof ColorExtractorError) &&
      error instanceof Error &&
      error.message.includes("exceeds pixel limit")
    ) {
      throw new ColorExtractorError(
        "INPUT_TOO_LARGE",
        `Image exceeds the limit of ${limits.maxPixels} pixels.`,
        { cause: error },
      );
    }
    throw decodeFailed(error);
  }
}

/**
 * Decodes an encoded image with sharp to non-premultiplied sRGB RGBA, with EXIF orientation
 * applied. Embedded color profiles, including CMYK, are converted to sRGB; an image without a
 * profile is taken as sRGB (CMYK without a profile uses sharp's built-in CMYK profile).
 *
 * @param bytes - The encoded image. It is not modified.
 * @param limits - The resolved limits; the pixel limit is checked before decoding.
 * @param signal - Aborts the wait; sharp's own work cannot be cancelled and finishes in the background.
 * @param load - Loads sharp; the default imports the optional `sharp` package.
 * @returns The decoded pixels.
 * @throws ColorExtractorError with code `UNSUPPORTED_FORMAT` (not JPEG, PNG, WebP, or AVIF, or
 * animated), `DECODE_FAILED`, `INPUT_TOO_LARGE`, `DECODER_MISSING`, `ABORTED`, or
 * `PROCESSING_FAILED` (sharp returned an unexpected pixel layout).
 */
export async function decodeImage(
  bytes: Uint8Array,
  limits: ResolvedLimits,
  signal: AbortSignal | undefined,
  load: () => Promise<SharpFunction> = loadSharp,
): Promise<PixelInput> {
  // The header rules out unsupported formats, animations, and oversized images before sharp loads.
  inspectImage(bytes, limits, "reject");

  throwIfAborted(signal);
  const sharp = await raceAbort(load(), signal);

  throwIfAborted(signal);
  const metadata = await readMetadata(sharp, bytes, signal);
  // sharp reports AVIF as HEIF compressed with AV1.
  const supported =
    metadata.format === "jpeg" ||
    metadata.format === "png" ||
    metadata.format === "webp" ||
    (metadata.format === "heif" && metadata.compression === "av1");
  if (!supported) {
    throw new ColorExtractorError("UNSUPPORTED_FORMAT", UNSUPPORTED);
  }
  // Backs up the header check: sharp sees the frames of animated WebP, but not of APNG.
  if ((metadata.pages ?? 1) > 1) {
    throw new ColorExtractorError("UNSUPPORTED_FORMAT", ANIMATED);
  }
  checkPixelLimit(metadata.width, metadata.height, limits);

  throwIfAborted(signal);
  const { data, info } = await readPixels(sharp, bytes, limits, signal);
  if (
    info.channels !== 4 ||
    info.premultiplied !== false ||
    data.length !== info.width * info.height * 4
  ) {
    throw new ColorExtractorError(
      "PROCESSING_FAILED",
      "The decoder returned pixels in an unexpected layout.",
    );
  }
  return { data, width: info.width, height: info.height };
}
