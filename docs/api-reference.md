# API Reference

## Entrypoints

```ts
import { extractColors } from '@adzazueta/color-extractor'
import { extractColors } from '@adzazueta/color-extractor/browser'
import { extractColors } from '@adzazueta/color-extractor/node'
import { extractColorsFromPixels } from '@adzazueta/color-extractor/core'
```

Use the root entrypoint when the runtime is known. Use a subpath for runtime-specific input types. The core entrypoint accepts already-decoded pixels only.

## `extractColors`

```ts
function extractColors(input, options?): Promise<ExtractColorsResult>
```

`input` depends on the selected runtime. See [runtime support](runtime-support.md) for the complete input matrix.

## Results

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

`output.includePalette`, `output.includeAccents`, and `output.includeMetadata` add optional top-level properties. `includeLab` and `includeScores` add optional color properties.

Metadata identifies the runtime and decoder, as well as sampling and clustering details. Treat metadata as diagnostic information rather than a stable algorithm-control surface.

## Errors

All package errors are `ColorExtractorError` instances:

```ts
import { ColorExtractorError } from '@adzazueta/color-extractor'

if (error instanceof ColorExtractorError) {
  console.log(error.code)
}
```

| Code | Meaning |
| --- | --- |
| `COLOR_EXTRACTOR_UNSUPPORTED_INPUT` | Unsupported input or invalid option value. |
| `COLOR_EXTRACTOR_DECODE_FAILED` | The image could not be decoded. |
| `COLOR_EXTRACTOR_CORS_ERROR` | Browser canvas readback was blocked by CORS. |
| `COLOR_EXTRACTOR_FETCH_FAILED` | A URL request failed. |
| `COLOR_EXTRACTOR_INPUT_TOO_LARGE` | A remote response exceeded `maxBytes`. |
| `COLOR_EXTRACTOR_IMAGE_TOO_LARGE` | The decoded image exceeded `maxPixels`. |
| `COLOR_EXTRACTOR_TIMEOUT` | A URL request exceeded `timeoutMs`. |
| `COLOR_EXTRACTOR_UNSAFE_URL` | A Node URL was rejected by the security policy. |
| `COLOR_EXTRACTOR_UNSUPPORTED_FORMAT` | The decoder cannot process the format. |
| `COLOR_EXTRACTOR_SHARP_MISSING` | Node decoding requires `sharp`. |
| `COLOR_EXTRACTOR_NO_VALID_PIXELS` | Image pixels were removed by filtering. |
