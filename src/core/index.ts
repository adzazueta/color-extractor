export { VERSION } from '../generated/version.js';
export {
    chromaFromLab,
    circularHueDistance,
    hueFromLab,
    normalizeHue,
} from './color/chroma-hue.js';
export { rgbToHex } from './color/hex.js';
export { hslToRgb, rgbToHsl } from './color/hsl.js';
export { labDistance, labSquaredDistance, xyzToLab } from './color/lab.js';
export { srgbByteToLinear, srgbToLinear } from './color/srgb.js';
export { linearRgbToXyz } from './color/xyz.js';
export {
    DEFAULT_OPTIONS,
    type ResolvedOptions,
    resolveOptions,
} from './defaults.js';
export {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
    type ColorExtractorErrorCode,
} from './errors.js';
export {
    type ColorPixelInput,
    extractColorFromPixels,
    /** @deprecated Use extractColorFromPixels instead */
    extractColorsFromImageData,
    /** @deprecated Use extractColorFromPixels instead */
    extractColorsFromPixels,
    type ImageDataLike,
    runNeutralColorPipeline,
} from './extract.js';
export {
    type FilterCriteria,
    filterPixels,
    passesFilter,
    validateFilterCriteria,
} from './filter.js';

export type {
    AdvancedExtractionOptions,
    BaseExtractColorOptions,
    BrowserDecodeOptions,
    BrowserExtractColorOptions,
    CoreExtractColorOptions,
    ExtractColorOptions,
    LabKmeansOptions,
    NodeDecodeOptions,
    NodeExtractColorOptions,
    NodeRemoteOptions,
    PerceptualRankingOptions,
    ResolvedBrowserExtractColorOptions,
    ResolvedCoreExtractColorOptions,
    ResolvedNodeExtractColorOptions,
    ResultOptions,
    SamplingOptions,
} from './neutral-options.js';
export {
    DEFAULT_NEUTRAL_OPTIONS,
    resolveNeutralOptions,
} from './neutral-options.js';

export type {
    ColorId,
    ExtractColorResult,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionMetadata,
    ExtractionRuntime,
    HslColor,
    LabColor,
    ObservedColor,
    PaletteRankings,
    RgbColor,
} from './palette-types.js';
export {
    type NormalizedPixels,
    normalizePixels,
    type Pixel,
} from './pixels.js';
export {
    convertRgbSamplesToLab,
    type LabSample,
    sampleSquareGrid,
} from './sample.js';
export type { PixelData, PixelInput } from './validation.js';
