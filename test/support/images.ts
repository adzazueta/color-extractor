import { deflateSync, crc32 } from "node:zlib";
import { blocks, halves, rgbaSample } from "./pixels.js";
import type { PixelInput } from "@/core/types.js";

export type TestImageName =
  | "rgba.png"
  | "blocks.png"
  | "blocks.jpg"
  | "blocks.webp"
  | "blocks.avif"
  | "orientation-6.jpg"
  | "orientation-3.jpg"
  | "cmyk.jpg"
  | "cmyk-no-profile.jpg"
  | "p3.png"
  | "gray.png"
  | "gray-alpha.png"
  | "rgb16.png"
  | "palette.png"
  | "animated.webp"
  | "animated.png"
  | "animated.gif"
  | "static.gif"
  | "image.tiff"
  | "image.svg"
  | "heic-brand.bin"
  | "truncated.jpg"
  | "corrupt.png"
  | "garbage.bin"
  | "empty.bin"
  | "large-header.png";

export const TEST_IMAGE_NAMES: readonly TestImageName[] = [
  "rgba.png",
  "blocks.png",
  "blocks.jpg",
  "blocks.webp",
  "blocks.avif",
  "orientation-6.jpg",
  "orientation-3.jpg",
  "cmyk.jpg",
  "cmyk-no-profile.jpg",
  "p3.png",
  "gray.png",
  "gray-alpha.png",
  "rgb16.png",
  "palette.png",
  "animated.webp",
  "animated.png",
  "animated.gif",
  "static.gif",
  "image.tiff",
  "image.svg",
  "heic-brand.bin",
  "truncated.jpg",
  "corrupt.png",
  "garbage.bin",
  "empty.bin",
  "large-header.png",
];

type Sharp = typeof import("sharp").default;

async function loadSharp(): Promise<Sharp> {
  return (await import("sharp")).default;
}

function raw(sharp: Sharp, pixels: PixelInput, channels: 4 = 4) {
  return sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels } });
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const typed = concat([latin1(type), body]);
  return concat([u32(body.length), typed, u32(crc32(typed))]);
}

function ihdr(width: number, height: number): Uint8Array {
  const body = new Uint8Array(13);
  body.set(u32(width), 0);
  body.set(u32(height), 4);
  body[8] = 8; // bit depth
  body[9] = 6; // RGBA
  return pngChunk("IHDR", body);
}

