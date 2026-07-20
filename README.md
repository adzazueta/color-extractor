# @adzazueta/color-extractor

Extract perceptually meaningful observed colors from images in browsers and Node.js.

It uses CIELAB K-means with chroma-weighted scoring, favoring colors people perceive as visually dominant instead of only the most frequent pixels.

The `0.2` release introduces a neutral palette API that returns observed-color evidence without semantic role assignment. Legacy role-based extraction (`extractColors`) remains available through `0.3.x` and is deprecated for removal in `0.4.0`.

```ts
import { extractPalette } from '@adzazueta/color-extractor'

const result = await extractPalette(image)
const topId = result.rankings.perceptual[0]
const top = result.swatches.find(swatch => swatch.id === topId)
console.log(top.id, top.hex, top.score)
```

## Installation

```sh
npm install @adzazueta/color-extractor
```

To install the `0.2` prerelease channel:

```sh
npm install @adzazueta/color-extractor@next
```

For Node.js image decoding, install the optional `sharp` peer dependency:

```sh
npm install sharp
```

The Node entrypoint requires Node.js `^20.19.0 || >=22.12.0`. Browser and core consumers do not need `sharp`.

## Quick start

### Universal (root)

```ts
import { extractPalette } from '@adzazueta/color-extractor'

const result = await extractPalette(image)

// Resolve rankings to swatches
const swatchesById = new Map(
  result.swatches.map(swatch => [swatch.id, swatch]),
)
const perceptual = result.rankings.perceptual.map(
  id => swatchesById.get(id)!,
)
console.log(perceptual[0]?.hex)
```

### Browser — file input

```ts
import { extractPalette } from '@adzazueta/color-extractor'

const fileInput = document.querySelector('input[type="file"]')
const file = fileInput?.files?.[0]
if (file) {
  const result = await extractPalette(file)
  console.log(result.swatches[0]?.hex)
}
```

### Browser — ImageData

```ts
import { extractPaletteFromImageData } from '@adzazueta/color-extractor/browser'

const canvas = document.querySelector('canvas')
const ctx = canvas?.getContext('2d')
if (ctx) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = await extractPaletteFromImageData(imageData)
  console.log(result.swatches)
}
```

### Node — local path

```ts
import { extractPalette } from '@adzazueta/color-extractor/node'

const result = await extractPalette('./photo.jpg')
console.log(result.rankings.perceptual)
```

### Node — Buffer

```ts
import { readFile } from 'node:fs/promises'
import { extractPalette } from '@adzazueta/color-extractor/node'

const buffer = await readFile('./photo.jpg')
const result = await extractPalette(buffer)
console.log(result.metadata.validPixels)
```

### Core — pixel buffer

```ts
import { extractPaletteFromPixels } from '@adzazueta/color-extractor/core'

const result = await extractPaletteFromPixels({
  data: new Uint8Array([/* RGB or RGBA bytes */]),
  width: 200,
  height: 150,
  channels: 4,
})
console.log(result.swatches.length)
```

## Public entrypoints

| Import path | Functions | Runtime |
| --- | --- | --- |
| `@adzazueta/color-extractor` | `extractPalette` | Browser (default) or Node (conditional) |
| `@adzazueta/color-extractor/browser` | `extractPalette`, `extractPaletteFromImageData` | Browser |
| `@adzazueta/color-extractor/node` | `extractPalette` | Node.js |
| `@adzazueta/color-extractor/core` | `extractPaletteFromPixels` | Any (no decoder dependencies) |

Use the root import in most applications. It resolves to browser or Node based on your runtime.

Use explicit subpath imports when you need runtime-specific types or `extractPaletteFromImageData`.

## Supported inputs by runtime

| Runtime | Supported inputs |
| --- | --- |
| Browser | `File`, `Blob`, URL string, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, `ImageData` |
| Node.js | `Buffer`, `Uint8Array`, `ArrayBuffer`, URL string (`http://`/`https://`), local path string |
| Core | `{ data: Uint8Array \| Uint8ClampedArray, width: number, height: number, channels: 3 \| 4 }` |

Browser URL requests must be allowed by CORS. Node URL strings are classified as remote when they start with `http://` or `https://`; all other strings are treated as local filesystem paths.

## Neutral result model

`extractPalette` returns an `ExtractPaletteResult`:

