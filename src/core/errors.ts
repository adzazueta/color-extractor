export const COLOR_EXTRACTOR_ERROR_CODES = [
    'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
    'COLOR_EXTRACTOR_DECODE_FAILED',
    'COLOR_EXTRACTOR_CORS_ERROR',
    'COLOR_EXTRACTOR_FETCH_FAILED',
    'COLOR_EXTRACTOR_INPUT_TOO_LARGE',
    'COLOR_EXTRACTOR_IMAGE_TOO_LARGE',
    'COLOR_EXTRACTOR_TIMEOUT',
    'COLOR_EXTRACTOR_UNSAFE_URL',
    'COLOR_EXTRACTOR_UNSUPPORTED_FORMAT',
    'COLOR_EXTRACTOR_SHARP_MISSING',
    'COLOR_EXTRACTOR_NO_VALID_PIXELS',
    'COLOR_EXTRACTOR_INVALID_OPTIONS',
    'COLOR_EXTRACTOR_ABORTED',
] as const;

export type ColorExtractorErrorCode =
    (typeof COLOR_EXTRACTOR_ERROR_CODES)[number];

export class ColorExtractorError extends Error {
    readonly code: ColorExtractorErrorCode;

    constructor(
        code: ColorExtractorErrorCode,
        message: string,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = 'ColorExtractorError';
        this.code = code;
    }
}

export function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'Operation was aborted.',
            { cause: signal.reason },
        );
    }
}
