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
    AnimatedHandling,
    ColorExtractorErrorCode,
    ColorRole,
    ColorSource,
    DecodeOptions,
    ExtractColorsOptions,
    ExtractColorsResult,
    ExtractedColor,
    ExtractionMetadata,
    FilteringOptions,
    HSL,
    KmeansOptions,
    Lab,
    LightnessOptions,
    MinimalExtractColorsResult,
    OutputOptions,
    PrimaryOptions,
    PrimaryPreset,
    RemoteOptions,
    RGB,
    ScoringOptions,
    SecondaryFallbackMode,
    SecondaryOptions,
    SvgHandling,
} from './core/index.js';
export {
    ColorExtractorError,
    DEFAULT_OPTIONS,
    type ResolvedOptions,
    resolveOptions,
} from './core/index.js';
