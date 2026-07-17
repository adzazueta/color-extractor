# Configuration

Every option is optional. Defaults favor useful visual output and bounded resource use.

## Common options

```ts
await extractColors(image, {
  sampleSize: 150,
  paletteSize: 5,
  accents: 0,
  primary: { preset: 'strict' },
  secondary: { fallback: 'harmony' },
  output: { includePalette: true },
})
```

| Option | Default | Purpose |
| --- | --- | --- |
| `sampleSize` | `150` | Maximum side length of the sampled grid. |
| `paletteSize` | `5` | Palette entries when palette output is enabled. |
| `accents` | `0` | Accent entries when accent output is enabled. |
| `primary.preset` | `'strict'` | Primary selection: `strict`, `balanced`, `vibrant`, or `dominant`. |
| `secondary.fallback` | `'harmony'` | Secondary fallback: `harmony`, `nearest`, or `null`. |

## Output

```ts
output: {
  includePalette: false,
  includeAccents: false,
  includeMetadata: false,
  includeLab: false,
  includeHsl: true,
  includeScores: false,
}
```

## Filtering and scoring

| Group | Options |
| --- | --- |
| `filtering` | `alphaThreshold`, `minBrightness`, `maxBrightness`, `minSaturation` |
| `kmeans` | `clusters`, `iterations` |
| `scoring` | `chromaFloor`, `grayPenalty` |
| `lightness` | `enforceGap`, `minGap` |
| `secondary` | `fallback`, `contrastMinDE`, `harmonyFallbackDeg` |

These settings are intended for visual tuning. Start with output options before changing algorithm settings.

## Remote URLs

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

`timeoutMs` and `maxBytes` apply to browser and Node URL inputs. Redirects, protocols, private-network blocking, and content-type validation apply to Node. See [security](security.md) before relaxing Node URL defaults.

## Decoding

```ts
decode: {
  maxPixels: 25_000_000,
  animated: 'first-frame',
  svg: 'disabled-in-node',
  respectOrientation: true,
  normalizeColorProfile: true,
}
```

`maxPixels` applies to browser and Node results. The remaining decode options apply to the Node `sharp` decoder. Browser pixel limits are checked after browser decoding; see [runtime support](runtime-support.md#browser-limits).
