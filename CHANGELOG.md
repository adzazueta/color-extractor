# @adzazueta/color-extractor

## 0.2.0

### Added

- `extractPalette()` — neutral observed-color extraction (root, browser, Node)
- `extractPaletteFromImageData()` — browser neutral extraction from `ImageData`
- `extractPaletteFromPixels()` — core neutral extraction from pixel buffers
- Neutral result types: `ExtractPaletteResult`, `ExtractedSwatch`, `PaletteRankings`, `SwatchId`, `RgbColor`, `HslColor`, `LabColor`, `ExtractionDecoder`, `ExtractionAlgorithm`
- Neutral option types: `ExtractPaletteOptions`, `BrowserExtractPaletteOptions`, `NodeExtractPaletteOptions`, `CoreExtractPaletteOptions` with `sampling`, `filtering`, `result`, `advanced` groups
- `resolveNeutralOptions()` — runtime-specific option resolver
- `normalizePalette()` — candidate normalization, scoring, ranking, deduplication
- `PixelInput` type for `extractPaletteFromPixels` with `channels: 3 | 4`
- Error codes: `COLOR_EXTRACTOR_INVALID_OPTIONS`, `COLOR_EXTRACTOR_ABORTED`
- `PalettePixelInput`, `BrowserExtractPaletteInput`, `NodeExtractPaletteInput` types

### Deprecated

- `extractColors()` — use `extractPalette()` instead. Will be removed in 0.4.0.
- `extractColorsFromPixels()` — use `extractPaletteFromPixels()` instead. Will be removed in 0.4.0.
- `extractColorsFromImageData()` — use `extractPaletteFromImageData()` (browser) or `extractPaletteFromPixels()` (core) instead. Will be removed in 0.4.0.
- Legacy option groups (`sampleSize`, `paletteSize`, `accents`, `kmeans`, `primary`, `secondary`, `scoring`, `output`, `lightness`) are rejected by `extractPalette()` with `COLOR_EXTRACTOR_INVALID_OPTIONS`.

### Changed

- `sampleSize` → `sampling.maxDimension`
- `paletteSize` → `result.maxColors`
- `kmeans.clusters` → `advanced.labKmeans.clusters` (default: `max(8, maxColors)`)
- `kmeans.iterations` → `advanced.labKmeans.iterations`
- `output.includeHsl` → `result.includeHsl` (default: `false`)
- `scoring.chromaFloor` → `advanced.perceptualRanking.chromaFloor`
- `scoring.grayPenalty` → `advanced.perceptualRanking.lowChromaPenalty`
- Result is always the full `ExtractPaletteResult` shape — no opt-in flags needed
- Lab, chroma, population, proportion, and score are always included in swatches
- Metadata is always returned

### Compatibility

- Legacy `extractColors` family remains callable through 0.3.x with unchanged behavior
- Legacy option groups continue to work when passed to `extractColors()`
- `RGB`, `HSL`, `Lab` type aliases are preserved (scheduled for removal in 0.4.0)
- All existing 0.1.x exports remain available

### Known limitations

- Lab K-means is the only clustering algorithm (no MMCQ)
- No role assignment — every swatch is an observed color with no semantic label
- No generated or adjusted colors (harmony fallback, lightness adjustment)
- No public ranking helper — use the `Map` pattern in consumer code
- Cancellation granularity is between synchronous pipeline stages, not inside K-means iterations
- Browser and Node decoders may produce slightly different pixel values from the same image

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
