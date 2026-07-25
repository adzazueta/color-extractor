---
"@adzazueta/color-extractor": minor
---

- Rename neutral API family from `extractPalette` to `extractColors`: `extractColors`, `extractColorsFromPixels`, `extractColorsFromImageData`
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
