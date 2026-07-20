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
    extractColorsFromImageData,
    extractColorsFromPixels,
    type ImageDataLike,
} from './extract.js';
export {
    type FilterCriteria,
    filterPixels,
    passesFilter,
    validateFilterCriteria,
} from './filter.js';

export type {
    AdvancedExtractionOptions,
    BaseExtractPaletteOptions,
    BrowserDecodeOptions,
    BrowserExtractPaletteOptions,
    CoreExtractPaletteOptions,
    ExtractPaletteOptions,
    LabKmeansOptions,
    NodeDecodeOptions,
    NodeExtractPaletteOptions,
    NodeRemoteOptions,
    PaletteResultOptions,
    PerceptualRankingOptions,
    ResolvedBrowserExtractPaletteOptions,
    ResolvedCoreExtractPaletteOptions,
    ResolvedNodeExtractPaletteOptions,
    SamplingOptions,
} from './neutral-options.js';
export type {
    AnimatedHandling,
    DecodeOptions,
    ExtractColorsOptions,
    FilteringOptions,
    KmeansOptions,
    LightnessOptions,
    OutputOptions,
    PrimaryOptions,
    PrimaryPreset,
    RemoteOptions,
    ScoringOptions,
    SecondaryFallbackMode,
    SecondaryOptions,
    SvgHandling,
} from './options.js';
export { applyOutputFlags, type FullExtractionResult } from './output.js';
export type {
    ExtractedSwatch,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionRuntime,
    ExtractPaletteResult,
    HslColor,
    LabColor,
    PaletteRankings,
    RgbColor,
    SwatchId,
} from './palette-types.js';
export {
    type NormalizedPixels,
    normalizePixels,
    type Pixel,
} from './pixels.js';
export type {
    ExtractColorsResult,
    ExtractionMetadata,
    MinimalExtractColorsResult,
} from './result.js';
export {
    applyGrayPenalty,
    applyLightnessGap,
    type BuildPaletteOptions,
    buildHarmonyFallback,
    buildPalette,
    buildPrimaryColor,
    type ContrastFilterResult,
    contrastBoost,
    filterByContrastThreshold,
    findPrimaryIndex,
    hueWeight,
    isLowChromaCandidate,
    type RoleAssignment,
    type SelectSecondaryResult,
    scorePrimary,
    scoreSecondary,
    selectSecondary,
} from './role.js';
export {
    convertRgbSamplesToLab,
    type LabSample,
    sampleSquareGrid,
} from './sample.js';
export type {
    ColorRole,
    ColorSource,
    ExtractedColor,
    HSL,
    Lab,
    RGB,
} from './types.js';
export type { PixelData, PixelInput } from './validation.js';
