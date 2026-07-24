import type { BrowserExtractColorsInput } from './browser/types.js';
import type {
    BrowserExtractPaletteOptions,
    ExtractColorsOptions,
    ExtractColorsResult,
    ExtractPaletteResult,
    NodeExtractPaletteOptions,
} from './core/index.js';

export { VERSION } from './generated/version.js';

export type RootExtractColorsInput =
    | BrowserExtractColorsInput
    | Uint8Array
    | ArrayBuffer
    | string;

export type RootExtractPaletteInput =
    | BrowserExtractColorsInput
    | Uint8Array
    | ArrayBuffer
    | string;

function isNodeRuntime(): boolean {
    return (
        typeof process !== 'undefined' &&
        process.versions !== undefined &&
        typeof process.versions.node === 'string'
    );
}

/** @deprecated Use `extractPalette` instead. Semantic role extraction moved out of the extractor in 0.2.0. See the migration guide in the README. Will be removed in 0.3.0. */
export async function extractColors(
    input: RootExtractColorsInput,
    options?: ExtractColorsOptions,
): Promise<ExtractColorsResult> {
    if (isNodeRuntime()) {
        const { extractColors: extractNode } = await import('./node/index.js');
        return extractNode(input as string | Uint8Array | ArrayBuffer, options);
    }
    const { extractColors: extractBrowser } = await import(
        './browser/index.js'
    );
    return extractBrowser(input as BrowserExtractColorsInput, options);
}

export function extractPalette(
    input: BrowserExtractColorsInput,
    options?: BrowserExtractPaletteOptions,
): Promise<ExtractPaletteResult>;
export function extractPalette(
    input: Uint8Array | ArrayBuffer | string,
    options?: NodeExtractPaletteOptions,
): Promise<ExtractPaletteResult>;
export async function extractPalette(
    input: RootExtractPaletteInput,
    options?: BrowserExtractPaletteOptions | NodeExtractPaletteOptions,
): Promise<ExtractPaletteResult> {
    if (isNodeRuntime()) {
        const { extractPalette: extractNode } = await import('./node/index.js');
        return extractNode(
            input as string | Uint8Array | ArrayBuffer,
            options as NodeExtractPaletteOptions,
        );
    }
    const { extractPalette: extractBrowser } = await import(
        './browser/index.js'
    );
    return extractBrowser(
        input as BrowserExtractColorsInput,
        options as BrowserExtractPaletteOptions,
    );
}

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
    ExtractionMetadata,
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
    DEFAULT_NEUTRAL_OPTIONS,
    DEFAULT_OPTIONS,
    type ResolvedOptions,
    resolveOptions,
} from './core/index.js';
