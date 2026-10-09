import { ColorExtractorError } from "@/core/errors.js";
import type { PixelInput } from "@/core/types.js";
import { checkPixelLimit, type ResolvedLimits } from "@/core/validate.js";
import { raceAbort, throwIfAborted } from "@/shared/abort.js";
import { inspectImage } from "@/shared/format.js";

/** The browser APIs the decoder needs. Some runtimes that load the browser build lack them. */
interface DecoderApis {
  readonly createImageBitmap?: typeof createImageBitmap | undefined;
  readonly OffscreenCanvas?: typeof OffscreenCanvas | undefined;
}

// "from-image" applies EXIF orientation. premultiplyAlpha does not change what the 2D canvas
// returns (verified), but "none" states the intent. "default" converts embedded profiles where the
// engine supports it.
const BITMAP_OPTIONS: ImageBitmapOptions = {
  imageOrientation: "from-image",
  premultiplyAlpha: "none",
  colorSpaceConversion: "default",
};

function closeBitmap(bitmap: ImageBitmap): void {
  bitmap.close();
}

async function readBlob(blob: Blob, signal: AbortSignal | undefined): Promise<Uint8Array> {
  try {
    return new Uint8Array(await raceAbort(blob.arrayBuffer(), signal));
  } catch (error) {
    if (error instanceof ColorExtractorError) {
      throw error;
    }
    // For example, a File that changed on disk after it was selected.
    throw new ColorExtractorError("READ_FAILED", "Could not read the Blob or File.", {
      cause: error,
    });
  }
}

/**
 * A `Blob` part with the same bytes. TypeScript rejects `Uint8Array<ArrayBufferLike>` as a
 * `BlobPart`, and the `Blob` constructor throws for views on a `SharedArrayBuffer` or a resizable
 * `ArrayBuffer`, so those are copied.
 */
function blobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const { buffer } = bytes;
  return buffer instanceof ArrayBuffer && !buffer.resizable
    ? (bytes as Uint8Array<ArrayBuffer>)
    : bytes.slice();
}

function canvasError(width: number, height: number, cause?: unknown): ColorExtractorError {
  const message = `The browser could not create a ${width}×${height} canvas.`;
  return cause === undefined
    ? new ColorExtractorError("DECODE_FAILED", message)
    : new ColorExtractorError("DECODE_FAILED", message, { cause });
}

/**
 * Decodes bytes or a `Blob`/`File` with the browser's decoder to non-premultiplied sRGB RGBA. It
 * works on the main thread and in dedicated workers.
 *
 * The header is checked before anything is decoded: only JPEG, PNG, WebP, and AVIF are accepted
 * (GIF, SVG, and BMP, which browsers would decode, are rejected), the `type` of a `Blob` is
 * ignored, and a size given by the header is checked against `maxPixels`. The size of the decoded
 * bitmap is checked again before it is drawn. EXIF orientation is applied, so the pixels and the
 * size are those of the displayed image.
 *
 * Browser behavior to be aware of:
 *
 * - **Animations.** An animated image is analyzed from its first frame (its "default image").
 *   Verified for animated WebP and APNG in Chromium, Firefox, and WebKit.
 * - **Semi-transparent pixels lose precision.** The 2D canvas stores premultiplied colors, so RGB
 *   is rounded below alpha 255; alpha itself is always exact. Measured with (201,117,33) at every
 *   alpha from 1 to 255, RGB came back exact for only about 62 of the 255 values. At alpha 128 it
 *   is off by at most 1: (201,118,34) in Chromium and WebKit, exact in Firefox. At alpha 40 it is
 *   off by up to 5: (204,115,32) in Chromium and WebKit, (204,121,38) in Firefox. Below about
 *   alpha 16 the color can change completely: at alpha 1 it came back as (255,0,0) in Chromium and
 *   WebKit and (255,255,255) in Firefox.
 * - **Color management depends on the engine.** Embedded profiles are converted to sRGB only where
 *   the browser applies them in this path (Chromium and WebKit do; Firefox was measured ignoring
 *   them), and CMYK conversions differ between engines.
 * - **Damaged data depends on the engine.** Chromium rejects truncated or corrupt data. Firefox and
 *   WebKit can return a partial image instead: a truncated JPEG keeps the rows it could decode and
 *   fills the rest (white in Firefox, gray in WebKit on macOS), and a PNG whose compressed data is
 *   corrupt comes back fully transparent.
 * - **Abort.** The call rejects as soon as `signal` aborts, but the browser cannot cancel a decode
 *   that has started: it finishes in the background, and its bitmap is released.
 *
 * @param input - The encoded image. It is not modified.
 * @param limits - The resolved limits; `maxPixels` is checked before decoding and before drawing.
 * @param signal - The caller's signal, if any.
 * @returns RGBA pixels whose `data` is the `Uint8ClampedArray` of an `ImageData`.
 * @throws ColorExtractorError with code `READ_FAILED` (an unreadable `Blob` or `File`),
 *   `UNSUPPORTED_FORMAT`, `INPUT_TOO_LARGE`, `DECODER_MISSING` (no `createImageBitmap` or
 *   `OffscreenCanvas`), `DECODE_FAILED` (empty data, data the browser cannot decode, or a canvas
 *   failure), or `ABORTED`.
 */
export async function decodeImage(
  input: Uint8Array | Blob,
  limits: ResolvedLimits,
  signal: AbortSignal | undefined,
): Promise<PixelInput> {
  throwIfAborted(signal);
  // ArrayBuffer.isView also recognizes typed arrays from other realms.
  const bytes = ArrayBuffer.isView(input) ? input : await readBlob(input, signal);

  inspectImage(bytes, limits, "first-frame");

  const apis = globalThis as DecoderApis;
  const create = apis.createImageBitmap;
  const Canvas = apis.OffscreenCanvas;
  if (typeof create !== "function" || typeof Canvas !== "function") {
    throw new ColorExtractorError(
      "DECODER_MISSING",
      "This environment has no image decoder: createImageBitmap and OffscreenCanvas are required. Pass raw pixels instead.",
    );
  }

  throwIfAborted(signal);
  // The decoder gets exactly the bytes that were inspected, without a MIME type to trust.
  const blob = new Blob([blobPart(bytes)]);
  let bitmap: ImageBitmap;
  try {
    bitmap = await raceAbort(create(blob, BITMAP_OPTIONS), signal, closeBitmap);
  } catch (error) {
    if (error instanceof ColorExtractorError) {
      throw error;
    }
    throw new ColorExtractorError("DECODE_FAILED", "The image could not be decoded.", {
      cause: error,
    });
  }

  let canvas: OffscreenCanvas | undefined;
  try {
    const { width, height } = bitmap;
    checkPixelLimit(width, height, limits);

    let context: OffscreenCanvasRenderingContext2D | null;
    try {
      canvas = new Canvas(width, height);
      context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    } catch (error) {
      throw canvasError(width, height, error);
    }
    if (context === null) {
      throw canvasError(width, height);
    }

    let image: ImageData;
    try {
      context.drawImage(bitmap, 0, 0);
      image = context.getImageData(0, 0, width, height, { colorSpace: "srgb" });
    } catch (error) {
      throw new ColorExtractorError(
        "DECODE_FAILED",
        "The browser could not read the pixels of the decoded image.",
        { cause: error },
      );
    }
    return { data: image.data, width, height };
  } finally {
    // Bitmap, canvas, and ImageData together take about 12 bytes per pixel; free the first two now.
    bitmap.close();
    if (canvas !== undefined) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
