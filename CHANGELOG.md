# @adzazueta/color-extractor

## 0.4.0

### Minor Changes

- 7c09d7b: 0.4.0 is a complete rewrite of the package, with a new API and a new result shape, so code written for 0.3 needs changes.
  
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

## 0.4.0-next.1

### Minor Changes

- cbc6a45: Add perceptual mode, the default: it orders colors by how much they stand out (their colorfulness and their contrast with the rest of the image, reduced for colors under 2% coverage), and its `score` is relative to the first color. Both modes find the same colors, with the same coverage and positions. Population mode is unchanged.
- b624586: Perceptual mode: after the first color, a color close to one already placed moves down, so the first colors are different. The first color never changes, and `score` is the color's score when it was placed, relative to the first, so it never increases. Population mode is unchanged, and `algorithmVersion` is "3".

## 0.4.0-next.0

### Minor Changes

- 982619d: Add the public API types: `Mode`, `PixelInput`, `ExtractionOptions`, `AsyncExtractionOptions`, `ExtractedColor`, and `ExtractionResult`.
- ee3a76d: Add `extractColorsFromPixels` (core, synchronous) with population mode. Until perceptual mode exists, `perceptual` orders by area like `population` (`algorithmVersion` "1-population-only").
- babde94: 0.4.0 is a complete rewrite of the package. It has a new API and a new result shape, so code written for 0.3 needs changes. The migration guide will be published with 0.4.0.
- 1497ca3: Add `ColorExtractorError`, the single error type, with a `code` that identifies each failure.
- 14064dc: Add `extractColors` for files, bytes, Blobs, and URLs (root, `/node`, `/browser`) and a pixel-only async `extractColors` in `/core`.

## 0.3.0

### Minor Changes

- 7918a8d: - Rename neutral API family from `extractPalette` to `extractColors`: `extractColors`, `extractColorsFromPixels`, `extractColorsFromImageData`
  - Remove transitional `extractPalette` API and all legacy role-based API: `extractPalette`, `extractPaletteFromPixels`, `extractPaletteFromImageData`, `ExtractedColor`, `ExtractedSwatch`, `SwatchId`, `DEFAULT_OPTIONS`, `resolveOptions`, `ResolvedOptions`
  - Remove legacy role modules: `role.ts`, `options.ts`, `output.ts`, `types.ts`, `result.ts`, `defaults.ts`, `legacy/adapter.ts`, `legacy/cluster.ts`
  - Remove internal `swatch` terminology from all source and test code
  - Result shape is `{ colors, rankings, metadata }` with no semantic role assignment
  - Reduce public export surface: low-level implementation helpers (color conversion, filtering, sampling, pixel normalization, browser decoder/sampling/detection, resolved-internal option types) removed from entrypoint barrels
  - Rewrite `scripts/smoke.mjs` for stable `extractColors` API
  - Rewrite all fixtures (browser, node, core, typescript) to use `extractColors`
  - Add tarball lexical scan for legacy name detection
  - Update README to remove legacy API deprecation section, `Swatches` terminology, and legacy entrypoint references
  - Add public-surface audit artifact (public-surface.json) and whitelist verification per entrypoint
  - Add declaration map (.js.map) scanning to verify-fixtures
  - Add post-publish verification step in release workflow

## 0.2.0-next.1

### Minor Changes

- 38a9969: - Publish comparison report: Lab K-means versus MMCQ extraction
  - Register MMCQ in algorithm registry alongside Lab K-means
  - Normalize MMCQ output into neutral observed swatches
  - Add deterministic MMCQ (Median Cut Quantization) core algorithm
  - Build benchmark corpus and comparison harness for algorithm evaluation
  - Add algorithm selector with algorithm-aware metadata in extraction results
  - Refactor Lab K-means behind the new contract
  - Define internal neutral palette algorithm contract

## 0.2.0-next.0

### Minor Changes

