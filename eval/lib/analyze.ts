import { extractColorsFromPixels } from "@/core/extract.js";
import type { ExtractionResult, Mode } from "@/core/types.js";
import { checkByteLimit, resolveOptions } from "@/core/validate.js";
import { decodeImage } from "@/node/decode.js";
import { loadSharp } from "@/node/sharp.js";
import { formatHex } from "./color.js";

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Checks the byte limit and decodes with the package's own decoder and default limits: the pixels
 * that `extractColors(bytes)` analyzes.
 *
 * @throws ColorExtractorError
 */
export async function decodeEvalImage(bytes: Uint8Array): Promise<DecodedImage> {
  const { limits } = resolveOptions(undefined, "async");
  checkByteLimit(bytes.byteLength, limits);
  const { data, width, height } = await decodeImage(bytes, limits, undefined);
  return {
    width,
    height,
    data:
      data instanceof Uint8Array && !(data instanceof Uint8ClampedArray)
        ? data
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

export function extractEvalColors(
  image: DecodedImage,
  mode: Mode,
  count: number,
): ExtractionResult {
  return extractColorsFromPixels(image, { count, mode });
}

/**
 * The exact pixel; `hex` is the "#rrggbb" of its non-premultiplied RGB.
 *
 * @throws RangeError outside the image.
 */
export function pixelAt(
  image: DecodedImage,
  x: number,
  y: number,
): { readonly hex: string; readonly alpha: number } {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= image.width ||
    y >= image.height
  ) {
    throw new RangeError("The position is outside the image.");
  }
  const offset = (y * image.width + x) * 4;
  return {
    hex: formatHex(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!),
    alpha: image.data[offset + 3]!,
  };
}

/** A lossless PNG of the decoded pixels, with no metadata. */
export async function encodeDisplayPng(image: DecodedImage): Promise<Uint8Array> {
  const sharp = await loadSharp();
  const png = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png({ compressionLevel: 1 })
    .toBuffer();
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
}

export async function decoderVersions(): Promise<{
  readonly sharp: string;
  readonly libvips: string;
}> {
  const sharp = await loadSharp();
  return { sharp: sharp.versions.sharp, libvips: sharp.versions.vips };
}
