# @adzazueta/color-extractor

Extract perceptually meaningful observed colors from images in browsers and Node.js.

The neutral palette API uses deterministic CIELAB K-means by default and also supports deterministic MMCQ quantization. Both algorithms return observed colors, population evidence, perceptual rankings, and algorithm diagnostics without assigning semantic roles.

The `0.2` release introduces a neutral palette API that returns observed-color evidence without semantic role assignment. Legacy role-based extraction (`extractColors`) remains available through `0.2.x` and is deprecated for removal in `0.3.0`.

This package is ESM-only. Use `import` with the documented package entrypoints.

```ts
import { extractColor } from '@adzazueta/color-extractor'

const result = await extractColor(image)
const topId = result.rankings.perceptual[0]
const top = result.colors.find(color => color.id === topId)
console.log(top?.id, top?.hex, top?.score)
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
import { extractColor } from '@adzazueta/color-extractor'

const result = await extractColor(image)

// Resolve rankings to colors
const colorsById = new Map(
  result.colors.map(color => [color.id, color]),
)
const perceptual = result.rankings.perceptual.map(
  id => colorsById.get(id)!,
)
console.log(perceptual[0]?.hex)
```

### Browser — file input

```ts
import { extractColor } from '@adzazueta/color-extractor'

const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
const file = fileInput?.files?.[0]
if (file) {
  const result = await extractColor(file)
  console.log(result.colors[0]?.hex)
}
```

### Browser — ImageData

```ts
import { extractColorFromImageData } from '@adzazueta/color-extractor/browser'

const canvas = document.querySelector('canvas')
const ctx = canvas?.getContext('2d')
if (ctx) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = await extractColorFromImageData(imageData)
  console.log(result.colors)
}
```

### Node — local path

```ts
import { extractColor } from '@adzazueta/color-extractor/node'

const result = await extractColor('./photo.jpg')
console.log(result.rankings.perceptual)
```

### Node — Buffer

```ts
import { readFile } from 'node:fs/promises'
import { extractColor } from '@adzazueta/color-extractor/node'

const buffer = await readFile('./photo.jpg')
const result = await extractColor(buffer)
console.log(result.metadata.validPixels)
```

### Core — pixel buffer

```ts
import { extractColorFromPixels } from '@adzazueta/color-extractor/core'

const result = await extractColorFromPixels({
  data: new Uint8Array([/* RGBA bytes: width * height * 4 */]),
  width: 200,
  height: 150,
  channels: 4,
})
console.log(result.colors.length)
```

## Public entrypoints

| Import path | Primary functions | Runtime |
| --- | --- | --- |
| `@adzazueta/color-extractor` | `extractColor`, deprecated `extractColors` | Browser or Node through package export conditions |
| `@adzazueta/color-extractor/browser` | `extractColor`, `extractColorFromImageData`, deprecated `extractColors` | Browser |
| `@adzazueta/color-extractor/node` | `extractColor`, deprecated `extractColors` | Node.js |
| `@adzazueta/color-extractor/core` | `extractColorFromPixels`, `runNeutralColorPipeline`, `extractColorsFromPixels`, `extractColorsFromImageData` | Any; no decoder dependencies |

The root import uses package export conditions: Node resolves the Node entrypoint, browser-oriented resolution uses the Browser entrypoint, and the default condition is Browser. Use an explicit subpath when you need deterministic runtime selection.

All entrypoints expose the relevant public types, `VERSION`, `ColorExtractorError`, `DEFAULT_NEUTRAL_OPTIONS`, `DEFAULT_OPTIONS`, and `resolveOptions`. Browser, Node, and Core entrypoints also expose `COLOR_EXTRACTOR_ERROR_CODES`. The Browser entrypoint additionally exposes `decodeFileOrBlob`, `decodeRemoteUrl`, the `sample*` helpers, and `detectBrowserInputKind`. The Core entrypoint additionally exposes color conversion, filtering, sampling, output, and legacy role helpers. Generated TypeScript declarations are the complete export reference.

Use explicit subpath imports when you need runtime-specific types, browser decoding helpers, or the Core pixel API.

### Primary signatures