- ac0e4f7: - 8275a1a: nearest-neighbor and observed-RGB isolation for neutral pipeline — useObservedRgb flag in runLabKmeans (legacy path uses first-assigned pixel, neutral searches nearest observed pixel); smooth param for canvas sampling (defaults true, neutral passes false); kernel param for Sharp resize (neutral passes 'nearest', legacy defaults to lanczos3); software nearestNeighborRGBA downsampler for ImageData without OffscreenCanvas; non-integral resize ratio pixel convention
  - 8275a1a: abort cancellation robustness — checkAborted always throws COLOR_EXTRACTOR_ABORTED regardless of signal.reason; Sharp abort checkpoints after loadSharp/metadata/toBuffer with pipeline destruction; createImageBitmap race against abort promise with late bitmap cleanup; abort listener cleanup in finally blocks across redirects/wireSignal/body-read paths; tests for pre-aborted and in-flight abort with arbitrary string and ColorExtractorError reasons across browser decode, node decode, redirects, and core extraction
  - 8275a1a: SSRF and option validation hardening — ownUnknown() with Object.create(null) strips inherited properties from all option groups (remote, decode, advanced, sampling, filtering, result); assertPlainObject at every nested group level; expanded isPrivateIPv4/isPrivateIPv6 coverage (multicast, site-local, NAT64-embedded, IPv4-compatible IPv6); allowedProtocols deep copy at resolution time; pickRuntimeGroups Object.hasOwn + Object.create(null)
  - 8275a1a: test hardening — ImageData downsampling without OffscreenCanvas (nearest-neighbor, alpha preservation, input immutability, non-integral ratio, invalid sampleSize); extractPaletteFromImageData metadata test; Node extractPalette e2e test (Buffer input, Sharp decoder); Object.prototype pollution regression tests for remote/decode/advanced/labKmeans/perceptualRanking; allowedProtocols mutation isolation test; abort-with-arbitrary-reason tests across all paths; HTTP client Host header assertion; IP range edge cases; package exports restructured to nested conditions (browser/node/default with types); type-level algorithmDetails in ExtractionMetadata; unused import cleanup (kmeans)
  - b4dd99e: document neutral API migration — rewrite README.md with neutral API, create MIGRATION.md with complete 0.1.x→0.2 mapping
  - dc9d54d: implement extractPalette public entrypoints — extractPalette (root/browser/node), extractPaletteFromImageData (browser), extractPaletteFromPixels (core) with PalettePixelInput type (channels 3|4), deprecate legacy extractColors family with TSDoc annotations
  - 160bd26: implement normalizePalette for neutral swatch normalization — validation, RGB canonicalization, deduplication, CIELAB chroma-weighted scoring with low-chroma penalty, score normalization, maxColors selection, perceptual/population/chroma rankings, extraction metadata, cancellation checkpoints
  - 24cff37: decouple Lab K-means candidates from role scoring — create src/core/algorithms/lab-kmeans/ module with types, initialize, assign, update, run; legacy adapter at src/core/legacy/
  - aa4db9c: add neutral options types and resolver — sampling, filtering, result, advanced.labKmeans, advanced.perceptualRanking groups with runtime-specific browser/node/core variants and COLORS_EXTRACTOR_INVALID_OPTIONS validation
  - a27603e: add neutral palette result and swatch types — ExtractedSwatch, PaletteRankings, ExtractPaletteResult, ExtractionMetadata, RgbColor, HslColor, LabColor, SwatchId, ExtractionRuntime, ExtractionDecoder, ExtractionAlgorithm

## 0.1.2

### Patch Changes

- 678b053: - 92454ec: Synchronize package version with exported runtime metadata and add CI check-version step
- 59461fb: Add version synchronization tests
- 672fb2c: Define automated build-warning policy for tsdown externalized dependencies
- 10f01a6: Remove stale repository docs directory
- 9da7952: Add public contribution and repository-governance guidance (CONTRIBUTING.md)
- 65a156f: Add packed-tarball browser, Node, and core consumer verification fixtures
- 2e10643: Remove color-engine domain terminology from CONTRIBUTING.md and package description
- c831b39: Remove color-engine domain terms from README subtitle

## 0.1.1

### Patch Changes

- 7fe799e: Separate internal and public documentation
