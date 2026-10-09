import { ColorExtractorError } from "@/core/errors.js";
import { checkPixelLimit, type ResolvedLimits } from "@/core/validate.js";

/** Formats the adapters decode. */
export type ImageFormat = "jpeg" | "png" | "webp" | "avif";

/** What the header says, read without decoding. `sniffImage` never throws. */
export interface ImageHeader {
  /** Supported format from the signature; null for GIF, TIFF, SVG, HEIC, BMP, garbage, empty. */
  readonly format: ImageFormat | null;
  /** APNG `acTL` chunk, WebP VP8X flag 0x02, or AVIF brand "avis". */
  readonly animated: boolean;
  /** Stored size (before EXIF orientation); 0 when the header does not give it. */
  readonly width: number;
  readonly height: number;
}

/** A header whose format is supported. */
export interface SupportedImageHeader extends ImageHeader {
  readonly format: ImageFormat;
}

/** Node rejects animations; the browser analyzes the first frame. */
export type AnimationPolicy = "reject" | "first-frame";

interface Details {
  readonly animated: boolean;
  readonly width: number;
  readonly height: number;
}

// On any inconsistency the format stays but the size is unknown.
const UNKNOWN: Details = { animated: false, width: 0, height: 0 };

function u16be(b: Uint8Array, i: number): number {
  return ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
}

function u16le(b: Uint8Array, i: number): number {
  return (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
}

function u24le(b: Uint8Array, i: number): number {
  return (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
}

function u32be(b: Uint8Array, i: number): number {
  return (
    (b[i] ?? 0) * 0x1000000 + (((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))
  );
}

function u32le(b: Uint8Array, i: number): number {
  return (
    (b[i + 3] ?? 0) * 0x1000000 + (((b[i + 2] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i] ?? 0))
  );
}

function tag(b: Uint8Array, i: number, text: string): boolean {
  if (i < 0 || i + text.length > b.length) {
    return false;
  }
  for (let k = 0; k < text.length; k++) {
    if (b[i + k] !== text.charCodeAt(k)) {
      return false;
    }
  }
  return true;
}

function startsWith(b: Uint8Array, prefix: readonly number[]): boolean {
  return b.length >= prefix.length && prefix.every((value, i) => b[i] === value);
}

function sized(width: number, height: number): Details {
  return width > 0 && height > 0 ? { animated: false, width, height } : UNKNOWN;
}

function jpegDetails(b: Uint8Array): Details {
  let i = 2;
  while (i + 1 < b.length) {
    // Skip fill bytes.
    while (b[i] === 0xff && b[i + 1] === 0xff) {
      i++;
    }
    if (b[i] !== 0xff) {
      return UNKNOWN;
    }
    const p = i + 1;
    const marker = b[p] ?? 0;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i = p + 1;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return UNKNOWN;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (p + 8 > b.length) {
        return UNKNOWN;
      }
      return sized(u16be(b, p + 6), u16be(b, p + 4));
    }
    const length = u16be(b, p + 1);
    if (length < 2) {
      return UNKNOWN;
    }
    i = p + 1 + length;
  }
  return UNKNOWN;
}

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngDetails(b: Uint8Array): Details {
  if (!tag(b, 12, "IHDR") || u32be(b, 8) !== 13 || b.length < 24) {
    return UNKNOWN;
  }
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  let animated = false;
  let pos = 8;
  while (pos + 8 <= b.length) {
    if (tag(b, pos + 4, "acTL")) {
      animated = true;
    }
    if (tag(b, pos + 4, "IDAT") || tag(b, pos + 4, "IEND")) {
      return width > 0 && height > 0 ? { animated, width, height } : UNKNOWN;
    }
    pos += 12 + u32be(b, pos);
  }
  return UNKNOWN;
}

function webpDetails(b: Uint8Array): Details {
  if (tag(b, 12, "VP8 ")) {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) {
      return UNKNOWN;
    }
    return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (tag(b, 12, "VP8L")) {
    if (b.length < 25 || b[20] !== 0x2f) {
      return UNKNOWN;
    }
    const bits = u32le(b, 21);
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (tag(b, 12, "VP8X")) {
    if (b.length < 30) {
      return UNKNOWN;
    }
    return {
      animated: ((b[20] ?? 0) & 0x02) !== 0,
      width: 1 + u24le(b, 24),
      height: 1 + u24le(b, 27),
    };
  }
  return UNKNOWN;
}

interface Brands {
  readonly avif: boolean;
  readonly animated: boolean;
}

function avifBrands(b: Uint8Array): Brands {
  const size = u32be(b, 0);
  const end = Math.min(size === 0 ? b.length : size, b.length);
  let avif = false;
  let animated = false;
  const check = (at: number): void => {
    if (tag(b, at, "avif")) {
      avif = true;
    } else if (tag(b, at, "avis")) {
      avif = true;
      animated = true;
    }
  };
  check(8);
  // Bytes 12-15 are the minor version; compatible brands follow.
  for (let at = 16; at + 4 <= end; at += 4) {
    check(at);
  }
  return { avif, animated };
}

interface Box {
  readonly type: string;
  /** Offset of the box payload. */
  readonly start: number;
  readonly end: number;
}

function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const found: Box[] = [];
  const limit = Math.min(to, b.length);
  let pos = from;
  while (pos + 8 <= limit) {
    let size = u32be(b, pos);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > limit) {
        break;
      }
      size = u32be(b, pos + 8) * 0x100000000 + u32be(b, pos + 12);
      header = 16;
    } else if (size === 0) {
      size = limit - pos;
    }
    if (size < header) {
      break;
    }
    const type = String.fromCharCode(
      b[pos + 4] ?? 0,
      b[pos + 5] ?? 0,
      b[pos + 6] ?? 0,
      b[pos + 7] ?? 0,
    );
    found.push({ type, start: pos + header, end: Math.min(pos + size, limit) });
    pos += size;
  }
  return found;
}