```ts
extractColor(input, options?): Promise<ExtractColorResult>
extractColorFromImageData(imageData, options?): Promise<ExtractColorResult> // browser
extractColorFromPixels(input, options?): Promise<ExtractColorResult> // core
extractColors(input, options?): Promise<ExtractColorsResult> // deprecated
```

`extractColor` is overloaded by the root entrypoint for Browser and Node inputs. `extractColorFromImageData` is available from `/browser`, and `extractColorFromPixels` is available from `/core`.

The `/core` entrypoint also exports these low-level groups:

- Color conversion: `rgbToHex`, `rgbToHsl`, `hslToRgb`, `xyzToLab`, `linearRgbToXyz`, `srgbByteToLinear`, `srgbToLinear`, `labDistance`, `labSquaredDistance`, `chromaFromLab`, `circularHueDistance`, `hueFromLab`, `normalizeHue`.
- Pixel and filtering: `normalizePixels`, `filterPixels`, `passesFilter`, `validateFilterCriteria`, `sampleSquareGrid`, `convertRgbSamplesToLab`.
- Legacy output and role helpers: `applyOutputFlags`, `buildPalette`, `buildPrimaryColor`, `findPrimaryIndex`, `selectSecondary`, `scorePrimary`, `scoreSecondary`, `buildHarmonyFallback`, `applyGrayPenalty`, `applyLightnessGap`, `contrastBoost`, and related helper types.

## Supported inputs by runtime

| Runtime | Supported inputs |
| --- | --- |
| Browser | `File`, `Blob`, `http://` or `https://` URL string, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, `ImageData` |
| Node.js | `Buffer`, `Uint8Array`, `ArrayBuffer`, URL string (`http://`/`https://`), non-empty local path string |
| Core | `{ data: Uint8Array \| Uint8ClampedArray, width: number, height: number, channels: 3 \| 4 }` |

Browser URL requests must be allowed by CORS. Browser strings other than `http://` and `https://` URLs are unsupported. Node URL strings are classified as remote when they start with `http://` or `https://`; non-empty other strings are treated as local filesystem paths. An empty Node string is unsupported.

## Neutral result model

`extractColor` returns an `ExtractColorResult`:

```ts
type ExtractColorResult = {
  colors: ObservedColor[]
  rankings: PaletteRankings
  metadata: ExtractionMetadata
}
```

### Swatches

```ts
type ObservedColor = {
  id: ColorId        // e.g. "color-a85f46"
  hex: string         // e.g. "#a85f46"
  rgb: RgbColor       // { r: number, g: number, b: number }
  lab: LabColor       // { L: number, a: number, b: number }
  chroma: number      // sqrt(a² + b²)
  population: number  // count among sampled valid pixels
  proportion: number  // population / validPixels
  score: number       // normalized perceptual score (0–1)
  hsl?: HslColor      // only when result.includeHsl is true
}
```

Every color is an observed color from the sampled valid pixels of the supplied image. No color is generated, adjusted, or assigned a UI role.

The `score` is relative within a single extraction result — it is not globally comparable across different images or extractions.

`colors` is sorted by ID (lexicographic), not by relevance. Use `rankings` to resolve order.

### Rankings

```ts
type PaletteRankings = {
  perceptual: ColorId[]   // rawScore desc → population desc → chroma desc → id asc
  population: ColorId[]   // population desc → rawScore desc → chroma desc → id asc
  chroma: ColorId[]       // chroma desc → rawScore desc → population desc → id asc
}
```

Every ranking contains exactly the same IDs as `colors`. Rankings are permutations of the returned set.

A common consumer pattern to resolve ranked colors:

```ts
const colorsById = new Map(
  result.colors.map(color => [color.id, color]),
)
const perceptual = result.rankings.perceptual.map(
  id => colorsById.get(id)!,
)
```

This is consumer code — there is no dedicated ranking helper in `0.2`.

### Metadata

