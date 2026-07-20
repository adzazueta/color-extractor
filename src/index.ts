import type { BrowserExtractColorsInput } from './browser/types.js';
import type {
    ExtractColorsOptions,
    ExtractColorsResult,
} from './core/index.js';
import type { NodeExtractColorsInput } from './node/types.js';

export { VERSION } from './generated/version.js';

export type RootExtractColorsInput =
    | BrowserExtractColorsInput
    | NodeExtractColorsInput;

export declare function extractColors(
    input: RootExtractColorsInput,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult>;

export type {
    AdvancedExtractionOptions,
    AnimatedHandling,
    BaseExtractPaletteOptions,
    BrowserDecodeOptions,
    BrowserExtractPaletteOptions,
    ColorExtractorErrorCode,
    ColorRole,
    ColorSource,
    CoreExtractPaletteOptions,
    DecodeOptions,
    ExtractColorsOptions,
    ExtractColorsResult,
    ExtractedColor,
    ExtractedSwatch,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionRuntime,
    ExtractPaletteOptions,
    ExtractPaletteResult,
    FilteringOptions,
    HSL,
    HslColor,
    KmeansOptions,
    Lab,
    LabColor,
    LabKmeansOptions,
    LightnessOptions,
    MinimalExtractColorsResult,
    NodeDecodeOptions,
    NodeExtractPaletteOptions,
    NodeRemoteOptions,
    OutputOptions,
    PaletteRankings,
    PaletteResultOptions,
    PerceptualRankingOptions,
    PrimaryOptions,
    PrimaryPreset,
    RemoteOptions,
    RGB,
    RgbColor,
    SamplingOptions,
    ScoringOptions,
    SecondaryFallbackMode,
    SecondaryOptions,
    SvgHandling,
    SwatchId,
} from './core/index.js';
export {
    ColorExtractorError,
    DEFAULT_OPTIONS,
    type ResolvedOptions,
    resolveOptions,
} from './core/index.js';