```ts
type ExtractPaletteResult = {
  swatches: ExtractedSwatch[]
  rankings: PaletteRankings
  metadata: ExtractionMetadata
}
```

### Swatches

```ts
type ExtractedSwatch = {
  id: SwatchId        // e.g. "swatch-a85f46"
  hex: string         // e.g. "#a85f46"
  rgb: RgbColor       // { r: number, g: number, b: number }
  lab: LabColor       // { L: number, a: number, b: number }
  chroma: number      // sqrt(a² + b²)
  population: number  // pixel count
  proportion: number  // population / validPixels
  score: number       // normalized perceptual score (0–1)
  hsl?: HslColor      // only when result.includeHsl is true
}
```

Every swatch is an observed color from the supplied image. No swatch is generated, adjusted, or assigned a UI role.

The `score` is relative within a single extraction result — it is not globally comparable across different images or extractions.

`swatches` is sorted by ID (lexicographic), not by relevance. Use `rankings` to resolve order.

### Rankings

```ts
type PaletteRankings = {
  perceptual: SwatchId[]   // rawScore desc → population desc → chroma desc → id asc
  population: SwatchId[]   // population desc → rawScore desc → chroma desc → id asc
  chroma: SwatchId[]       // chroma desc → rawScore desc → population desc → id asc
}
```

Every ranking contains exactly the same IDs as `swatches`. Rankings are permutations of the returned set.

A common consumer pattern to resolve ranked swatches:

```ts
const swatchesById = new Map(
  result.swatches.map(swatch => [swatch.id, swatch]),
)
const perceptual = result.rankings.perceptual.map(
  id => swatchesById.get(id)!,
)
```

This is consumer code — there is no dedicated ranking helper in `0.2`.

### Metadata

```ts
type ExtractionMetadata = {
  algorithm: 'lab-kmeans'
  algorithmVersion: string
  packageVersion: string
  runtime: 'browser' | 'node' | 'core'
  decoder: 'canvas' | 'image-data' | 'sharp' | 'pixels'
  sampledWidth: number
  sampledHeight: number
  sampledPixels: number
  validPixels: number
  candidateCount: number
  returnedColors: number
  returnedPopulation: number
  coverage: number       // returnedPopulation / validPixels
  algorithmDetails: {
    requestedClusters: number
    producedCandidates: number
    iterations: number
  }
}
```

`coverage` may be less than `1` when `maxColors` limits the result. `algorithmDetails` is frozen and treated as opaque.

## Configuration

All options are optional. Defaults favor useful perceptual output and bounded resource use.

### Common options (every runtime)

| Group | Option | Default | Description |
| --- | --- | --- | --- |
| `sampling` | `maxDimension` | `150` | Constrain the longest image dimension to this size (browser/Node). `/core` does not resize; this option is accepted for shape compatibility but has no effect on already-normalized pixels. |
| `filtering` | `alphaThreshold` | `128` | Ignore pixels below this alpha value (0–255). |
| `filtering` | `minBrightness` | `10` | Ignore near-black pixels below this sRGB brightness (0–255). |
| `filtering` | `maxBrightness` | `245` | Ignore near-white pixels above this sRGB brightness (0–255). |
| `filtering` | `minSaturation` | `8` | Ignore low-saturation pixels below this HSL percentage (0–100). |
| `result` | `maxColors` | `5` | Maximum number of swatches in the returned result (1–64). |
| `result` | `includeHsl` | `false` | Include HSL values in each swatch. |
| `advanced.labKmeans` | `clusters` | `max(8, maxColors)` | Internal cluster count (1–64). Must be >= `maxColors`. |
| `advanced.labKmeans` | `iterations` | `7` | K-means refinement passes (1–100). |
| `advanced.perceptualRanking` | `chromaFloor` | `12` | Chroma below which the low-chroma penalty applies (0–150). |
| `advanced.perceptualRanking` | `lowChromaPenalty` | `0.1` | Score multiplier for low-chroma candidates (0–1). |
| `signal` | — | — | `AbortSignal` for cancellation. |

> **Note:** `result.maxColors` caps the returned swatch count but is independent of the internal cluster count (`advanced.labKmeans.clusters`). The cluster count defaults to at least 8 and must be >= `maxColors`.

> **Note:** There is no `ranking.strategy` option. All three rankings are always returned.

### Browser decode options