```ts
type LabKmeansAlgorithmDetails = {
  algorithm: 'lab-kmeans'
  requestedClusters: number
  producedCandidates: number
  iterations: number
}

type MmcqAlgorithmDetails = {
  algorithm: 'mmcq'
  requestedBoxes: number
  producedCandidates: number
  histogramBits: number
  occupiedBins: number
  splits: number
}

type AlgorithmDetails =
  | LabKmeansAlgorithmDetails
  | MmcqAlgorithmDetails

type ExtractionMetadata = {
  algorithm: 'lab-kmeans' | 'mmcq'
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
  algorithmDetails: AlgorithmDetails
}
```

`metadata.algorithm` and `metadata.algorithmDetails.algorithm` always match. `coverage` may be less than `1` when `maxColors` limits the result. `validPixels` and populations refer to the sampled pixels that passed filtering, not necessarily every source pixel.

### Neutral Palette Defaults

The default options for neutral palette extraction (`extractColor`) are exported as `DEFAULT_NEUTRAL_OPTIONS`:

```ts
import { DEFAULT_NEUTRAL_OPTIONS } from '@adzazueta/color-extractor'
```

`DEFAULT_NEUTRAL_OPTIONS` contains the common neutral palette defaults: `algorithm: 'lab-kmeans'`, `sampling.maxDimension: 150`, filtering values `alphaThreshold: 128`, `minBrightness: 10`, `maxBrightness: 245`, `minSaturation: 8`, result values `maxColors: 5`, `includeHsl: false`, Lab K-means values `clusters: 8`, `iterations: 7`, MMCQ `boxes: 8`, and perceptual ranking values `chromaFloor: 12`, `lowChromaPenalty: 0.1`. Runtime-specific decode options (`decode`) and Node remote options (`remote`) are resolved separately per runtime. Legacy `extractColors` defaults remain available via `DEFAULT_OPTIONS`.

## Configuration

All options are optional. Defaults favor useful perceptual output and bounded resource use.

### Algorithm selection

| Option | Default | Version | Description |
| --- | --- | --- | --- |
| `algorithm` | `'lab-kmeans'` | `1.0.0` | Selects `'lab-kmeans'` or `'mmcq'`. Both algorithms use the same neutral normalization, scoring, rankings, and metadata contract. |
| `algorithm: 'mmcq'` | - | `mmcq-v2` | Uses a 5-bit-per-channel RGB histogram and selects the nearest observed sample from each final box. |

Lab K-means generates Lab-space candidates. MMCQ builds a 5-bit-per-channel RGB histogram, splits color boxes, and selects the nearest observed sample in each final box. The selected version is reported in `metadata.algorithmVersion`.

The shared neutral ranking uses `chroma * log(population + 1)`. When a candidate's chroma is below `chromaFloor`, the score is multiplied by `lowChromaPenalty`. The normalized `score` is relative to the current extraction result.

### Common options (every runtime)

| Group | Option | Default | Description |
| --- | --- | --- | --- |
| `sampling` | `maxDimension` | `150` | Constrain the longest image dimension to this size across browser, Node, and `/core` runtimes. Integer range: 1–4096. In `/core`, downsamples grid sampling to this maximum dimension without modifying the source pixel buffer. |
| `filtering` | `alphaThreshold` | `128` | Ignore pixels below this alpha value. Integer range: 0–255. |
| `filtering` | `minBrightness` | `10` | Ignore near-black pixels below this sRGB brightness. Number range: 0–255. |
| `filtering` | `maxBrightness` | `245` | Ignore near-white pixels above this sRGB brightness. Number range: 0–255. Must be >= `minBrightness`. |
| `filtering` | `minSaturation` | `8` | Ignore low-saturation pixels below this HSL percentage. Number range: 0–100. |
| `result` | `maxColors` | `5` | Maximum number of colors in the returned result. Integer range: 1–64. |
| `result` | `includeHsl` | `false` | Include HSL values in each color. |
| `advanced.labKmeans` | `clusters` | `max(8, maxColors)` | Internal cluster count. Integer range: 1–64. Must be >= `maxColors`. |
| `advanced.labKmeans` | `iterations` | `7` | K-means refinement passes. Integer range: 1–100. |
| `advanced.mmcq` | `boxes` | `max(8, maxColors)` | Requested MMCQ color boxes. Integer range: 1–64. Must be >= `maxColors`. |
| `advanced.perceptualRanking` | `chromaFloor` | `12` | Chroma below which the low-chroma penalty applies. Number range: 0–150. |
| `advanced.perceptualRanking` | `lowChromaPenalty` | `0.1` | Score multiplier for low-chroma candidates. Number range: 0–1. |
| `signal` | — | — | `AbortSignal` for cancellation. |

