import type { BrowserExtractColorInput } from './browser/types.js';
import type { ExtractColorResult } from './core/index.js';
import type {
    BrowserExtractColorOptions,
    NodeExtractColorOptions,
} from './core/neutral-options.js';

export { VERSION } from './generated/version.js';

export type RootExtractColorInput =
    | BrowserExtractColorInput
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

export function extractColors(
    input: BrowserExtractColorInput,
    options?: BrowserExtractColorOptions,
): Promise<ExtractColorResult>;
export function extractColors(
    input: Uint8Array | ArrayBuffer | string,
    options?: NodeExtractColorOptions,
): Promise<ExtractColorResult>;
export async function extractColors(
    input: RootExtractColorInput,
    options?: BrowserExtractColorOptions | NodeExtractColorOptions,
): Promise<ExtractColorResult> {
    if (isNodeRuntime()) {
        const { extractColors: extractNode } = await import('./node/index.js');
        return extractNode(
            input as string | Uint8Array | ArrayBuffer,
            options as NodeExtractColorOptions,
        );
    }
    const { extractColors: extractBrowser } = await import(
        './browser/index.js'
    );
    return extractBrowser(
        input as BrowserExtractColorInput,
        options as BrowserExtractColorOptions,
    );
}

export type {
    ColorExtractorErrorCode,
    ColorId,
    ColorPixelInput,
    CoreExtractColorOptions,
    ExtractColorResult,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionMetadata,
    ExtractionRuntime,
    HslColor,
    LabColor,
    LabKmeansOptions,
    ObservedColor,
    PaletteRankings,
    PerceptualRankingOptions,
    RgbColor,
} from './core/index.js';
export {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
    DEFAULT_NEUTRAL_OPTIONS,
} from './core/index.js';
export type {
    AdvancedExtractionOptions,
    BaseExtractColorOptions,
    BrowserDecodeOptions,
    BrowserExtractColorOptions,
    NodeDecodeOptions,
    NodeExtractColorOptions,
    NodeRemoteOptions,
    ResultOptions,
    SamplingOptions,
} from './core/neutral-options.js';
