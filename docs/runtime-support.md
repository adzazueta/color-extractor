# Runtime Support

## Browser

The browser adapter accepts `File`, `Blob`, URL strings, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, and `ImageData`.

```ts
import { extractColors } from '@adzazueta/color-extractor/browser'
```

URL requests follow browser CORS rules. A URL must be readable by `fetch`; tainted image, bitmap, and canvas inputs throw `COLOR_EXTRACTOR_CORS_ERROR` when pixel readback is blocked.

Browser formats depend on the platform. Common browsers support PNG, JPEG, GIF, WebP, and often AVIF. Animated inputs use their first frame.

### Browser limits

Browser APIs expose image dimensions only after decoding. `decode.maxPixels` rejects oversized images before sampling, but a highly compressible image can consume memory during decode first. Apply your own upload-size limits when processing untrusted browser files.

## Node.js

The Node adapter accepts encoded bytes, local paths, and `http:`/`https:` URLs.

```ts
import { extractColors } from '@adzazueta/color-extractor/node'
```

Node uses `sharp` for decoding. It supports common formats according to the installed `sharp` and libvips build. SVG is disabled by default. Animated images use the first frame unless `decode.animated` is changed.

## Core

The core adapter receives normalized RGBA data:

```ts
import { extractColorsFromPixels } from '@adzazueta/color-extractor/core'

await extractColorsFromPixels({
  data: rgba,
  width,
  height,
})
```

It has no image decoding or network dependencies, so it is appropriate for workers and non-standard runtimes that already have pixels.