| Option | Default | Description |
| --- | --- | --- |
| `decode.maxPixels` | `25_000_000` | Maximum decoded image dimensions (width × height). |

### Node decode options

| Option | Default | Description |
| --- | --- | --- |
| `decode.maxPixels` | `25_000_000` | Maximum decoded image dimensions (width × height). |
| `decode.animated` | `'first-frame'` | `'first-frame'` extracts only the first frame. |
| `decode.svg` | `'disabled'` | SVG decoding policy. Enable only for trusted sources. |
| `decode.respectOrientation` | `true` | Apply EXIF orientation. |
| `decode.normalizeColorProfile` | `true` | Convert supported images to sRGB. |

### Node remote options

| Option | Default | Description |
| --- | --- | --- |
| `remote.timeoutMs` | `10_000` | Request timeout in milliseconds. |
| `remote.maxBytes` | `10_000_000` | Maximum remote response or local file input size in bytes. |
| `remote.maxRedirects` | `3` | Maximum redirect hops. |
| `remote.allowedProtocols` | `['http:', 'https:']` | URL protocols allowed for remote input. |
| `remote.allowPrivateNetworks` | `false` | Permit private or reserved addresses. Do not enable for untrusted URLs. |
| `remote.validateContentType` | `true` | Reject non-image response content types when available. |

### Option validation

Unknown, legacy, invalid, or runtime-incompatible options fail with `COLOR_EXTRACTOR_INVALID_OPTIONS`. Valid zero values are preserved (e.g. `lowChromaPenalty: 0`).

### Full example

```ts
import { extractPalette } from '@adzazueta/color-extractor'

const result = await extractPalette(image, {
  sampling: { maxDimension: 300 },
  filtering: {
    alphaThreshold: 16,
    minSaturation: 5,
  },
  result: {
    maxColors: 8,
    includeHsl: true,
  },
  advanced: {
    labKmeans: { clusters: 12, iterations: 10 },
    perceptualRanking: { chromaFloor: 10, lowChromaPenalty: 0.05 },
  },
})
```

## Cancellation

Pass an `AbortSignal` to cancel extraction in progress:

```ts
const controller = new AbortController()

setTimeout(() => controller.abort(), 5000)

try {
  const result = await extractPalette(image, {
    signal: controller.signal,
  })
} catch (error) {
  if (error instanceof ColorExtractorError && error.code === 'COLOR_EXTRACTOR_ABORTED') {
    console.log('Cancelled')
  }
}
```

Cancellation is checked at these pipeline stages:
- Before option resolution
- After pixel decoding and filtering
- After K-means candidate generation

Cancellation does not interrupt a single synchronous K-means iteration.

An already-aborted signal rejects immediately without decode, fetch, or sharp work.

## Error handling

All failures throw `ColorExtractorError` with a stable `code` property:

```ts
import { ColorExtractorError, extractPalette } from '@adzazueta/color-extractor'

try {
  await extractPalette(image)
} catch (error) {
  if (error instanceof ColorExtractorError) {
    console.error(error.code)   // stable machine-readable code
  }
}
```

### Error codes

| Code | Stage | Typical cause |
| --- | --- | --- |
| `COLOR_EXTRACTOR_UNSUPPORTED_INPUT` | Pre-processing | Invalid input type, missing fields, or data length mismatch. |
| `COLOR_EXTRACTOR_INVALID_OPTIONS` | Option resolution | Unknown, legacy, or out-of-range options. |
| `COLOR_EXTRACTOR_ABORTED` | Any | Operation cancelled via `AbortSignal`. |
| `COLOR_EXTRACTOR_DECODE_FAILED` | Decode | Image bytes could not be decoded. |
| `COLOR_EXTRACTOR_CORS_ERROR` | Decode (browser) | Canvas readback blocked by CORS. |
| `COLOR_EXTRACTOR_FETCH_FAILED` | Fetch | URL request failed non-2xx response. |
| `COLOR_EXTRACTOR_INPUT_TOO_LARGE` | Input | Remote response or local file exceeded `maxBytes`. |
| `COLOR_EXTRACTOR_IMAGE_TOO_LARGE` | Decode | Image dimensions exceeded `maxPixels`. |
| `COLOR_EXTRACTOR_TIMEOUT` | Fetch | URL request exceeded `timeoutMs`. |
| `COLOR_EXTRACTOR_UNSAFE_URL` | Fetch (Node) | URL rejected by safety policy. |
| `COLOR_EXTRACTOR_UNSUPPORTED_FORMAT` | Decode (Node) | Format not supported by the decoder. |
| `COLOR_EXTRACTOR_SHARP_MISSING` | Decode (Node) | `sharp` is not installed. |
| `COLOR_EXTRACTOR_NO_VALID_PIXELS` | Filtering | All pixels removed by filtering criteria. |

