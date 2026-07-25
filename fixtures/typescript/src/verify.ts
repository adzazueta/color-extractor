// === POSITIVE: stable API imports must compile ===

import { extractColor } from '@adzazueta/color-extractor'
import { extractColor as nodeExtract } from '@adzazueta/color-extractor/node'
import { extractColorFromImageData } from '@adzazueta/color-extractor/browser'
import { extractColorFromPixels } from '@adzazueta/color-extractor/core'
import {
    ColorExtractorError,
    VERSION,
    DEFAULT_NEUTRAL_OPTIONS,
    COLOR_EXTRACTOR_ERROR_CODES,
} from '@adzazueta/color-extractor'

import type {
    ExtractColorResult,
    ObservedColor,
    ColorId,
    RgbColor,
    HslColor,
    LabColor,
    PaletteRankings,
    ExtractionAlgorithm,
    ExtractionRuntime,
    ExtractionDecoder,
    BaseExtractColorOptions,
    ExtractColorOptions,
    AdvancedExtractionOptions,
    LabKmeansOptions,
    SamplingOptions,
    ResultOptions,
    PerceptualRankingOptions,
    ColorExtractorErrorCode,
    ExtractionMetadata,
} from '@adzazueta/color-extractor'

import type { NodeExtractColorOptions, NodeDecodeOptions, NodeRemoteOptions, NodeExtractColorInput } from '@adzazueta/color-extractor/node'
import type { BrowserExtractColorOptions, BrowserDecodeOptions, BrowserExtractColorInput } from '@adzazueta/color-extractor/browser'
import type { CoreExtractColorOptions, ColorPixelInput, FilterCriteria } from '@adzazueta/color-extractor/core'

// Verify types are usable in annotations
declare const _result: ExtractColorResult
declare const _color: ObservedColor
const _id: ColorId = 'color-a85f46'
const _rgb: RgbColor = { r: 0, g: 0, b: 0 }
const _hsl: HslColor = { h: 0, s: 0, l: 0 }
const _lab: LabColor = { L: 0, a: 0, b: 0 }
const _algo: ExtractionAlgorithm = 'lab-kmeans'
const _runtime: ExtractionRuntime = 'core'
const _decoder: ExtractionDecoder = 'pixels'

// === NEGATIVE: removed legacy API imports must fail under @ts-expect-error ===

// @ts-expect-error — extractColors was removed in 0.3
import { extractColors as _re1 } from '@adzazueta/color-extractor'

// @ts-expect-error — extractPalette was removed in 0.3
import { extractPalette as _re3 } from '@adzazueta/color-extractor'

// @ts-expect-error — DEFAULT_OPTIONS was removed in 0.3
import { DEFAULT_OPTIONS as _re4 } from '@adzazueta/color-extractor'

// @ts-expect-error — resolveOptions was removed in 0.3
import { resolveOptions as _re5 } from '@adzazueta/color-extractor'

// @ts-expect-error — ExtractedSwatch was removed in 0.3
import type { ExtractedSwatch } from '@adzazueta/color-extractor'

// @ts-expect-error — ExtractedColor was removed in 0.3
import type { ExtractedColor } from '@adzazueta/color-extractor'

// @ts-expect-error — SwatchId was removed in 0.3
import type { SwatchId } from '@adzazueta/color-extractor'

// @ts-expect-error — extractColorsFromPixels was removed in 0.3
import { extractColorsFromPixels as _reLegacy1 } from '@adzazueta/color-extractor/core'

// @ts-expect-error — extractColorsFromImageData was removed in 0.3
import { extractColorsFromImageData as _reLegacy2 } from '@adzazueta/color-extractor/browser'

// @ts-expect-error — extractPaletteFromPixels was removed in 0.3
import { extractPaletteFromPixels as _reLegacy3 } from '@adzazueta/color-extractor/core'

// @ts-expect-error — extractPaletteFromImageData was removed in 0.3
import { extractPaletteFromImageData as _reLegacy4 } from '@adzazueta/color-extractor/browser'

async function main() {
    const result: ExtractColorResult = await extractColor('test.jpg')
    console.log(result.colors[0]?.id)
}

main().catch(console.error)