> **Note:** `result.maxColors` caps the returned color count but is independent of the internal cluster/box count. The active algorithm's count defaults to at least 8 and must be >= `maxColors`.

> **Note:** When `algorithm` is `'lab-kmeans'`, `advanced.mmcq` is rejected. When `algorithm` is `'mmcq'`, `advanced.labKmeans` is rejected. `advanced.perceptualRanking` is valid for both algorithms.

> **Note:** There is no `ranking.strategy` option. All three rankings are always returned.

### Browser decode options

| Option | Default | Description |
| --- | --- | --- |
| `decode.maxPixels` | `25_000_000` | Maximum decoded image dimensions (width × height). Integer range: 1–100,000,000. |

### Node decode options

| Option | Default | Description |
| --- | --- | --- |
| `decode.maxPixels` | `25_000_000` | Maximum decoded image dimensions (width × height). Integer range: 1–100,000,000. |
| `decode.animated` | `'first-frame'` | `'first-frame'` extracts only the first frame. |
| `decode.svg` | `'disabled'` | SVG decoding policy. Enable only for trusted sources. |
| `decode.respectOrientation` | `true` | Apply EXIF orientation. |
| `decode.normalizeColorProfile` | `true` | Convert supported images to sRGB. |

### Node remote options

| Option | Default | Description |
| --- | --- | --- |
| `remote.timeoutMs` | `10_000` | Request and body timeout in milliseconds. Integer range: 1–300,000. |
| `remote.maxBytes` | `10_000_000` | Maximum remote response or local file input size in bytes. Integer range: 1–1,000,000,000. |
| `remote.maxRedirects` | `3` | Maximum redirect hops. Integer range: 0–20. |
| `remote.allowedProtocols` | `['http:', 'https:']` | Non-empty list of URL protocols allowed for remote input. Values may only be `'http:'` or `'https:'`. |
| `remote.allowPrivateNetworks` | `false` | Permit private or reserved addresses. Do not enable for untrusted URLs. |
| `remote.validateContentType` | `true` | Reject non-image response content types when available. |

### Option validation

Unknown, legacy, invalid, `null`, or runtime-incompatible options fail with `COLOR_EXTRACTOR_INVALID_OPTIONS`. Only `undefined` means that an option was omitted and should receive its default. Valid zero values are preserved (e.g. `lowChromaPenalty: 0`).

### Full example

```ts
import { extractColor } from '@adzazueta/color-extractor'

const result = await extractColor(image, {
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

For MMCQ, select the algorithm and configure its boxes instead:

```ts
const result = await extractColor(image, {
  algorithm: 'mmcq',
  result: { maxColors: 6 },
  advanced: {
    mmcq: { boxes: 8 },
    perceptualRanking: { chromaFloor: 12, lowChromaPenalty: 0.1 },
  },
})
```

## Cancellation

Pass an `AbortSignal` to cancel extraction in progress:

```ts
const controller = new AbortController()

setTimeout(() => controller.abort(), 5000)

try {
  const result = await extractColor(image, {
    signal: controller.signal,
  })
} catch (error) {
  if (error instanceof ColorExtractorError && error.code === 'COLOR_EXTRACTOR_ABORTED') {
    console.log('Cancelled')
  }
}
```

Cancellation is checked before work, during supported asynchronous decoding/fetching, after filtering, and after candidate generation. MMCQ also checks during histogram construction, box splitting, and final candidate construction. K-means checks between synchronous refinement iterations; it does not interrupt an iteration that is already running.

An already-aborted signal rejects immediately without decode, fetch, or sharp work.

## Error handling

Library-generated validation, decoding, fetching, and extraction failures use `ColorExtractorError` with a stable `code` property. Platform exceptions that are not recognized by an adapter may propagate unchanged.

```ts
import { ColorExtractorError, extractColor } from '@adzazueta/color-extractor'

