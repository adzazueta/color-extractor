import type { BrowserExtractColorInput } from './browser/types.js';
import type {
    BrowserExtractColorOptions,
    ExtractColorResult,
    NodeExtractColorOptions,
} from './core/index.js';

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

export function extractColor(
    input: BrowserExtractColorInput,
    options?: BrowserExtractColorOptions,
): Promise<ExtractColorResult>;
export function extractColor(
    input: Uint8Array | ArrayBuffer | string,
    options?: NodeExtractColorOptions,
): Promise<ExtractColorResult>;
export async function extractColor(
    input: RootExtractColorInput,
    options?: BrowserExtractColorOptions | NodeExtractColorOptions,
): Promise<ExtractColorResult> {
    if (isNodeRuntime()) {
        const { extractColor: extractNode } = await import('./node/index.js');
        return extractNode(
            input as string | Uint8Array | ArrayBuffer,
            options as NodeExtractColorOptions,
        );
    }
    const { extractColor: extractBrowser } = await import('./browser/index.js');
    return extractBrowser(
        input as BrowserExtractColorInput,
        options as BrowserExtractColorOptions,
    );
}

export type {
    AdvancedExtractionOptions,
    BaseExtractColorOptions,
    BrowserDecodeOptions,
    BrowserExtractColorOptions,
    ColorExtractorErrorCode,
    ColorId,
    ColorPixelInput,
    CoreExtractColorOptions,
    ExtractColorOptions,
    ExtractColorResult,
    ExtractionAlgorithm,
    ExtractionDecoder,
    ExtractionMetadata,
    ExtractionRuntime,
    FilterCriteria,
    HslColor,
    LabColor,
    LabKmeansOptions,
    NodeDecodeOptions,
    NodeExtractColorOptions,
    NodeRemoteOptions,
    ObservedColor,
    PaletteRankings,
    PerceptualRankingOptions,
    ResultOptions,
    RgbColor,
    SamplingOptions,
} from './core/index.js';
export {
    ColorExtractorError,
    DEFAULT_NEUTRAL_OPTIONS,
    DEFAULT_OPTIONS,
    type ResolvedOptions,
    resolveOptions,
} from './core/index.js';
