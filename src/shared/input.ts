import { ColorExtractorError } from "@/core/errors.js";
import type { PixelInput } from "@/core/types.js";
import { readTypedArrayName } from "@/core/validate.js";

/** An input after classification: what the entry has to do to turn it into pixels. */
export type ClassifiedInput =
  | { readonly kind: "pixels"; readonly pixels: PixelInput }
  | { readonly kind: "bytes"; readonly bytes: Uint8Array }
  | { readonly kind: "blob"; readonly blob: Blob }
  | { readonly kind: "url"; readonly url: URL }
  | { readonly kind: "path"; readonly path: string };

/**
 * Returns the `Object.prototype.toString` tag of a value, such as "[object Blob]". It works across
 * realms, unlike `instanceof`.
 *
 * @param value - Any value.
 * @returns The tag.
 */
export function typeTag(value: unknown): string {
  return Object.prototype.toString.call(value);
}

/**
 * Views a byte container as bytes, without copying.
 *
 * @param value - Any value.
 * @returns The `Uint8Array` (including a `Buffer`) itself, a view over an `ArrayBuffer`, or
 * `undefined` for anything else.
 */
export function asBytes(value: unknown): Uint8Array | undefined {
  if (readTypedArrayName(value) === "Uint8Array") {
    return value as Uint8Array;
  }
  if (typeTag(value) === "[object ArrayBuffer]") {
    return new Uint8Array(value as ArrayBuffer);
  }
  return undefined;
}

/**
 * Rejects empty input data.
 *
 * @param size - The size in bytes.
 * @throws ColorExtractorError with code `INVALID_INPUT` when the size is 0.
 */
export function requireNonEmpty(size: number): void {
  if (size === 0) {
    throw new ColorExtractorError("INVALID_INPUT", "Input data is empty.");
  }
}
