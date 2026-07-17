# @adzazueta/color-extractor

ESM-only npm package for extracting perceptually meaningful **primary**, **secondary**, **accent**, and **palette** colors from images in the browser and Node.js.

Built on **CIELAB K-means with chroma-weighted scoring** — colors are selected to match what the human eye perceives as visually dominant, not just the most frequent pixel value.

```ts
import { extractColors } from '@adzazueta/color-extractor'

const result = await extractColors(image)
// => { primary: { hex, rgb, … }, secondary: { hex, rgb, … } | null }
```

---

## Installation

```sh
npm install @adzazueta/color-extractor
```

**Node.js only:** You also need the [`sharp`](https://sharp.pixelplumbing.com/) runtime dependency for image decoding:

```sh
npm install sharp
```

`sharp` is an optional peer dependency — the package works without it in browser environments.

### Requirements

- **Runtime:** Node.js `^20.19.0 || >=22.12.0` for the Node entrypoint.
- **Package manager:** Supports any ESM-compatible workflow (pnpm, npm, yarn).
- **TypeScript:** Types are included. No `@types/*` needed for browser usage; Node users need `@types/node` for `Buffer` type support.

---

## Entrypoints

The package provides four entrypoints via [conditional exports](https://nodejs.org/api/packages.html#conditional-exports):

| Entrypoint | Resolution | Import |
|---|---|---|
| **Root** | `browser` in browser, `node` in Node | `@adzazueta/color-extractor` |
| **Browser** | Always browser entry | `@adzazueta/color-extractor/browser` |
| **Node** | Always Node entry | `@adzazueta/color-extractor/node` |
| **Core** | Runtime-agnostic pixel pipeline | `@adzazueta/color-extractor/core` |

The **root** entry is the recommended default. It resolves to the correct runtime automatically.
Use the explicit subpaths when you need precise type narrowing or want to tree-shake the unused runtime.

---

## Quick start

### Browser — from a file picker

```ts
import { extractColors } from '@adzazueta/color-extractor'

const fileInput = document.querySelector('input[type="file"]')
const result = await extractColors(fileInput.files[0])
// => { primary: { hex: "#4a7fb5", … }, secondary: { hex: "#d4a853", … } }
```

### Node.js — from a URL

```ts
import { extractColors } from '@adzazueta/color-extractor'

const result = await extractColors('https://example.com/photo.jpg')
// => { primary: { hex: "#3b6ea0", … }, secondary: { hex: "#c9943e", … } }
```

### Minimal result

The default result shape includes only `primary` and `secondary`:

```ts
interface MinimalExtractColorsResult {
  readonly primary: ExtractedColor
  readonly secondary: ExtractedColor | null
}
```

Enable `accents`, `palette`, and `metadata` through [output flags](#output).

---

## Usage by runtime

### Browser inputs

The browser entrypoint accepts:

- **`File`** / **`Blob`** — from a file input, drag-and-drop, or `fetch().blob()`
- **`string`** — an HTTP/HTTPS URL (`http://` / `https://` only)
- **`HTMLImageElement`** — an already-loaded `<img>` element
- **`ImageBitmap`** — from `createImageBitmap()`
- **`HTMLCanvasElement`** — an `<canvas>` element
- **`ImageData`** — raw pixel data

```ts
import { extractColors } from '@adzazueta/color-extractor/browser'

// From a remote URL (CORS-permitted)
const result = await extractColors('https://example.com/photo.jpg')

// From an HTMLImageElement
const img = document.querySelector('img')
const result = await extractColors(img)

// From a canvas
const canvas = document.querySelector('canvas')
const result = await extractColors(canvas)
```

#### CORS

Remote URLs fetched by the browser are subject to [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS). The server must include a permissive `Access-Control-Allow-Origin` header. The package does **not** include a proxy. CORS-blocked URL fetches throw `COLOR_EXTRACTOR_FETCH_FAILED`. When reading from an `HTMLImageElement`, `ImageBitmap`, or `<canvas>` that has been tainted by cross-origin content, a `COLOR_EXTRACTOR_CORS_ERROR` is thrown instead.

#### Browser decoding limits

No browser API provides image dimensions without decoding. `maxPixels` is enforced **after** decode, so a highly compressible oversize image may still be fully decoded before being rejected.

---

### Node.js inputs

The Node entrypoint accepts:

- **`Buffer`** / **`Uint8Array`** / **`ArrayBuffer`** — raw encoded image bytes
- **`string` (URL)** — a `http://` or `https://` URL (fetched and decoded)
- **`string` (path)** — a local file path

**Requires `sharp`** for image decoding. If `sharp` is not installed, the Node entry throws `COLOR_EXTRACTOR_SHARP_MISSING` at the first decode attempt.

```ts
import { extractColors } from '@adzazueta/color-extractor/node'
import { readFile } from 'node:fs/promises'

// From a file path (string)
const result = await extractColors('./photo.jpg')

// From a Buffer
const buffer = await readFile('./photo.jpg')
const result = await extractColors(buffer)

// From a remote URL
const result = await extractColors('https://example.com/photo.jpg')
```

---

### Core (runtime-agnostic pixel pipeline)

The core entrypoint operates on **raw decoded pixels** and does not include any image decoder. Use it when you have already decoded the image or want full control over the pipeline.

```ts
import { extractColorsFromPixels } from '@adzazueta/color-extractor/core'

const result = await extractColorsFromPixels({
  data: new Uint8Array([/* RGBA bytes … */]),
  width: 800,
  height: 600,
})
```

The core entrypoint also exports lower-level building blocks: `kmeans`, `buildClusters`, `scorePrimary`, `selectSecondary`, `sampleSquareGrid`, color conversion utilities, and more.

---

## Advanced usage

### Output flags

Control how much data is returned:

```ts
import { extractColors } from '@adzazueta/color-extractor'

const result = await extractColors(image, {
  accents: 3,
  paletteSize: 8,
  output: {
    includePalette: true,
    includeAccents: true,
    includeMetadata: true,
    includeLab: true,
    includeHsl: true,
    includeScores: false,
  },
})
```

The result then includes:

```ts
{
  primary: ExtractedColor,       // Always present
  secondary: ExtractedColor|null, // Always present (or null)
  accents: ExtractedColor[],     // With includeAccents
  palette: ExtractedColor[],     // With includePalette
  metadata: {                    // With includeMetadata
    algorithm: 'lab-kmeans-chroma-weighted',
    sampleSize: 150,
    sampledPixels: 22500,
    validPixels: 22000,
    clusters: 5,
    iterations: 7,
    primaryPreset: 'strict',
    secondaryFallback: 'harmony',
    fallbackUsed: false,
    runtime: 'browser' | 'node' | 'core',
  }
}
```

### ExtractedColor shape

```ts
interface ExtractedColor {
  hex: string             // "#4a7fb5"
  rgb: { r: number; g: number; b: number }
  hsl?: { h: number; s: number; l: number }
  lab?: { L: number; a: number; b: number }
  chroma?: number         // CIELAB chroma (C*ab)
  population?: number     // Pixel count in this cluster
  proportion?: number     // Fraction of valid pixels
  score?: number          // Chroma-weighted score
  role?: 'primary' | 'secondary' | 'accent' | 'palette'
  source?: 'cluster' | 'fallback' | 'adjusted'
}
```

Fields marked with `?` are controlled by output flags or only present in certain roles.

---

## Configuration

All options are optional. Defaults are tuned for general-purpose use.

### Top-level

| Option | Type | Default | Description |
|---|---|---|---|
| `sampleSize` | `number` | `150` | Side length of the sampling grid. Higher = more pixels sampled. |
| `paletteSize` | `number` | `5` | Number of palette colors to return (0 to disable). |
| `accents` | `number` | `0` | Number of accent colors to return. |

### `kmeans`

| Option | Type | Default | Description |
|---|---|---|---|
| `kmeans.clusters` | `number` | `5` | Number of K-means clusters. Max = number of valid pixels. |
| `kmeans.iterations` | `number` | `7` | K-means refinement iterations. |

### `filtering`

Filters out pixels that don't meet criteria before clustering.

| Option | Type | Default | Description |
|---|---|---|---|
| `filtering.alphaThreshold` | `number` (0–255) | `128` | Minimum alpha channel value. Pixels below this are skipped. |
| `filtering.minBrightness` | `number` (0–255) | `10` | Minimum perceived brightness (sRGB luma). |
| `filtering.maxBrightness` | `number` (0–255) | `245` | Maximum perceived brightness. |
| `filtering.minSaturation` | `number` (0–100) | `8` | Minimum HSL saturation % to include. |

### `primary`

Controls how the primary color is chosen from the clusters.

| Option | Type | Default | Description |
|---|---|---|---|
| `primary.preset` | `'strict'` `'balanced'` `'vibrant'` `'dominant'` | `'strict'` | Scoring formula: `strict` = chroma × log(population); `balanced` = chroma^1.25 × log(pop); `vibrant` = chroma^1.75 × log(pop); `dominant` = population only. |

### `secondary`

Controls secondary color selection.

| Option | Type | Default | Description |
|---|---|---|---|
| `secondary.fallback` | `'harmony'` `'nearest'` `'null'` | `'harmony'` | What to do when no cluster meets contrast: `harmony` = rotated hue from primary; `nearest` = closest below-threshold cluster; `null` = return null. |
| `secondary.contrastMinDE` | `number` | `20` | Minimum CIE76 distance (Euclidean ΔE in CIELAB) from primary to qualify as secondary candidate. Used as both a filter threshold and a scoring weight. |
| `secondary.harmonyFallbackDeg` | `number` (0–360) | `150` | Hue rotation in degrees for the harmony fallback. |

### `scoring`

| Option | Type | Default | Description |
|---|---|---|---|
| `scoring.chromaFloor` | `number` | `12` | Chroma threshold below which the gray penalty is applied. |
| `scoring.grayPenalty` | `number` (0–1) | `0.1` | Score multiplier for low-chroma (gray) clusters. |

### `lightness`

| Option | Type | Default | Description |
|---|---|---|---|
| `lightness.enforceGap` | `boolean` | `false` | Whether to enforce a minimum lightness difference between primary and secondary. |
| `lightness.minGap` | `number` (0–100) | `18` | Minimum lightness gap (HSL L, 0–100 scale). |

### `output`

| Option | Type | Default | Description |
|---|---|---|---|
| `output.includePalette` | `boolean` | `false` | Include palette colors. |
| `output.includeAccents` | `boolean` | `false` | Include accent colors. |
| `output.includeMetadata` | `boolean` | `false` | Include extraction metadata. |
| `output.includeLab` | `boolean` | `false` | Include CIELAB values on each color. |
| `output.includeHsl` | `boolean` | `true` | Include HSL values. |
| `output.includeScores` | `boolean` | `false` | Include score, population, and proportion. |

### `remote`

Controls outbound HTTP requests. Used in both Node and browser URL fetch paths.

| Option | Type | Default | Description |
|---|---|---|---|
| `remote.timeoutMs` | `number` | `10_000` | Request timeout in milliseconds (browser + Node). |
| `remote.maxBytes` | `number` | `10_000_000` | Maximum response body size in bytes (browser + Node). |
| `remote.maxRedirects` | `number` | `3` | Maximum HTTP redirect hops (Node only). |
| `remote.allowPrivateNetworks` | `boolean` | `false` | Allow requests to private/reserved IP ranges, **SSRF risk** (Node only). |
| `remote.allowedProtocols` | `string[]` | `['http:', 'https:']` | Allowed URL protocols for remote requests (Node only). |
| `remote.validateContentType` | `boolean` | `true` | Reject non-image `Content-Type` responses (Node only). |

### `decode`

Controls image decoding behavior. Applies in both browser and Node for `maxPixels`; `animated`, `svg`, `respectOrientation`, and `normalizeColorProfile` apply to Node's sharp decoder only.

| Option | Type | Default | Description |
|---|---|---|---|
| `decode.maxPixels` | `number` | `25_000_000` | Maximum decoded pixel count — width × height (browser + Node). |
| `decode.animated` | `'first-frame'` `'all-frames'` `'disabled'` | `'first-frame'` | Animated image handling (Node only). |
| `decode.svg` | `'disabled-in-node'` `'enabled-in-node'` `'disabled'` `'enabled'` | `'disabled-in-node'` | SVG rendering policy (Node only). |
| `decode.respectOrientation` | `boolean` | `true` | Apply EXIF orientation metadata (Node only). |
| `decode.normalizeColorProfile` | `boolean` | `true` | Convert to sRGB color space (Node only). |

---

## Runtime format support

### Browser

The browser decodes images using the platform's built-in decoders (`createImageBitmap`, `Image`, `<canvas>`). Supported formats depend on the browser:

- **Widely supported:** PNG, JPEG, GIF, WebP, BMP (availability depends on browser and decoder)
- **Modern browsers:** AVIF
- **SVG:** Supported via `Blob`/`File` when the browser can rasterize it

The browser does **not** support animated frame selection — `createImageBitmap` captures the first frame of animated formats.

### Node.js

Node uses `sharp`/libvips for decoding. libvips supports:

- PNG, JPEG, WebP, GIF, AVIF, TIFF, BMP, SVG (via librsvg), and others
- Format support depends on the libvips build (some distributions exclude AVIF or TIFF)
- SVG is **disabled by default** in Node (`decode.svg: 'disabled-in-node'`) as a security measure. Enable it explicitly when you trust the source.
- Animated images default to first-frame only. Set `decode.animated: 'all-frames'` to merge all frames into a single sample grid.

### Core

The core entrypoint receives already-decoded pixels. Format support depends on whatever decoder you use upstream.

---

## Security

### Default protections

| Protection | Default | Override |
|---|---|---|
| **Request timeout** | 10 seconds | `remote.timeoutMs` |
| **Response size limit** | 10 MB | `remote.maxBytes` |
| **Private network blocking** | Enabled (Node only) | ⚠️ `remote.allowPrivateNetworks: true` |
| **Protocol restriction** | `http:` and `https:` only | `remote.allowedProtocols` |
| **Content-Type validation** | Enabled (Node only) | `remote.validateContentType: false` |
| **Redirect limit** | 3 hops | `remote.maxRedirects` |
| **Max pixel count** | 25 MP | `decode.maxPixels` |
| **SVG in Node** | Disabled | ⚠️ `decode.svg: 'enabled-in-node'` |

### SSRF risk (Node)

Remote URLs are resolved and fetched server-side. By default:
- Requests to private/reserved IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, etc.) are **blocked**.
- Only `http:` and `https:` protocols are allowed.
- Redirects follow the same security checks.

Override only when you control the input source.

### SVG policy (Node)

SVG is **disabled in Node** by default because SVG processing via librsvg can be a vector for XXE (XML External Entity) attacks and can reference external resources. Enable it only when images come from a trusted source.

### Resource exhaustion

- **Pixel limit:** A 25 MP default prevents decoding of extremely large images. If your use case requires larger images, increase `decode.maxPixels` — but be aware of the memory impact.
- **Byte limit:** The 10 MB response limit applies to the raw response body, not decoded pixels. Compressed images (JPEG, WebP) can decompress to much larger pixel buffers.

### Decoder caveat

Package-level `maxPixels` for both browser and Node prevents returning oversized results, but in Node the limit is also passed to `sharp` as `limitInputPixels` for early rejection, while in the browser the image is fully decoded before the check. See [Browser decoding limits](#browser-decoding-limits).

---

## Error handling

All thrown errors are `ColorExtractorError` instances with a `code` property:

```ts
import { ColorExtractorError, COLOR_EXTRACTOR_ERROR_CODES } from '@adzazueta/color-extractor'

try {
  const result = await extractColors(image)
} catch (error) {
  if (error instanceof ColorExtractorError) {
    console.error(error.code) // e.g. "COLOR_EXTRACTOR_CORS_ERROR"
  }
}
```

### Error codes

| Code | Meaning |
|---|---|
| `COLOR_EXTRACTOR_DECODE_FAILED` | Image bytes could not be decoded. |
| `COLOR_EXTRACTOR_CORS_ERROR` | Browser CORS restriction (tainted canvas). |
| `COLOR_EXTRACTOR_FETCH_FAILED` | HTTP error or network failure. |
| `COLOR_EXTRACTOR_IMAGE_TOO_LARGE` | Image exceeds `maxPixels`. |
| `COLOR_EXTRACTOR_INPUT_TOO_LARGE` | Response body exceeds `maxBytes`. |
| `COLOR_EXTRACTOR_NO_VALID_PIXELS` | All pixels were filtered out. |
| `COLOR_EXTRACTOR_TIMEOUT` | Request exceeded `timeoutMs`. |
| `COLOR_EXTRACTOR_UNSAFE_URL` | URL blocked by security policy (SSRF, protocol). |
| `COLOR_EXTRACTOR_SHARP_MISSING` | Optional peer dependency `sharp` is not installed (Node only). |
| `COLOR_EXTRACTOR_UNSUPPORTED_FORMAT` | The image format is not supported by the decoder. |
| `COLOR_EXTRACTOR_UNSUPPORTED_INPUT` | Invalid option value or unsupported input type. |

---

## Release checklist

Before publishing a new version:

```sh
# 1. Type-check
pnpm typecheck

# 2. Run tests
pnpm test

# 3. Build
pnpm build

# 4. Smoke test the built package
pnpm test:smoke

# 5. Verify package contents
npm pack --dry-run
# Confirm dist/ contains expected files and that
# sharp is NOT referenced from the browser bundle.

# 6. Publish (requires npm login)
npm publish
```

The `prepublishOnly` script runs `typecheck`, `test`, `build`, and `test:smoke` automatically. Run `npm pack --dry-run` manually to audit contents before publishing.

### Package contents

The following are included in the published package:

- `dist/` — Compiled JavaScript and type declarations
- `README.md`
- `LICENSE`

The `sharp` peer dependency is **not** included. Users install it separately when using Node.

---

## License

MIT © 2026 Alexis D. Zazueta
