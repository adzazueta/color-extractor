import type { BrowserExtractColorsInput } from './browser/types.js';
import type {
    BrowserExtractPaletteOptions,
    ExtractColorsOptions,
    ExtractColorsResult,
    ExtractPaletteResult,
    NodeExtractPaletteOptions,
    PalettePixelInput,
} from './core/index.js';
import type { NodeExtractColorsInput } from './node/types.js';

export { VERSION } from './generated/version.js';

export type RootExtractColorsInput =
    | BrowserExtractColorsInput
    | NodeExtractColorsInput;

export type RootExtractPaletteInput =
    | BrowserExtractColorsInput
    | NodeExtractColorsInput;

/** @deprecated Use `extractPalette` instead. Semantic role extraction moved out of the extractor in 0.2.0. See the migration guide in the README. Will be removed in 0.4.0. */
export declare function extractColors(
    input: RootExtractColorsInput,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult>;

export declare function extractPalette(
    input: RootExtractPaletteInput,
    options?: BrowserExtractPaletteOptions | NodeExtractPaletteOptions,
): Promise<ExtractPaletteResult>;

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
    PalettePixelInput,
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
