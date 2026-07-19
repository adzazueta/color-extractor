# @adzazueta/color-extractor

Extract perceptually meaningful observed colors from images in browsers and Node.js.

It uses CIELAB K-means with chroma-weighted scoring, favoring colors people perceive as visually dominant instead of only the most frequent pixels.

```ts
import { extractColors } from '@adzazueta/color-extractor'

const { primary, secondary } = await extractColors(image)
console.log(primary.hex, secondary?.hex)
```

## Installation

```sh
npm install @adzazueta/color-extractor
```

For Node.js image decoding, install the optional `sharp` peer dependency:

```sh
npm install sharp
```

The Node entrypoint requires Node.js `^20.19.0 || >=22.12.0`. Browser users do not need `sharp`.

## Quick start

### Browser

```ts
import { extractColors } from '@adzazueta/color-extractor'

const fileInput = document.querySelector('input[type="file"]')
const file = fileInput?.files?.[0]

if (file) {
  const result = await extractColors(file)
  console.log(result.primary.hex)
}
```

### Node.js

```ts
import { extractColors } from '@adzazueta/color-extractor/node'

const result = await extractColors('./photo.jpg')
console.log(result.primary.hex)
```

### More output

```ts
const result = await extractColors(image, {
  accents: 3,
  paletteSize: 8,
  output: {
    includePalette: true,
    includeAccents: true,
    includeMetadata: true,
  },
})
```

By default, the result contains `primary` and `secondary`. Enable palette, accents, metadata, Lab values, or scores with `output` options.

## Inputs

Use the root import in most applications. It resolves to the browser or Node adapter automatically.

| Runtime | Supported inputs |
| --- | --- |
| Browser | `File`, `Blob`, URL string, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, `ImageData` |
| Node.js | `Buffer`, `Uint8Array`, `ArrayBuffer`, URL string, local path string |
| Core | Normalized RGBA pixel data |

Use explicit imports when runtime-specific types are useful:

```ts
import { extractColors as extractBrowserColors } from '@adzazueta/color-extractor/browser'
import { extractColors as extractNodeColors } from '@adzazueta/color-extractor/node'
import { extractColorsFromPixels } from '@adzazueta/color-extractor/core'
```

Browser URL requests must be allowed by CORS. Node URL requests have safe defaults for redirects, response size, and private networks.

## API

### `extractColors(input, options?)`

The browser and Node entrypoints expose the same async function:

```ts
const result = await extractColors(input, options)
```

It returns the minimal result by default:

```ts
interface MinimalExtractColorsResult {
  primary: ExtractedColor
  secondary: ExtractedColor | null
}

interface ExtractedColor {
  hex: string
  rgb: { r: number; g: number; b: number }
  hsl?: { h: number; s: number; l: number }
  lab?: { L: number; a: number; b: number }
  chroma?: number
  population?: number
  proportion?: number
  score?: number
  role?: 'primary' | 'secondary' | 'accent' | 'palette'
  source?: 'cluster' | 'fallback' | 'adjusted'
}
```

`hex` and `rgb` are always available. HSL is included by default. Lab values and scoring fields are opt-in through `output` options.

When enabled, the full result can also include:

```ts
{
  primary: ExtractedColor
  secondary: ExtractedColor | null
  accents?: ExtractedColor[]
  palette?: ExtractedColor[]
  metadata?: {
    sampleSize: number
    sampledPixels: number
    validPixels: number
    clusters: number
    iterations: number
    runtime: 'browser' | 'node' | 'core'
  }
}
```

### Core pixel API

Use the core API when pixels are already decoded:

```ts
import {
  extractColorsFromImageData,
  extractColorsFromPixels,
} from '@adzazueta/color-extractor/core'

await extractColorsFromPixels({
  data: new Uint8Array([/* RGBA bytes */]),
  width: 800,
  height: 600,
})

await extractColorsFromImageData(imageData)
```

## Configuration

All options are optional. Defaults favor useful visual output and bounded resource use.

### Top-level options

| Option | Default | Purpose |
| --- | --- | --- |
| `sampleSize` | `150` | Maximum side length of the sampled grid. |
| `paletteSize` | `5` | Number of palette colors returned with `includePalette`. |
| `accents` | `0` | Number of accent colors returned with `includeAccents`. |

### Output

| Option | Default | Purpose |
| --- | --- | --- |
| `output.includePalette` | `false` | Add ranked palette colors. |
| `output.includeAccents` | `false` | Add accent colors. |
| `output.includeMetadata` | `false` | Add sampling, clustering, runtime, and decoder metadata. |
| `output.includeLab` | `false` | Add CIELAB values to returned colors. |
| `output.includeHsl` | `true` | Include HSL values in returned colors. |
| `output.includeScores` | `false` | Add population, proportion, chroma, and score fields. |

### Clustering and filtering

| Option | Default | Purpose |
| --- | --- | --- |
| `kmeans.clusters` | `5` | Number of color clusters. Higher values can describe more varied images at a higher CPU cost. |
| `kmeans.iterations` | `7` | K-means refinement passes. |
| `filtering.alphaThreshold` | `128` | Ignore pixels below this alpha value, from `0` to `255`. |
| `filtering.minBrightness` | `10` | Ignore near-black pixels below this sRGB brightness. |
| `filtering.maxBrightness` | `245` | Ignore near-white pixels above this sRGB brightness. |
| `filtering.minSaturation` | `8` | Ignore low-saturation pixels below this HSL percentage. |

