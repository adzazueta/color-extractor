---
'@adzazueta/color-extractor': minor
---

- a27603e: add neutral palette result and swatch types — ExtractedSwatch, PaletteRankings, ExtractPaletteResult, ExtractionMetadata, RgbColor, HslColor, LabColor, SwatchId, ExtractionRuntime, ExtractionDecoder, ExtractionAlgorithm
- aa4db9c: add neutral options types and resolver — sampling, filtering, result, advanced.labKmeans, advanced.perceptualRanking groups with runtime-specific browser/node/core variants and COLORS_EXTRACTOR_INVALID_OPTIONS validation
- 24cff37: decouple Lab K-means candidates from role scoring — create src/core/algorithms/lab-kmeans/ module with types, initialize, assign, update, run; legacy adapter at src/core/legacy/
- 160bd26: implement normalizePalette for neutral swatch normalization — validation, RGB canonicalization, deduplication, CIELAB chroma-weighted scoring with low-chroma penalty, score normalization, maxColors selection, perceptual/population/chroma rankings, extraction metadata, cancellation checkpoints
- dc9d54d: implement extractPalette public entrypoints — extractPalette (root/browser/node), extractPaletteFromImageData (browser), extractPaletteFromPixels (core) with PalettePixelInput type (channels 3|4), deprecate legacy extractColors family with TSDoc annotations
- b4dd99e: document neutral API migration — rewrite README.md with neutral API, create MIGRATION.md with complete 0.1.x→0.2 mapping
