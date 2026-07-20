---
'@adzazueta/color-extractor': minor
---

- feat(ADZ-108): add neutral palette result and swatch types — ExtractedSwatch, PaletteRankings, ExtractPaletteResult, ExtractionMetadata, RgbColor, HslColor, LabColor, SwatchId, ExtractionRuntime, ExtractionDecoder, ExtractionAlgorithm
- feat(ADZ-105): add neutral options types and resolver — sampling, filtering, result, advanced.labKmeans, advanced.perceptualRanking groups with runtime-specific browser/node/core variants and COLORS_EXTRACTOR_INVALID_OPTIONS validation
- feat(ADZ-115): decouple Lab K-means candidates from role scoring — create src/core/algorithms/lab-kmeans/ module with types, initialize, assign, update, run; legacy adapter at src/core/legacy/
- feat(ADZ-109): implement normalizePalette for neutral swatch normalization — validation, RGB canonicalization, deduplication, CIELAB chroma-weighted scoring with low-chroma penalty, score normalization, maxColors selection, perceptual/population/chroma rankings, extraction metadata, cancellation checkpoints
- feat(ADZ-107): implement extractPalette public entrypoints — extractPalette (root/browser/node), extractPaletteFromImageData (browser), extractPaletteFromPixels (core) with PalettePixelInput type (channels 3|4), deprecate legacy extractColors family with TSDoc annotations
- docs(ADZ-110): document neutral API migration — rewrite README.md with neutral API, create MIGRATION.md with complete 0.1.x→0.2 mapping