The `code` field is the stable machine contract. Error message text may change between releases.

## Browser notes

- Supported inputs: `File`, `Blob`, URL string, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, `ImageData`.
- URL strings are fetched via `fetch()` and subject to CORS.
- Decoded images are sampled via `OffscreenCanvas` when available, otherwise a DOM canvas fallback, to `sampling.maxDimension` while preserving aspect ratio. `ImageData` uses a software fallback only when no canvas API is available.
- The browser bundle contains no Node.js dependencies.

## Node notes

- Supported inputs: `Buffer`, `Uint8Array`, `ArrayBuffer`, URL string, local path string.
- Strings starting with `http://` or `https://` are fetched as remote URLs.
- All other strings are treated as local filesystem paths.
- SVG decoding is disabled by default. Enable with `decode.svg: 'enabled'` for trusted sources.
- Animated images return the first frame by default (`decode.animated: 'first-frame'`).
- EXIF orientation is applied by default. Color profiles are normalized to sRGB.
- SSRF protection: private network requests are blocked by default (`remote.allowPrivateNetworks: false`).
- `sharp` is an optional peer dependency — install it only when using Node decode paths.

## Core notes

- The core entrypoint accepts already-decoded pixel buffers only.
- Input requires `{ data, width, height, channels }` with `channels: 3 | 4`.
- Data length is strictly validated: `data.length === width * height * channels`.
- The core entrypoint does not resize, decode, or fetch images.
- `sampling.maxDimension` is accepted for API shape compatibility but has no effect.
- There is no DOM, filesystem, fetch, or sharp dependency.

## Format support

Browser support follows the platform decoder. PNG, JPEG, GIF, WebP, and BMP are widely available; AVIF and SVG availability depends on the browser.

Node support follows the installed `sharp` and libvips build. Common formats include PNG, JPEG, WebP, GIF, AVIF, TIFF, BMP, and ICO.

## Legacy API deprecation

The `0.1.x` role-based API (`extractColors`, `extractColorsFromPixels`, `extractColorsFromImageData`) is deprecated starting in `0.2.0`. It remains available and frozen through `0.3.x` and will be removed in `0.4.0`.

| Legacy | Neutral replacement |
| --- | --- |
| `extractColors` | `extractPalette` |
| `extractColorsFromPixels` | `extractPaletteFromPixels` |
| `extractColorsFromImageData` | `extractPaletteFromImageData` (browser) or `extractPaletteFromPixels` (core) |

See [MIGRATION.md](MIGRATION.md) for a complete migration guide.

## Known limitations (0.2)

- Lab K-means is the only clustering algorithm. MMCQ is not available.
- No role assignment — every swatch is an observed color with no semantic label.
- No generated or adjusted colors (harmony fallback, lightness adjustment).
- No public ranking helper — use the `Map` pattern shown above.
- Cancellation granularity is between synchronous pipeline stages, not inside K-means iterations.
- Browser and Node decoders may produce slightly different pixel values from the same image.

## color-engine boundary

Semantic role selection (primary, secondary, accent), harmony generation, lightness adjustment, and fallback policies moved out of `@adzazueta/color-extractor` in `0.2.0`.

`extractPalette` returns only observed-color evidence. Consumers that need role-labeled colors should compose the extractor with a separate engine layer:

```ts
const extracted = await extractPalette(image)
const theme = colorEngineAdapter(extracted)  // illustrative — adapter name defined by the engine package
```

The exact engine adapter API is defined by `@adzazueta/color-engine` and is not part of this package.

## Versioning

This package follows semantic versioning. The `0.1.x` and `0.2.x` major version zero lines may introduce breaking changes. The public API surface is documented in this README and in generated TypeScript declarations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution model, bug reporting, feature requests, and development conventions.

## Security

See [SECURITY.md](SECURITY.md) for responsible vulnerability-reporting guidance.

## License

MIT © 2026 Alexis D. Zazueta
