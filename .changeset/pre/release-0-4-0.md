---
"@adzazueta/color-extractor": minor
---

0.4.0 is a complete rewrite of the package, with a new API and a new result shape, so code written for 0.3 needs changes.

**What the package does now**

- Every returned color is a real pixel of the image, with its `position`.
- `coverage` is the share of the image a color covers, weighted by opacity.
- `perceptual` (the default) orders colors by how much they stand out, and `population` orders them by area. `meta.algorithmVersion` is `"3"`.
- Options are `count` (1 to 16), `mode`, `limits`, `signal`, and `fetch` (your own `fetch` function for URLs).
- Every failure is a `ColorExtractorError` with a `code`.
- `extractColors` accepts the inputs of each environment: files, bytes, Blobs, URLs, and pixels. `extractColorsFromPixels` is synchronous.
- The entry points are the root (which selects Node.js or browsers), `/node`, `/browser`, and `/core` (pixels only).

**Migrating from 0.3**

Version 0.4 is a complete rewrite and reuses no code from 0.3. It has a new API and a new result shape. The algorithm is new too, so the same image gives different colors than 0.3.

**What changed**

- **Result shape:** `colors` is already ordered by the chosen mode, and `colors[0]` is the first color. There are no `rankings` with color ids to resolve.
- **`extractColorsFromPixels` is synchronous** and takes RGBA pixels only: there is no `channels` property.
- **Options:** the 0.3 options groups (`algorithm`, `sampling`, `filtering`, `result`, `advanced`, `decode`, `remote`) are gone. The new options are `count`, `mode`, `limits`, `signal`, and `fetch`.
- **No filtering:** near-black, near-white, and low-saturation pixels are no longer discarded. Every visible pixel counts, and neutral colors can rank first. Only fully transparent pixels are ignored.
- **Inputs:** `HTMLImageElement`, `ImageBitmap`, and `HTMLCanvasElement` are no longer accepted. `extractColorsFromImageData` is removed.
- **Formats:** only JPEG, PNG, WebP, and AVIF are supported. GIF, BMP, TIFF, ICO, and SVG are not.
- **Node.js:** 22.12 or later. Node.js 20 is no longer supported.
- **URLs and SSRF:** the SSRF protection of 0.3 (private networks blocked by default) and the `remote` options are removed. See "SSRF on servers" in the README.
- **Exports:** `VERSION`, `COLOR_EXTRACTOR_ERROR_CODES`, and `DEFAULT_NEUTRAL_OPTIONS` are removed. The result has `meta.algorithmVersion` instead.

**Mapping**

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

**Root, Node.js, and browser**

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

**Core**

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
