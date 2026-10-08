import {
  DEFAULT_COUNT,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_PIXELS,
  DEFAULT_MODE,
  MAX_COUNT,
  MIN_COUNT,
} from "./defaults.js";
import { ColorExtractorError } from "./errors.js";
import type { AsyncExtractionOptions, Mode, PixelInput } from "./types.js";

/** Which extraction function the options belong to. */
export type OptionsKind = "sync" | "async";

/** Input size limits with every value filled in. */
export interface ResolvedLimits {
  maxBytes: number;
  maxPixels: number;
}

/** Options with every default applied. `signal` and `fetch` are present only when given. */
export interface ResolvedOptions {
  count: number;
  mode: Mode;
  limits: ResolvedLimits;
  signal?: NonNullable<AsyncExtractionOptions["signal"]>;
  fetch?: NonNullable<AsyncExtractionOptions["fetch"]>;
}

const SYNC_KEYS: readonly string[] = ["count", "mode", "limits"];
const ASYNC_KEYS: readonly string[] = ["count", "mode", "limits", "signal", "fetch"];
const LIMIT_KEYS: readonly string[] = ["maxBytes", "maxPixels"];

function invalidOptions(message: string): ColorExtractorError {
  return new ColorExtractorError("INVALID_OPTIONS", message);
}

function invalidInput(message: string): ColorExtractorError {
  return new ColorExtractorError("INVALID_INPUT", message);
}

/** Names the kind of a value for error messages, without echoing the value. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `type ${typeof value}`;
}

// The getter of %TypedArray%.prototype[Symbol.toStringTag] reads the internal [[TypedArrayName]]
// slot, so a Symbol.toStringTag override cannot fake it. It also works for typed arrays from
// other realms (such as a worker) and for Node Buffers, and returns undefined for anything else.
const typedArrayNameDescriptor = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  Symbol.toStringTag,
);

function readTypedArrayName(value: unknown): unknown {
  return typedArrayNameDescriptor?.get?.call(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function checkKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw invalidOptions(
        `Unknown ${where} "${key.length > 40 ? `${key.slice(0, 40)}...` : key}".`,
      );
    }
  }
}

function resolveCount(value: unknown): number {
  if (value === undefined) return DEFAULT_COUNT;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_COUNT ||
    value > MAX_COUNT
  ) {
    throw invalidOptions(
      `Option "count" must be an integer from ${MIN_COUNT} to ${MAX_COUNT}, received ${describe(value)}.`,
    );
  }
  return value;
}

function resolveMode(value: unknown): Mode {
  if (value === undefined) return DEFAULT_MODE;
  if (value !== "perceptual" && value !== "population") {
    throw invalidOptions(
      `Option "mode" must be "perceptual" or "population", received ${describe(value)}.`,
    );
  }
  return value;
}

function resolveLimitValue(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (!isPositiveSafeInteger(value)) {
    throw invalidOptions(
      `Option "limits.${name}" must be a positive safe integer, received ${describe(value)}.`,
    );
  }
  return value;
}

function resolveLimits(value: unknown): ResolvedLimits {
  if (value === undefined) {
    return { maxBytes: DEFAULT_MAX_BYTES, maxPixels: DEFAULT_MAX_PIXELS };
  }
  if (!isRecord(value)) {
    throw invalidOptions(`Option "limits" must be an object, received ${describe(value)}.`);
  }
  checkKeys(value, LIMIT_KEYS, 'key in option "limits"');
  return {
    maxBytes: resolveLimitValue("maxBytes", value["maxBytes"], DEFAULT_MAX_BYTES),
    maxPixels: resolveLimitValue("maxPixels", value["maxPixels"], DEFAULT_MAX_PIXELS),
  };
}

function isAbortSignalLike(value: unknown): value is NonNullable<ResolvedOptions["signal"]> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { aborted?: unknown }).aborted === "boolean" &&
    typeof (value as { addEventListener?: unknown }).addEventListener === "function"
  );
}

/**
 * Validates the options and applies defaults. `undefined` selects the defaults.
 *
 * @throws ColorExtractorError with code `INVALID_OPTIONS` for unknown options or invalid values.
 */