### Primary and secondary colors

| Option | Default | Purpose |
| --- | --- | --- |
| `primary.preset` | `'strict'` | Primary selection mode: `strict`, `balanced`, `vibrant`, or `dominant`. `vibrant` favors saturation most; `dominant` favors pixel population. |
| `secondary.fallback` | `'harmony'` | Use a generated harmony color, the nearest cluster, or `null` when no secondary meets requirements. |
| `secondary.contrastMinDE` | `20` | Minimum CIE76 Delta E distance from primary for a secondary cluster. |
| `secondary.harmonyFallbackDeg` | `150` | Hue rotation in degrees when generating a harmony fallback. |
| `scoring.chromaFloor` | `12` | Chroma below which the gray penalty applies. |
| `scoring.grayPenalty` | `0.1` | Score multiplier for low-chroma clusters, from `0` to `1`. |
| `lightness.enforceGap` | `false` | Enforce a lightness gap between primary and secondary. |
| `lightness.minGap` | `18` | Minimum HSL lightness gap when enforcement is enabled. |

### Remote URLs

```ts
remote: {
  timeoutMs: 10_000,
  maxBytes: 10_000_000,
  maxRedirects: 3,
  allowedProtocols: ['http:', 'https:'],
  allowPrivateNetworks: false,
  validateContentType: true,
}
```

| Option | Default | Runtime | Purpose |
| --- | --- | --- | --- |
| `remote.timeoutMs` | `10_000` | Browser and Node | Request timeout in milliseconds. |
| `remote.maxBytes` | `10_000_000` | Browser and Node | Maximum response body size in bytes. |
| `remote.maxRedirects` | `3` | Node | Maximum redirect hops. |
| `remote.allowedProtocols` | `['http:', 'https:']` | Node | URL protocols allowed for remote input. |
| `remote.allowPrivateNetworks` | `false` | Node | Permit private or reserved addresses. Do not enable for untrusted URLs. |
| `remote.validateContentType` | `true` | Node | Reject non-image response content types when available. |

### Decoding

```ts
decode: {
  maxPixels: 25_000_000,
  animated: 'first-frame',
  svg: 'disabled-in-node',
  respectOrientation: true,
  normalizeColorProfile: true,
}
```

| Option | Default | Runtime | Purpose |
| --- | --- | --- | --- |
| `decode.maxPixels` | `25_000_000` | Browser and Node | Maximum decoded image dimensions, width times height. |
| `decode.animated` | `'first-frame'` | Node | Use the first frame, merge all frames, or reject animated input. |
| `decode.svg` | `'disabled-in-node'` | Node | SVG handling policy. Enable SVG only for trusted sources. |
| `decode.respectOrientation` | `true` | Node | Apply EXIF orientation. |
| `decode.normalizeColorProfile` | `true` | Node | Convert supported images to sRGB. |

Browser images are decoded before their dimensions are available, so enforce an upload-size limit before processing untrusted files.

## Format support

Browser support follows the platform decoder. PNG, JPEG, GIF, WebP, and BMP are widely available; AVIF and SVG availability depends on the browser.

Node support follows the installed `sharp` and libvips build. Common formats include PNG, JPEG, WebP, GIF, AVIF, TIFF, BMP, and ICO. SVG is disabled by default in Node.

## Errors

Failures use `ColorExtractorError` and a stable `code` property:

```ts
import { ColorExtractorError, extractColors } from '@adzazueta/color-extractor'

try {
  await extractColors(image)
} catch (error) {
  if (error instanceof ColorExtractorError) {
    console.error(error.code)
  }
}
```

| Code | Meaning |
| --- | --- |
| `COLOR_EXTRACTOR_UNSUPPORTED_INPUT` | Unsupported input or invalid option value. |
| `COLOR_EXTRACTOR_DECODE_FAILED` | The image could not be decoded. |
| `COLOR_EXTRACTOR_CORS_ERROR` | Browser canvas readback was blocked by CORS. |
| `COLOR_EXTRACTOR_FETCH_FAILED` | A URL request failed. |
| `COLOR_EXTRACTOR_INPUT_TOO_LARGE` | A remote response exceeded `maxBytes`. |
| `COLOR_EXTRACTOR_IMAGE_TOO_LARGE` | An image exceeded `maxPixels`. |
| `COLOR_EXTRACTOR_TIMEOUT` | A URL request exceeded `timeoutMs`. |
| `COLOR_EXTRACTOR_UNSAFE_URL` | A Node URL was rejected by the safety policy. |
| `COLOR_EXTRACTOR_UNSUPPORTED_FORMAT` | The decoder cannot process the image format. |
| `COLOR_EXTRACTOR_SHARP_MISSING` | Node decoding requires `sharp`. |
| `COLOR_EXTRACTOR_NO_VALID_PIXELS` | Filtering removed all pixels from the image. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution model, bug reporting, feature requests, and development conventions.

## Security

See [SECURITY.md](SECURITY.md) for responsible vulnerability-reporting guidance.

## License

MIT © 2026 Alexis D. Zazueta
