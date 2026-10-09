// Runs inside the empty smoke-test project (smoke.mjs copies it there as check.mjs).
// Argument: "without-sharp" or "with-sharp". Only images generated here are used.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const phase = process.argv[2];
if (phase !== "without-sharp" && phase !== "with-sharp") {
  throw new Error(`Unknown phase "${phase}".`);
}

const root = await import("@adzazueta/color-extractor");
const core = await import("@adzazueta/color-extractor/core");
const node = await import("@adzazueta/color-extractor/node");

assert.equal(root.extractColors, node.extractColors, "the root resolves to the Node build");
assert.equal(root.ColorExtractorError, core.ColorExtractorError, "one error class across entries");

// 8 x 4 image: 5 red columns and 3 blue columns, opaque (unequal areas, so the order is fixed).
const width = 8;
const height = 4;
const data = new Uint8Array(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    data.set(x < 5 ? [220, 40, 40, 255] : [30, 60, 200, 255], (y * width + x) * 4);
  }
}
const fromPixels = core.extractColorsFromPixels({ data, width, height });
assert.equal(fromPixels.schemaVersion, 1);
assert.deepEqual(
  fromPixels.colors.map((color) => color.hex),
  ["#dc2828", "#1e3cc8"],
);

/** Encodes RGBA pixels as a PNG by hand: filter 0 on every row, one IDAT chunk. */
function encodePng(pixels, w, h) {
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  const scanlines = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    Buffer.from(pixels.buffer, y * w * 4, w * 4).copy(scanlines, y * (1 + w * 4) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = encodePng(data, width, height);
const file = new URL("./image.png", import.meta.url);
writeFileSync(file, png);
// fileURLToPath, not pathname, so a temp folder with spaces or other escaped characters works.
const path = fileURLToPath(file);

if (phase === "without-sharp") {
  for (const [label, input] of [
    ["bytes", png],
    ["path", path],
  ]) {
    await assert.rejects(root.extractColors(input), (error) => {
      assert.ok(error instanceof root.ColorExtractorError, `${label}: a ColorExtractorError`);
      assert.equal(error.code, "DECODER_MISSING", `${label}: the error code`);
      return true;
    });
  }
  console.log("Without sharp: pixels work and decoding fails with DECODER_MISSING.");
} else {
  const fromFile = await root.extractColors(path);
  assert.deepEqual(fromFile, fromPixels, "a lossless PNG gives the same result as its pixels");
  console.log("With sharp: the PNG decodes to the same result as its pixels.");
}
