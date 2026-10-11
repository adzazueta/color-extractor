# @adzazueta/color-extractor

Takes an image and returns the colors it actually contains, ordered by how much they stand out or by how much area they cover. Every returned color is a real pixel of the image, with its position.

The package is ESM only and has no runtime dependencies. It works in Node.js and in browsers.

## Installation

```sh
npm install @adzazueta/color-extractor
```

Requires Node.js 22.12 or later.

To decode image files in Node.js, also install [sharp](https://sharp.pixelplumbing.com/) (`^0.35.0`). It is an optional peer dependency, and only the Node.js entry point uses it:

```sh
npm install sharp
```

Without sharp, Node.js file inputs (bytes, paths, and URLs) fail with `DECODER_MISSING`. Pixel inputs keep working. Browsers use their own decoder and do not need sharp.

## Quick start

### Node.js

```ts
import { readFile } from "node:fs/promises";
import { extractColors } from "@adzazueta/color-extractor";

// A file path
const fromPath = await extractColors("./cover.jpg");
console.log(fromPath.colors[0]?.hex);

// Bytes (Buffer, Uint8Array, or ArrayBuffer)
const fromBytes = await extractColors(await readFile("./cover.jpg"), { count: 8 });

// A URL (string or URL object)
const fromUrl = await extractColors("https://example.com/cover.jpg");
```

### Browser

```ts
import { extractColors } from "@adzazueta/color-extractor";

const input = document.querySelector<HTMLInputElement>('input[type="file"]');
const file = input?.files?.[0];
if (file) {
  // A File or Blob
  const result = await extractColors(file);
  console.log(result.colors[0]?.hex);
}

// A URL: same origin, or a server that allows CORS (see Limitations)
const fromUrl = await extractColors("/images/cover.png");
```

### Core (pixels)

`/core` has no DOM, file system, or network access. It takes RGBA pixels, including an `ImageData`.

```ts
import { extractColors, extractColorsFromPixels } from "@adzazueta/color-extractor/core";

const pixels = {
  data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
  width: 2,
  height: 2,
};

// Synchronous
const result = extractColorsFromPixels(pixels, { count: 3 });
console.log(result.colors[0]?.hex); // "#ff0000"

// Asynchronous, pixels only (accepts `signal`)
const same = await extractColors(pixels);
```

An `ImageData` from a canvas works as pixel input:

```ts
const context = canvas.getContext("2d");
const imageData = context?.getImageData(0, 0, canvas.width, canvas.height);
if (imageData) {
  const result = extractColorsFromPixels(imageData);
}
```

## API

### Entry points

| Import path                          | Contents                                                        |
| ------------------------------------ | --------------------------------------------------------------- |
| `@adzazueta/color-extractor`         | Selects `/node` or `/browser` through package export conditions |
| `@adzazueta/color-extractor/node`    | Node.js                                                         |
| `@adzazueta/color-extractor/browser` | Browsers                                                        |
| `@adzazueta/color-extractor/core`    | Pixels only; no DOM, file system, or network                    |

Every entry point exports `extractColorsFromPixels`, `ColorExtractorError`, and the types `ExtractionOptions`, `AsyncExtractionOptions`, `ExtractionResult`, `ExtractedColor`, `PixelInput`, `Mode`, and `ColorExtractorErrorCode`. The root, `/node`, and `/browser` also export their `ImageInput` type, and `/core` exports `ImageInput` as an alias of `PixelInput`.

Accepted inputs of `extractColors`:

| Entry point                           | Inputs                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `/core`                               | Pixels                                                                   |
| `/node` (and the root in Node.js)     | Pixels, bytes (`Buffer`, `Uint8Array`, `ArrayBuffer`), URL, or file path |
| `/browser` (and the root in browsers) | Pixels, `Blob`, `File`, bytes (`Uint8Array`, `ArrayBuffer`), or URL      |

Pixels are `{ data, width, height }`, where `data` is a `Uint8Array` or `Uint8ClampedArray` of non-premultiplied RGBA values in rows from top to bottom, without padding. Its length must be `width * height * 4`. An `ImageData` has this shape.

A URL is an `http` or `https` string or a `URL` object. In Node.js, a string that starts with `http://` or `https://` is a URL and any other string is a file path. In browsers, a relative string is resolved against the base URL of the page (or worker); `blob:` and `data:` URLs are rejected with `INVALID_INPUT`.

Other runtimes (Web Workers, worker threads, Bun, Deno, edge runtimes) can use `/core`; they are not officially tested.

### Functions

```ts
function extractColors(
  input: ImageInput,
  options?: AsyncExtractionOptions,
): Promise<ExtractionResult>;

function extractColorsFromPixels(pixels: PixelInput, options?: ExtractionOptions): ExtractionResult;
```

`extractColors` is asynchronous and accepts the inputs of its entry point. `extractColorsFromPixels` is synchronous and only accepts pixels.

### Options

| Option   | Type                                        | Default        | Applies to           |
| -------- | ------------------------------------------- | -------------- | -------------------- |
| `count`  | integer, 1 to 16                            | `5`            | both functions       |
| `mode`   | `'perceptual'` or `'population'`            | `'perceptual'` | both functions       |
| `limits` | `{ maxBytes?: number; maxPixels?: number }` | see below      | both functions       |
| `signal` | `AbortSignal`                               | none           | `extractColors` only |
| `fetch`  | `typeof fetch`                              | global `fetch` | `extractColors` only |

- **`count`:** how many colors to return. Asking for more keeps the first ones: `count: 10` returns the same first 5 colors as `count: 5`. If the image has fewer distinct colors, fewer are returned, without padding.
- **`mode`:** `'perceptual'` orders the colors by how much each one stands out, and after the first color, a shade of a color that is already placed moves down. `'population'` orders them by area. Both modes return the same colors with the same coverage and positions; only the order and the `score` differ.
- **`limits`:** `maxBytes` (default 33,554,432, which is 32 MiB) is the maximum size of an encoded file. It applies to bytes, `Blob`, `File`, file paths, and URLs, and a download is aborted when it exceeds the limit. `maxPixels` (default 16,777,216) is the maximum number of pixels, for every input. Pixel inputs are only checked against `maxPixels`. Exceeding a limit throws `INPUT_TOO_LARGE`.
- **`signal`:** cancels the call, which rejects with `ABORTED`. To set a timeout, pass `AbortSignal.timeout(ms)`. A decode that has already started cannot be interrupted and finishes in the background.
- **`fetch`:** replaces the global `fetch` when downloading a URL. Use it for a proxy, authentication, security restrictions, or tests.

An unknown option or an invalid value throws `INVALID_OPTIONS`. Omitting an option or passing `undefined` applies its default.

### Result

```ts
interface ExtractionResult {
  schemaVersion: 1;
  colors: readonly ExtractedColor[]; // already ordered; the first color is colors[0]
  meta: {
    width: number;
    height: number;
    mode: Mode;
    count: number;
    algorithmVersion: string;
  };
}

interface ExtractedColor {
  rank: number;
  hex: string;
  hex8: string;
  rgba: readonly [number, number, number, number];
  coverage: number;
  score: number;
  position: { x: number; y: number };
}
```

| Field                   | Meaning                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rank`                  | Place in the result, starting at 1.                                                                                                        |
| `hex`                   | The color as lowercase `#rrggbb`.                                                                                                          |
| `hex8`                  | The color with opacity as lowercase `#rrggbbaa`.                                                                                           |
| `rgba`                  | `[r, g, b, a]`, each from 0 to 255. The alpha is the opacity of the pixel at `position`.                                                   |
| `coverage`              | The fraction of the visible image covered by the color's group of similar colors, weighted by opacity, from 0 to 1. Rounded to 4 decimals. |
| `score`                 | From 0 to 1, rounded to 4 decimals. Only compare scores within the same image. The first color always scores 1 (unless the list is empty). |
| `position`              | The pixel coordinates `{ x, y }` of the color in the image. They point to a place where the color is part of an area of its group.         |
| `meta.count`            | The requested `count`.                                                                                                                     |
| `meta.algorithmVersion` | The version of the algorithm that produced the colors (see Guarantees).                                                                    |

Each returned color is the most representative real pixel of a group of similar colors, and `colors` has no color that is not in the image. Because coverage belongs to the whole group, the coverages of all groups add up to 1, but the returned colors can add up to less when `count` is smaller than the number of groups.

Transparency:

- Fully transparent pixels are ignored.
- The other pixels count according to their opacity, so coverage is weighted by opacity and fully transparent areas do not change it.
- A fully transparent image is not an error: it returns an empty `colors` list.

Neutral colors (whites, blacks, and grays) are not excluded and can rank first.

### Guarantees

- **Determinism:** the same image with the same package version always produces the same result in the same environment. There is no randomness.
- **Versions:** any change that can alter colors, order, coverage, or score changes `algorithmVersion`. During 0.x, that also bumps the minor version of the package.
- **Across environments:** identical results from the same file in different environments are not guaranteed (see Limitations).

### Errors

Every failure is a `ColorExtractorError`, which extends `Error`:

```ts
import { ColorExtractorError, extractColors } from "@adzazueta/color-extractor";

try {
  await extractColors("https://example.com/cover.jpg");
} catch (error) {
  if (error instanceof ColorExtractorError) {
    console.error(error.code, error.status, error.cause);
  }
}
```

- `code`: one of the codes below. The union type is `ColorExtractorErrorCode`.
- `status`: the HTTP status code. It is set only for `FETCH_FAILED` when the server responded with an error.
- `cause`: the underlying error, when there is one.

| Code                 | When                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_OPTIONS`    | Invalid options.                                                                                                                                                        |
| `INVALID_INPUT`      | Invalid input.                                                                                                                                                          |
| `INPUT_TOO_LARGE`    | A limit is exceeded.                                                                                                                                                    |
| `UNSUPPORTED_FORMAT` | Unsupported format, including animated images in Node.js.                                                                                                               |
| `DECODE_FAILED`      | Corrupt or undecodable file.                                                                                                                                            |
| `FETCH_FAILED`       | Failure downloading a URL.                                                                                                                                              |
| `READ_FAILED`        | A file path could not be read.                                                                                                                                          |
| `DECODER_MISSING`    | No decoder is available. In Node.js, sharp is not installed (the message explains how to install it). In browsers, `createImageBitmap` or `OffscreenCanvas` is missing. |
| `ABORTED`            | The call was cancelled.                                                                                                                                                 |
| `PROCESSING_FAILED`  | Unexpected failure.                                                                                                                                                     |

Checks run in this order: options, input, limits, reading or download, decoding, and analysis. The first failure is the one reported.

### Formats and decoding

- **Formats:** JPEG, PNG, WebP, and AVIF, static images only. SVG, HEIC, RAW, and video are not supported.
- **Animated images:** rejected with `UNSUPPORTED_FORMAT` in Node.js. Browsers cannot always detect them, so they analyze the first frame.
- **Orientation:** EXIF orientation is applied before the analysis. Positions refer to the rotated image.
- **Color profiles:** images are converted to sRGB using their own profile, including CMYK. Without a profile, sRGB is assumed.

## Limitations

### CORS in browsers

In browsers, a URL only works for an image on the same origin or on a server that allows CORS. The browser cannot tell a CORS block from a network failure, so both throw `FETCH_FAILED`. For a cross-origin URL, the error message names CORS as the likely cause.

`blob:` and `data:` URLs are rejected with `INVALID_INPUT`. Pass the `Blob` instead.

### SSRF on servers

The package fetches the URL exactly as given. If a server passes user-provided URLs to `extractColors`, the application is exposed to server-side request forgery (SSRF). The package does not block it. Handle it in your application:

- Validate or restrict user-provided URLs with your own policy before passing them.
- Pass a custom `fetch` through the `fetch` option that enforces your policy. Redirects follow the behavior of the `fetch` you use.
- Or download the image yourself and pass the bytes.

### Semi-transparent pixels in browsers

Browsers decode images through a premultiplied canvas, so semi-transparent pixels can lose color precision. The opacity itself is always exact. The loss grows as opacity drops. Measured on a color of (201, 117, 33) over every alpha from 1 to 255, only about 62 of the 255 values came back with the exact color:

| Alpha | Chromium and WebKit | Firefox         |
| ----- | ------------------- | --------------- |
| 128   | (201, 118, 34)      | (201, 117, 33)  |
| 40    | (204, 115, 32)      | (204, 121, 38)  |
| 1     | (255, 0, 0)         | (255, 255, 255) |

Below an alpha of about 16, the color shifts badly. In Node.js, decoding with sharp is exact. Pixel inputs are never altered.

### Other browser differences

- **Color profiles:** conversion to sRGB depends on the browser's color management, and some browsers ignore embedded profiles.
- **Damaged images:** Chromium rejects truncated or corrupt data with `DECODE_FAILED`. Firefox and WebKit can return a partial image instead, without any signal. For example, a truncated JPEG keeps the rows it decoded, and a corrupt PNG can come back fully transparent.
- **Missing APIs:** without `createImageBitmap` or `OffscreenCanvas`, decoding throws `DECODER_MISSING`.

### Results across environments

Different decoders can produce different pixels from the same file, so results from the same file are not guaranteed to be identical in Node.js and in each browser. Pixel inputs are deterministic within an environment.

### Elements and canvases

`<img>` elements and canvases are not accepted. Pass the file, a `Blob`, or the `ImageData` from `getImageData`.

## Migrating from 0.3

Version 0.4 is a complete rewrite and reuses no code from 0.3. It has a new API and a new result shape. The algorithm is new too, so the same image gives different colors than 0.3.

What changed:

- **Result shape:** `colors` is already ordered by the chosen mode, and `colors[0]` is the first color. There are no `rankings` with color ids to resolve.
- **`extractColorsFromPixels` is synchronous** and takes RGBA pixels only: there is no `channels` property.
- **Options:** the 0.3 options groups (`algorithm`, `sampling`, `filtering`, `result`, `advanced`, `decode`, `remote`) are gone. The new options are `count`, `mode`, `limits`, `signal`, and `fetch`.
- **No filtering:** near-black, near-white, and low-saturation pixels are no longer discarded. Every visible pixel counts, and neutral colors can rank first. Only fully transparent pixels are ignored.
- **Inputs:** `HTMLImageElement`, `ImageBitmap`, and `HTMLCanvasElement` are no longer accepted. `extractColorsFromImageData` is removed.
- **Formats:** only JPEG, PNG, WebP, and AVIF are supported. GIF, BMP, TIFF, ICO, and SVG are not.
- **Node.js:** 22.12 or later. Node.js 20 is no longer supported.
- **URLs and SSRF:** the SSRF protection of 0.3 (private networks blocked by default) and the `remote` options are removed. See SSRF on servers.
- **Exports:** `VERSION`, `COLOR_EXTRACTOR_ERROR_CODES`, and `DEFAULT_NEUTRAL_OPTIONS` are removed. The result has `meta.algorithmVersion` instead.

### Mapping

| 0.3                                                                                      | 0.4                                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `result.rankings.perceptual[0]`, resolved in `result.colors`                             | `result.colors[0]`                                                                    |
| `result.rankings.population`                                                             | `extractColors(input, { mode: 'population' }).colors`                                 |
| `result.rankings.chroma`                                                                 | Removed                                                                               |
| `color.id`                                                                               | Removed. Use `color.hex` or `color.rank`.                                             |
| `color.rgb` (`{ r, g, b }`)                                                              | `color.rgba` (`[r, g, b, a]`)                                                         |
| `color.proportion`                                                                       | `color.coverage` (weighted by opacity; counts every visible pixel, not a sample)      |
| `color.population`, `color.lab`, `color.chroma`, `color.hsl`                             | Removed                                                                               |
| `color.score`                                                                            | `color.score` (0 to 1, relative to the image; the first color scores 1)               |
| New                                                                                      | `color.rank`, `color.hex8`, `color.position`                                          |
| `result.metadata`                                                                        | `result.meta`: `width`, `height`, `mode`, `count`, `algorithmVersion`                 |
| `extractColorsFromPixels(input)` (async, with `channels`)                                | `extractColorsFromPixels(pixels)` (sync, RGBA only)                                   |
| `extractColorsFromImageData(imageData)` (`/browser`)                                     | `extractColors(imageData)` or `extractColorsFromPixels(imageData)`                    |
| `result: { maxColors }`                                                                  | `count` (1 to 16)                                                                     |
| `algorithm: 'lab-kmeans' \| 'mmcq'`, `advanced`                                          | Removed. There is a single algorithm.                                                 |
| `sampling`, `filtering`, `includeHsl`                                                    | Removed                                                                               |
| `decode.maxPixels` (default 25,000,000)                                                  | `limits.maxPixels` (default 16,777,216)                                               |
| `remote.maxBytes` (default 10,000,000)                                                   | `limits.maxBytes` (default 33,554,432). It applies to every encoded input.            |
| `remote.timeoutMs`                                                                       | `signal: AbortSignal.timeout(ms)`                                                     |
| `remote.allowPrivateNetworks`, `maxRedirects`, `allowedProtocols`, `validateContentType` | Removed. Use `fetch` for your own policy.                                             |
| `decode.animated`, `decode.svg`                                                          | Removed. Animated images throw `UNSUPPORTED_FORMAT` in Node.js; SVG is not supported. |
| `decode.respectOrientation`, `decode.normalizeColorProfile`                              | Always on                                                                             |
| `signal`                                                                                 | `signal` (`extractColors` only)                                                       |

Error codes lost their `COLOR_EXTRACTOR_` prefix:

| 0.3                                                           | 0.4                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `UNSUPPORTED_INPUT`                                           | `INVALID_INPUT`                                                    |
| `INVALID_OPTIONS`, `ABORTED`, `DECODE_FAILED`, `FETCH_FAILED` | The same names                                                     |
| `INPUT_TOO_LARGE`, `IMAGE_TOO_LARGE`                          | `INPUT_TOO_LARGE`                                                  |
| `UNSUPPORTED_FORMAT`                                          | `UNSUPPORTED_FORMAT`                                               |
| `SHARP_MISSING`                                               | `DECODER_MISSING`                                                  |
| `CORS_ERROR`                                                  | `FETCH_FAILED`, with CORS in the message                           |
| `TIMEOUT`                                                     | `ABORTED`, when the `signal` times out                             |
| `UNSAFE_URL`                                                  | Removed                                                            |
| `NO_VALID_PIXELS`                                             | Removed. A fully transparent image returns an empty `colors` list. |
| New                                                           | `READ_FAILED`, `DECODER_MISSING` (browsers), `PROCESSING_FAILED`   |

### Root, Node.js, and browser

Before (0.3):

```ts
import { extractColors } from "@adzazueta/color-extractor";

const result = await extractColors(image);
const colorsById = new Map(result.colors.map((color) => [color.id, color]));
const top = colorsById.get(result.rankings.perceptual[0]!);
console.log(top?.hex);
```

After (0.4):

```ts
import { extractColors } from "@adzazueta/color-extractor";

const result = await extractColors(file);
console.log(result.colors[0]?.hex);
```

For a canvas, replace `extractColors(canvas)` with `extractColors(context.getImageData(0, 0, width, height))`, or pass a `Blob` of the image.

### Core

Before (0.3):

```ts
import { extractColorsFromPixels } from "@adzazueta/color-extractor/core";

const result = await extractColorsFromPixels({ data, width, height, channels: 4 });
```

After (0.4):

```ts
import { extractColorsFromPixels } from "@adzazueta/color-extractor/core";

const result = extractColorsFromPixels({ data, width, height });
```

If your 0.3 pixels had 3 channels, convert them to RGBA first. `data.length` must equal `width * height * 4`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
