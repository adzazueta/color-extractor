# Migration guide: 0.1.x -> 0.3.x

## Summary

`0.2.0` introduced a neutral color API (`extractColor`) that returns observed-color evidence without semantic role assignment. In `0.3.0`, the legacy role-based API (`extractColors`) and its aliases are removed.

## Quick migration

### Extractor-only consumer

**Before (0.1.x):**

```ts
import { extractColors } from '@adzazueta/color-extractor'

const result = await extractColors(image)
console.log(result.primary.hex, result.secondary?.hex)
```

**After (0.3.x):**

```ts
import { extractColor } from '@adzazueta/color-extractor'

const result = await extractColor(image)
const topId = result.rankings.perceptual[0]
const top = result.colors.find(s => s.id === topId)
console.log(top?.hex)
```

The result no longer assigns a semantic role (primary/secondary). Use `result.rankings.perceptual` to select the perceptually dominant color.

### Core consumer

**Before (0.1.x):**

```ts
import { extractColorsFromPixels } from '@adzazueta/color-extractor/core'

const result = await extractColorsFromPixels({
  data: new Uint8Array([/* RGBA bytes */]),
  width: 800,
  height: 600,
})
```

**After (0.3.x):**

```ts
import { extractColorFromPixels } from '@adzazueta/color-extractor/core'

const result = await extractColorFromPixels({
  data: new Uint8Array([/* RGB or RGBA bytes */]),
  width: 800,
  height: 600,
  channels: 4,
})
```

The new signature requires an explicit `channels` field (3 or 4) and does not allow `number[]` data.

### Engine consumer (illustrative)

If you previously relied on `extractColors` for primary/secondary/accent selection, compose the extractor with a separate engine:

```ts
import { extractColor } from '@adzazueta/color-extractor'

const extracted = await extractColor(image)
const theme = colorEngineAdapter(extracted)  // adapter name defined by @adzazueta/color-engine
```

The extractor no longer assigns semantic roles. The engine adapter is not part of this package.

## Function mapping

| 0.1.x (removed) | 0.3.x replacement | Notes |
| --- | --- | --- |
| `extractColors(input, options?)` | `extractColor(input, options?)` | Returns `ExtractColorResult` instead of `ExtractColorsResult`. |
| `extractColorsFromPixels(input, options?)` | `extractColorFromPixels(input, options?)` | Requires `channels: 3 \| 4`; no `number[]` data. |
| `extractColorsFromImageData(imageData, options?)` | `extractColorFromImageData(imageData, options?)` — browser only, or `extractColorFromPixels(..., { channels: 4 })` | |

## Option mapping

| 0.1.x option | 0.3.x option | Notes |
| --- | --- | --- |
| `sampleSize` | `sampling.maxDimension` | Same default (150). |
| `paletteSize` | `result.maxColors` | Same default (5). |
| `kmeans.clusters` | `advanced.labKmeans.clusters` | Default changed from `5` to `max(8, maxColors)`. |
| `kmeans.iterations` | `advanced.labKmeans.iterations` | Same default (7). |
| `filtering.*` | `filtering.*` | Unchanged. |
| `output.includeHsl` | `result.includeHsl` | Default changed from `true` to `false`. |
| `scoring.chromaFloor` | `advanced.perceptualRanking.chromaFloor` | Same default (12). |
| `scoring.grayPenalty` | `advanced.perceptualRanking.lowChromaPenalty` | Same default (0.1). |
| `output.includeLab` | Removed | Lab is always included in color data. |
| `output.includeScores` | Removed | Score, chroma, population, proportion are always included. |
| `output.includePalette` | Removed | Swatches are always returned via `result.colors`. |
| `output.includeAccents` | Removed | No accent concept in neutral API. |
| `output.includeMetadata` | Removed | Metadata is always returned. |
| `primary.*`, `secondary.*`, `scoring.*` (except chromaFloor/penalty), `lightness.*`, `accents` | No extractor equivalent | These are semantic role/engine concerns. See engine boundary below. |

## Type mapping

| 0.1.x type | 0.3.x type | Notes |
| --- | --- | --- |
| `ExtractColorsResult` | `ExtractColorResult` | New shape: `{ colors, rankings, metadata }`. |
| `MinimalExtractColorsResult` | — | Removed. Neutral result is always the full shape. |
| `ExtractedColor` | `ObservedColor` | New shape: `{ id, hex, rgb, lab, chroma, population, proportion, score, hsl? }`. |
| `RGB` | `RgbColor` | `{ r, g, b }` — same shape, new type name. |
| `HSL` | `HslColor` | `{ h, s, l }` — same shape, new type name. |
| `Lab` | `LabColor` | `{ L, a, b }` — same shape, new type name. |
| `ExtractionMetadata` | `ExtractionMetadata` | Expanded: new fields `algorithm`, `algorithmVersion`, `candidateCount`, `returnedColors`, `returnedPopulation`, `coverage`, `algorithmDetails`. |
| — | `PaletteRankings` | New: three ranking strategies. |
| — | `ColorId` | New: branded string type `"color-{hex}"`. |

## Removed semantic concerns

These were part of the `0.1.x` role-based API. They do not exist in `0.3.x` and are owned by `@adzazueta/color-engine`:

- `primary` — primary color selection
- `secondary` — secondary color with fallback
- `accents` — accent color extraction
- `role` — color role labels (`'primary' | 'secondary' | 'accent' | 'palette'`)
- `source` — origin labels (`'cluster' | 'fallback' | 'adjusted'`)
- Harmony fallback generation
- Nearest-cluster secondary policy
- Lightness gap enforcement
- `primary.preset` selection strategies
- `secondary.fallback` policy

## Result shape comparison

### 0.1.x (`extractColors`)

```ts
{
  primary: { hex, rgb, hsl, role, source, lab?, chroma?, population?, proportion?, score? }
  secondary: { hex, rgb, hsl, role, source, lab?, chroma?, population?, proportion?, score? } | null
  accents?: { hex, rgb, hsl, role, source, ... }[]
  palette?: { hex, rgb, hsl, role, source, ... }[]
  metadata?: { sampleSize, sampledPixels, validPixels, clusters, iterations, runtime }
}
```

Most fields are opt-in via `output` flags. Role and source are always present.

### 0.3.x (`extractColor`)

```ts
{
  colors: [{ id, hex, rgb, lab, chroma, population, proportion, score, hsl? }]
  rankings: { perceptual: ColorId[], population: ColorId[], chroma: ColorId[] }
  metadata: { algorithm, algorithmVersion, packageVersion, runtime, decoder, sampledWidth, sampledHeight, sampledPixels, validPixels, candidateCount, returnedColors, returnedPopulation, coverage, algorithmDetails }
}
```

All fields are always present with no opt-in flags. No semantic roles, no source labels, no generated colors.

## Deprecation timeline

| Version | Status |
| --- | --- |
| 0.2.0 | Neutral API introduced alongside the legacy API. |
| 0.2.x | Neutral API stabilized; legacy API was deprecated. |
| 0.3.0 | Legacy API removed. `RGB`, `HSL`, `Lab` type aliases removed. |
