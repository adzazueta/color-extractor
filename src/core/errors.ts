/**
 * Codes that identify each failure reported by `ColorExtractorError`.
 */
export type ColorExtractorErrorCode =
  | "INVALID_OPTIONS"
  | "INVALID_INPUT"
  | "INPUT_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "FETCH_FAILED"
  | "READ_FAILED"
  | "DECODER_MISSING"
  | "ABORTED"
  | "PROCESSING_FAILED";

/**
 * The single error type thrown by the package. Check `code` to tell the failures apart.
 */
export class ColorExtractorError extends Error {
  override readonly name = "ColorExtractorError";

  /** Identifies the failure. */
  readonly code: ColorExtractorErrorCode;

  /**
   * HTTP status code of the server response. Set only for `FETCH_FAILED` when the server
   * responded with an HTTP error; absent otherwise.
   */
  declare readonly status?: number;

  /**
   * @param code - The failure code.
   * @param message - A human-readable description of the failure.
   * @param options - The underlying `cause`, and the HTTP `status` for `FETCH_FAILED`.
   */
  constructor(
    code: ColorExtractorErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(
      message,
      options !== undefined && "cause" in options ? { cause: options.cause } : undefined,
    );
    this.code = code;
    if (options?.status !== undefined) {
      this.status = options.status;
    }
  }
}
