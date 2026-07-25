export { VERSION } from '../generated/version.js';

export {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
    type ColorExtractorErrorCode,
} from './errors.js';
export { type ColorPixelInput, extractColorsFromPixels } from './extract.js';

export type {
    AdvancedExtractionOptions,
    BaseExtractColorOptions,
    CoreExtractColorOptions,
    LabKmeansOptions,
    PerceptualRankingOptions,
    ResultOptions,
    SamplingOptions,
} from './neutral-options.js';
export { DEFAULT_NEUTRAL_OPTIONS } from './neutral-options.js';

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
