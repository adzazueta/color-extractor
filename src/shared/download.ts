import { ColorExtractorError } from "@/core/errors.js";
import { checkByteLimit, type ResolvedLimits } from "@/core/validate.js";
import { abortedError, raceAbort, throwIfAborted } from "@/shared/abort.js";

/** Settings for `downloadImage`. */
export interface DownloadOptions {
  readonly limits: ResolvedLimits;
  readonly signal?: AbortSignal | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** Browser only: page or worker origin; a different URL origin adds the CORS hint. */
  readonly pageOrigin?: string | undefined;
}

const CORS_HINT =
  " The URL is on another origin, so the likely cause is that the server does not allow cross-origin requests (CORS). A network failure gives the same error; the browser does not tell them apart.";

function cancelBody(response: unknown): void {
  try {
    const body = (response as { body?: { cancel?: () => Promise<void> } | null }).body;
    void body?.cancel?.()?.catch(() => {});
  } catch {
    // Cleanup must never replace the real error.
  }
}

function cancelReader(reader: ReadableStreamDefaultReader<unknown>, reason?: unknown): void {
  try {
    reader.cancel(reason).catch(() => {});
  } catch {
    // Cleanup must never replace the real error.
  }
}

function fetchFailed(message: string, cause?: unknown): ColorExtractorError {
  return new ColorExtractorError(
    "FETCH_FAILED",
    message,
    cause === undefined ? undefined : { cause },
  );
}

/** The error to throw for something that went wrong while awaiting I/O. */
function ioError(
  error: unknown,
  signal: AbortSignal | undefined,
  describe: () => ColorExtractorError,
): ColorExtractorError {
  if (error instanceof ColorExtractorError) {
    return error;
  }
  if (signal?.aborted === true) {
    return abortedError(signal);
  }
  return describe();
}

interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body?: ReadableStream<unknown> | null;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

function isResponseLike(value: unknown): value is ResponseLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const response = value as Partial<ResponseLike>;
  return (
    typeof response.ok === "boolean" &&
    typeof response.status === "number" &&
    typeof response.headers?.get === "function"
  );
}

function checkStatus(response: ResponseLike): void {
  if (response.ok) {
    return;
  }
  cancelBody(response);
  const { status } = response;
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    throw new ColorExtractorError(
      "FETCH_FAILED",
      `The server responded with HTTP status ${status}.`,
      {
        status,
      },
    );
  }
  throw fetchFailed(
    status === 0
      ? "The response is opaque and cannot be read."
      : "The server responded with an error.",
  );
}

function checkContentLength(response: ResponseLike, limits: ResolvedLimits): void {
  const length = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding");
  const identity = encoding === null || encoding.trim().toLowerCase() === "identity";
  if (length !== null && identity && /^\d+$/.test(length.trim())) {
    try {
      checkByteLimit(Number(length.trim()), limits);
    } catch (error) {
      cancelBody(response);
      throw error;
    }
  }
}

function join(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0] as Uint8Array;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readStream(
  stream: ReadableStream<unknown>,
  limits: ResolvedLimits,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let result: ReadableStreamReadResult<unknown>;
    try {
      result = await raceAbort(reader.read(), signal);
    } catch (error) {
      cancelReader(reader, signal?.aborted === true ? signal.reason : error);
      throw ioError(error, signal, () => fetchFailed("The download was interrupted.", error));
    }
    if (result.done) {
      return join(chunks, total);
    }
    const chunk = result.value;
    if (!(chunk instanceof Uint8Array)) {
      cancelReader(reader);
      throw fetchFailed("The response body contained data that is not bytes.");
    }
    total += chunk.byteLength;
    if (total > limits.maxBytes) {
      cancelReader(reader);
      throw new ColorExtractorError(
        "INPUT_TOO_LARGE",
        `The download exceeded the limit of ${limits.maxBytes} bytes.`,
      );
    }
    chunks.push(chunk);
  }
}

async function readBody(
  response: ResponseLike,
  limits: ResolvedLimits,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const { body } = response;
  if (body === null) {
    return new Uint8Array(0);
  }
  if (body !== undefined && typeof body.getReader === "function") {
    return readStream(body, limits, signal);
  }
  if (typeof response.arrayBuffer !== "function") {
    throw fetchFailed("The response has no readable body.");
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await raceAbort(response.arrayBuffer(), signal);
  } catch (error) {
    throw ioError(error, signal, () => fetchFailed("The download was interrupted.", error));
  }
  checkByteLimit(buffer.byteLength, limits);
  return new Uint8Array(buffer);
}

/**
 * Downloads an image, enforcing `maxBytes` while the body arrives.
 *
 * @param url - An http(s) URL.
 * @param options - Limits, signal, custom `fetch`, and the page origin (browser only).
 * @returns The downloaded bytes.
 * @throws ColorExtractorError with code `FETCH_FAILED`, `INPUT_TOO_LARGE`, or `ABORTED`.
 */
export async function downloadImage(url: URL, options: DownloadOptions): Promise<Uint8Array> {
  const { limits, signal } = options;
  throwIfAborted(signal);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw fetchFailed("No fetch implementation is available. Pass the fetch option.");
  }
  let response: unknown;
  try {
    // A local variable keeps `this` undefined, which avoids "Illegal invocation".
    response = await raceAbort(
      (async () => fetchImpl(url.href, signal ? { signal } : {}))(),
      signal,
      cancelBody,
    );
  } catch (error) {
    throw ioError(error, signal, () => {
      const crossOrigin = options.pageOrigin !== undefined && options.pageOrigin !== url.origin;
      return fetchFailed(
        `Could not download the image from ${url.origin}.${crossOrigin ? CORS_HINT : ""}`,
        error,
      );
    });
  }
  if (!isResponseLike(response)) {
    cancelBody(response);
    throw fetchFailed("The fetch implementation did not return a Response.");
  }
  checkStatus(response);
  checkContentLength(response, limits);
  return readBody(response, limits, signal);
}