function avifSize(b: Uint8Array): { width: number; height: number } {
  let best = { width: 0, height: 0 };
  for (const meta of boxes(b, 0, b.length)) {
    if (meta.type !== "meta") {
      continue;
    }
    // `meta` is a full box: skip 4 bytes of version and flags.
    for (const iprp of boxes(b, meta.start + 4, meta.end)) {
      if (iprp.type !== "iprp") {
        continue;
      }
      for (const ipco of boxes(b, iprp.start, iprp.end)) {
        if (ipco.type !== "ipco") {
          continue;
        }
        for (const ispe of boxes(b, ipco.start, ipco.end)) {
          if (ispe.type !== "ispe" || ispe.start + 12 > ispe.end) {
            continue;
          }
          const width = u32be(b, ispe.start + 4);
          const height = u32be(b, ispe.start + 8);
          if (width * height > best.width * best.height) {
            best = { width, height };
          }
        }
      }
    }
  }
  return best;
}

/**
 * Reads the format, the animation flag, and the stored size from the header, without decoding.
 *
 * @param bytes - The encoded image, or its first bytes.
 * @returns The header. It never throws; unknown or damaged data gives `format: null` or a zero size.
 */
export function sniffImage(bytes: Uint8Array): ImageHeader {
  const none: ImageHeader = { format: null, animated: false, width: 0, height: 0 };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { format: "jpeg", ...jpegDetails(bytes) };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { format: "png", ...pngDetails(bytes) };
  }
  if (tag(bytes, 0, "RIFF") && tag(bytes, 8, "WEBP")) {
    return { format: "webp", ...webpDetails(bytes) };
  }
  if (tag(bytes, 4, "ftyp")) {
    const brands = avifBrands(bytes);
    if (!brands.avif) {
      return none;
    }
    const { width, height } = avifSize(bytes);
    const details = sized(width, height);
    return { format: "avif", ...details, animated: brands.animated && details.width > 0 };
  }
  return none;
}

/**
 * Checks the header before any decoder runs.
 *
 * @param bytes - The encoded image.
 * @param limits - The resolved limits; the pixel limit is checked when the header gives the size.
 * @param animation - `"reject"` (Node) refuses animated images; `"first-frame"` (browser) accepts them.
 * @returns The header of a supported image.
 * @throws ColorExtractorError with code `DECODE_FAILED` (empty), `UNSUPPORTED_FORMAT`, or
 * `INPUT_TOO_LARGE`.
 */
export function inspectImage(
  bytes: Uint8Array,
  limits: ResolvedLimits,
  animation: AnimationPolicy,
): SupportedImageHeader {
  if (bytes.length === 0) {
    throw new ColorExtractorError("DECODE_FAILED", "The image data is empty.");
  }
  const header = sniffImage(bytes);
  if (header.format === null) {
    throw new ColorExtractorError(
      "UNSUPPORTED_FORMAT",
      "Unsupported image format. Supported formats are JPEG, PNG, WebP, and AVIF.",
    );
  }
  if (header.animated && animation === "reject") {
    throw new ColorExtractorError(
      "UNSUPPORTED_FORMAT",
      "Animated images are not supported in Node.js. Provide a still image instead.",
    );
  }
  if (header.width > 0 && header.height > 0) {
    checkPixelLimit(header.width, header.height, limits);
  }
  return {
    format: header.format,
    animated: header.animated,
    width: header.width,
    height: header.height,
  };
}