export function resolveOptions(options: unknown, kind: OptionsKind): ResolvedOptions {
  if (options === undefined) {
    return {
      count: DEFAULT_COUNT,
      mode: DEFAULT_MODE,
      limits: { maxBytes: DEFAULT_MAX_BYTES, maxPixels: DEFAULT_MAX_PIXELS },
    };
  }
  if (!isRecord(options)) {
    throw invalidOptions(`Options must be an object, received ${describe(options)}.`);
  }
  checkKeys(options, kind === "async" ? ASYNC_KEYS : SYNC_KEYS, "option");

  const resolved: ResolvedOptions = {
    count: resolveCount(options["count"]),
    mode: resolveMode(options["mode"]),
    limits: resolveLimits(options["limits"]),
  };

  if (kind === "async") {
    const signal = options["signal"];
    if (signal !== undefined) {
      if (!isAbortSignalLike(signal)) {
        throw invalidOptions(
          `Option "signal" must be an AbortSignal, received ${describe(signal)}.`,
        );
      }
      resolved.signal = signal;
    }
    const fetchImpl = options["fetch"];
    if (fetchImpl !== undefined) {
      if (typeof fetchImpl !== "function") {
        throw invalidOptions(`Option "fetch" must be a function, received ${describe(fetchImpl)}.`);
      }
      resolved.fetch = fetchImpl as NonNullable<ResolvedOptions["fetch"]>;
    }
  }
  return resolved;
}

/**
 * Checks that the input is RGBA pixels: `data` is a `Uint8Array` or `Uint8ClampedArray`, `width`
 * and `height` are positive integers, and `data.length` equals `width * height * 4`. Returns the
 * same `data` object, without copying it.
 *
 * @throws ColorExtractorError with code `INVALID_INPUT`.
 */
export function validatePixels(input: unknown): PixelInput {
  if (typeof input !== "object" || input === null) {
    throw invalidInput(`Pixel input must be an object, received ${describe(input)}.`);
  }
  const { data, width, height } = input as { data?: unknown; width?: unknown; height?: unknown };

  const typedArrayName = readTypedArrayName(data);
  if (typedArrayName !== "Uint8Array" && typedArrayName !== "Uint8ClampedArray") {
    throw invalidInput(
      `Pixel "data" must be a Uint8Array or Uint8ClampedArray, received ${describe(data)}.`,
    );
  }
  if (!isPositiveSafeInteger(width)) {
    throw invalidInput(`Pixel "width" must be a positive integer, received ${describe(width)}.`);
  }
  if (!isPositiveSafeInteger(height)) {
    throw invalidInput(`Pixel "height" must be a positive integer, received ${describe(height)}.`);
  }
  const typed = data as Uint8Array | Uint8ClampedArray;
  const pixelCount = width * height;
  const expected = pixelCount * 4;
  if (!Number.isSafeInteger(pixelCount) || !Number.isSafeInteger(expected)) {
    throw invalidInput('Pixel "width" and "height" are too large.');
  }
  if (typed.length !== expected) {
    throw invalidInput(
      `Pixel "data" length must be width * height * 4 (${expected}), received ${typed.length}.`,
    );
  }
  return { data: typed, width, height };
}

/**
 * Checks the pixel count against `maxPixels`.
 *
 * @throws ColorExtractorError with code `INPUT_TOO_LARGE`.
 */
export function checkPixelLimit(width: number, height: number, limits: ResolvedLimits): void {
  if (width * height > limits.maxPixels) {
    throw new ColorExtractorError(
      "INPUT_TOO_LARGE",
      `Image has ${width * height} pixels, which exceeds the limit of ${limits.maxPixels}.`,
    );
  }
}

/**
 * Checks the size of an encoded file against `maxBytes`.
 *
 * @throws ColorExtractorError with code `INPUT_TOO_LARGE`.
 */
export function checkByteLimit(byteLength: number, limits: ResolvedLimits): void {
  if (byteLength > limits.maxBytes) {
    throw new ColorExtractorError(
      "INPUT_TOO_LARGE",
      `Input has ${byteLength} bytes, which exceeds the limit of ${limits.maxBytes}.`,
    );
  }
}

/**
 * Validates a pixel request in the order of the specification: options, input, limits. Pixel
 * inputs are checked only against `maxPixels`, because `maxBytes` applies to files.
 */
export function validatePixelRequest(
  pixels: unknown,
  options: unknown,
  kind: OptionsKind,
): { pixels: PixelInput; options: ResolvedOptions } {
  const resolved = resolveOptions(options, kind);
  const validated = validatePixels(pixels);
  checkPixelLimit(validated.width, validated.height, resolved.limits);
  return { pixels: validated, options: resolved };
}