try {
  await extractColor(image)
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
| `COLOR_EXTRACTOR_FETCH_FAILED` | Fetch | Non-2xx response, network failure, response-body read failure, or empty response. |
| `COLOR_EXTRACTOR_INPUT_TOO_LARGE` | Input | Browser/Node remote response or Node local file exceeded `maxBytes`. |
| `COLOR_EXTRACTOR_IMAGE_TOO_LARGE` | Decode | Image dimensions exceeded `maxPixels`. |
| `COLOR_EXTRACTOR_TIMEOUT` | Fetch | URL request exceeded `timeoutMs`. |
| `COLOR_EXTRACTOR_UNSAFE_URL` | Fetch (Node) | URL rejected by safety policy. |
| `COLOR_EXTRACTOR_UNSUPPORTED_FORMAT` | Decode (Node) | Format not supported by the decoder. |
| `COLOR_EXTRACTOR_SHARP_MISSING` | Decode (Node) | `sharp` is not installed. |
| `COLOR_EXTRACTOR_NO_VALID_PIXELS` | Filtering | All pixels removed by filtering criteria. |

The `code` field is the stable machine contract. Error message text may change between releases.

## Browser notes

- Supported inputs: `File`, `Blob`, `http://` or `https://` URL string, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, `ImageData`.
- URL strings are fetched via `fetch()` and subject to CORS.
- Browser neutral extraction does not expose Node's `remote` options. Browser remote fetches use the built-in 10-second timeout and 10 MB response limit.
- Decoded images are sampled via `OffscreenCanvas` when available, otherwise a DOM canvas fallback, to `sampling.maxDimension` while preserving aspect ratio. `ImageData` uses a software fallback only when no canvas API is available.
- Browser `decode.maxPixels` is checked after platform image decoding because browser APIs do not provide portable pre-decode dimensions.
- The browser bundle contains no Node.js dependencies.

## Node notes

- Supported inputs: `Buffer`, `Uint8Array`, `ArrayBuffer`, URL string, non-empty local path string.
- Strings starting with `http://` or `https://` are fetched as remote URLs.
- Non-empty strings that are not HTTP(S) URLs are treated as local filesystem paths. An empty string is unsupported.
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
- `sampling.maxDimension` controls grid downsampling without modifying the source pixel buffer.
- There is no DOM, filesystem, fetch, or sharp dependency.

## Format support

Browser support follows the platform decoder. PNG, JPEG, GIF, WebP, and BMP are widely available; AVIF and SVG availability depends on the browser.

Node support follows the installed `sharp` and libvips build. Common formats include PNG, JPEG, WebP, GIF, AVIF, TIFF, BMP, and ICO.

## Legacy API deprecation

The `0.1.x` role-based API (`extractColors`, `extractColorsFromPixels`, `extractColorsFromImageData`) is deprecated starting in `0.2.0`. It remains available and frozen through `0.2.x` and will be removed in `0.3.0`.

| Legacy | Neutral replacement |
| --- | --- |
| `extractColors` | `extractColor` |
| `extractColorsFromPixels` | `extractColorFromPixels` |
| `extractColorsFromImageData` | `extractColorFromImageData` (browser) or `extractColorFromPixels` (core) |

See [MIGRATION.md](MIGRATION.md) for a complete migration guide.

## Known limitations

- Lab K-means (default) and MMCQ (`algorithm: 'mmcq'`) are the available neutral extraction algorithms.
- No role assignment — every color is an observed color with no semantic label.
- No generated or adjusted colors (harmony fallback, lightness adjustment).
- No public ranking helper — use the `Map` pattern shown above.
- Cancellation granularity is between synchronous pipeline stages and between K-means iterations, not inside one synchronous K-means iteration.
- Browser and Node decoders may produce slightly different pixel values from the same image.

## color-engine boundary

Semantic role selection (primary, secondary, accent), harmony generation, lightness adjustment, and fallback policies moved out of `@adzazueta/color-extractor` in `0.2.0`.

`extractColor` returns only observed-color evidence. Consumers that need role-labeled colors should compose the extractor with a separate engine layer:

```ts
const extracted = await extractColor(image)
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
