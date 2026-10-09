import { ColorExtractorError } from "@/core/errors.js";

/**
 * Builds the `ABORTED` error for an aborted signal.
 *
 * @param signal - The aborted signal; its `reason` becomes the `cause`.
 * @returns The error to throw.
 */
export function abortedError(signal: AbortSignal): ColorExtractorError {
  return new ColorExtractorError("ABORTED", "The operation was aborted.", {
    cause: signal.reason,
  });
}

/**
 * Throws `ABORTED` when the signal is aborted.
 *
 * @param signal - The caller's signal, if any.
 * @throws ColorExtractorError with code `ABORTED`.
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortedError(signal);
  }
}

function passToDiscard<T>(promise: Promise<T>, discard: ((value: T) => void) | undefined): void {
  promise.then(
    (value) => {
      try {
        discard?.(value);
      } catch {
        // A failing cleanup must not surface as an unhandled rejection.
      }
    },
    () => {},
  );
}

/**
 * Settles like `promise`, or rejects with `ABORTED` as soon as `signal` aborts (at once if it
 * already has). If the abort wins, a later value goes to `discard` and a later rejection is
 * swallowed. The listener is removed when either side settles.
 *
 * @param promise - The work to wait for.
 * @param signal - The caller's signal, if any.
 * @param discard - Receives a value that arrives after the abort won.
 * @returns A promise that follows `promise` unless the signal aborts first.
 */
export function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  discard?: (value: T) => void,
): Promise<T> {
  if (signal === undefined) {
    return promise;
  }
  if (signal.aborted) {
    passToDiscard(promise, discard);
    return Promise.reject(abortedError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    let aborted = false;
    const onAbort = (): void => {
      aborted = true;
      reject(abortedError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (aborted) {
          try {
            discard?.(value);
          } catch {
            // A failing cleanup must not surface as an unhandled rejection.
          }
        } else {
          resolve(value);
        }
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (!aborted) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Turns anything an adapter caught into a `ColorExtractorError`.
 *
 * @param error - The caught value.
 * @param signal - The caller's signal, if any.
 * @returns `error` when it already is a `ColorExtractorError`; `ABORTED` when the signal has
 * aborted; otherwise `PROCESSING_FAILED` with `error` as the `cause`.
 */
export function normalizeError(
  error: unknown,
  signal: AbortSignal | undefined,
): ColorExtractorError {
  if (error instanceof ColorExtractorError) {
    return error;
  }
  if (signal?.aborted === true) {
    return abortedError(signal);
  }
  return new ColorExtractorError("PROCESSING_FAILED", "Color extraction failed unexpectedly.", {
    cause: error,
  });
}