/** A 2×1 APNG with two frames (red, then blue). */
function animatedPng(): Uint8Array {
  const scanline = (rgba: readonly number[]) => deflateSync(Uint8Array.from([0, ...rgba, ...rgba]));
  const frameControl = (sequence: number) => {
    const body = new Uint8Array(26);
    body.set(u32(sequence), 0);
    body.set(u32(2), 4); // width
    body.set(u32(1), 8); // height
    body[21] = 1; // delay numerator
    body[23] = 10; // delay denominator
    return pngChunk("fcTL", body);
  };
  return concat([
    PNG_SIGNATURE,
    ihdr(2, 1),
    pngChunk("acTL", concat([u32(2), u32(0)])),
    frameControl(0),
    pngChunk("IDAT", scanline([255, 0, 0, 255])),
    frameControl(1),
    pngChunk("fdAT", concat([u32(2), scanline([0, 0, 255, 255])])),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** A PNG whose IHDR claims 5000×5000 with a tiny body. */
function largeHeaderPng(): Uint8Array {
  return concat([
    PNG_SIGNATURE,
    ihdr(5000, 5000),
    pngChunk("IDAT", deflateSync(new Uint8Array(8))),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** A PNG with a valid IHDR and a garbage IDAT. */
function corruptPng(): Uint8Array {
  const garbage = Uint8Array.from({ length: 64 }, (_, i) => (i * 97 + 13) & 0xff);
  return concat([
    PNG_SIGNATURE,
    ihdr(8, 8),
    pngChunk("IDAT", garbage),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** An `ftyp` box with the HEIC brand: a format the package does not support. */
function heicBrand(): Uint8Array {
  const brands = ["heic", "mif1", "heic"];
  return concat([
    u32(16 + brands.length * 4),
    latin1("ftyp"),
    latin1("heic"),
    u32(0),
    ...brands.map(latin1),
  ]);
}

function garbage(): Uint8Array {
  let state = 0x9e3779b9;
  return Uint8Array.from({ length: 256 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  });
}

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#dc2828"/></svg>';

async function encode(name: TestImageName): Promise<Uint8Array> {
  const sharp = await loadSharp();
  const asBytes = async (image: ReturnType<Sharp>): Promise<Uint8Array> =>
    new Uint8Array(await image.toBuffer());
  const solid = () =>
    sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 200, g: 60, b: 30, alpha: 1 },
      },
    });
  switch (name) {
    case "rgba.png":
      return asBytes(raw(sharp, rgbaSample()).png());
    case "blocks.png":
      return asBytes(raw(sharp, blocks()).png());
    case "blocks.jpg":
      return asBytes(raw(sharp, blocks()).removeAlpha().jpeg({ quality: 90 }));
    case "blocks.webp":
      return asBytes(raw(sharp, blocks()).webp({ lossless: true }));
    case "blocks.avif":
      return asBytes(raw(sharp, blocks()).avif({ lossless: true }));
    case "orientation-6.jpg":
      return asBytes(
        raw(sharp, halves()).removeAlpha().jpeg({ quality: 95 }).withMetadata({ orientation: 6 }),
      );
    case "orientation-3.jpg":
      return asBytes(
        raw(sharp, halves()).removeAlpha().jpeg({ quality: 95 }).withMetadata({ orientation: 3 }),
      );
    case "cmyk.jpg":
      return asBytes(
        solid().removeAlpha().toColourspace("cmyk").withIccProfile("cmyk").jpeg({ quality: 100 }),
      );
    case "cmyk-no-profile.jpg":
      return asBytes(solid().removeAlpha().toColourspace("cmyk").jpeg({ quality: 100 }));
    case "p3.png":
      return asBytes(solid().withIccProfile("p3").png());
    case "gray.png":
      return asBytes(solid().removeAlpha().toColourspace("b-w").png());
    case "gray-alpha.png":
      return asBytes(raw(sharp, rgbaSample()).toColourspace("b-w").png());
    case "rgb16.png":
      return asBytes(solid().toColourspace("rgb16").png());
    case "palette.png":
      return asBytes(raw(sharp, rgbaSample()).png({ palette: true, colours: 4 }));
    case "animated.webp": {
      // Three 4×2 frames of different colors stacked in one raw image (identical frames would merge).
      const data = new Uint8Array(4 * 6 * 4);
      for (let i = 0; i < 4 * 6; i++) {
        data.set(i < 8 ? [255, 0, 0, 255] : i < 16 ? [0, 255, 0, 255] : [0, 0, 255, 255], i * 4);
      }
      return asBytes(
        sharp(data, { raw: { width: 4, height: 6, channels: 4, pageHeight: 2 } }).webp({
          loop: 0,
          delay: [100, 100, 100],
          lossless: true,
        }),
      );
    }
    case "animated.png":
      return animatedPng();
    case "animated.gif": {
      const data = new Uint8Array(4 * 4 * 4);
      for (let i = 0; i < 16; i++) {
        data.set(i < 8 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
      }
      return asBytes(
        sharp(data, { raw: { width: 4, height: 4, channels: 4, pageHeight: 2 } }).gif({
          loop: 0,
          delay: [100, 100],
        }),
      );
    }
    case "static.gif":
      return asBytes(raw(sharp, rgbaSample()).gif());
    case "image.tiff":
      return asBytes(raw(sharp, rgbaSample()).tiff());
    case "image.svg":
      return latin1(SVG);
    case "heic-brand.bin":
      return heicBrand();
    case "truncated.jpg": {
      const jpeg = await encodeTestImage("blocks.jpg");
      return jpeg.slice(0, Math.floor(jpeg.length * 0.6));
    }
    case "corrupt.png":
      return corruptPng();
    case "garbage.bin":
      return garbage();
    case "empty.bin":
      return new Uint8Array(0);
    case "large-header.png":
      return largeHeaderPng();
  }
}

const cache = new Map<TestImageName, Promise<Uint8Array>>();

/** Encodes (once) the named test image. Callers must not mutate the result. */
export function encodeTestImage(name: TestImageName): Promise<Uint8Array> {
  let pending = cache.get(name);
  if (pending === undefined) {
    pending = encode(name);
    cache.set(name, pending);
  }
  return pending;
}
