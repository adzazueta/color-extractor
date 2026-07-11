# @adzazueta/color-extractor

ESM-only npm package for extracting perceptually meaningful **primary** and **secondary** colors from images in browser and Node.js.

Built on **CIELAB K-means with chroma-weighted palette selection**, designed to choose colors that match what the human eye reads as visually dominant.

## Quick start

```ts
import { extractColors } from '@adzazueta/color-extractor'

const { primary, secondary } = await extractColors(image)
```

Works in browser and Node through conditional exports. Runtime-specific subpaths are also available for precise type narrowing.

## Documentation

Full documentation lives in the project repository under the `docs/` directory, covering:

- Overview and design principles
- Algorithm specification
- Public API, inputs and outputs
- Configuration reference
- Package architecture
- Runtime support
- Security model
- Dependencies, build and publishing
- Testing strategy
- Glossary

## License

MIT © 2026 Alexis D. Zazueta
