import { ColorExtractorError } from "@/core/errors.js";

const HTTP_PREFIX = /^https?:\/\//i;

/**
 * Tells URL strings from file paths: true when the value starts with `http://` or `https://`,
 * ignoring ASCII case.
 *
 * @param value - The string to test.
 * @returns Whether the string looks like an http(s) URL.
 */
export function isHttpUrlString(value: string): boolean {
  return HTTP_PREFIX.test(value);
}

function invalidUrl(cause?: unknown): ColorExtractorError {
  return new ColorExtractorError(
    "INVALID_INPUT",
    "Input is not a valid URL.",
    cause === undefined ? undefined : { cause },
  );
}

/**
 * Parses a URL (against `base` when given) and requires the `http` or `https` protocol. A `URL`
 * object is parsed again from its `href`, so the result is always a fresh copy.
 *
 * @param value - The URL string or object.
 * @param base - The base URL that relative strings resolve against.
 * @returns The parsed URL.
 * @throws ColorExtractorError with code `INVALID_INPUT`.
 */
export function parseHttpUrl(value: string | URL, base?: string): URL {
  let url: URL;
  try {
    url = typeof value === "string" ? new URL(value, base) : new URL(value.href);
  } catch (error) {
    throw invalidUrl(error);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ColorExtractorError(
      "INVALID_INPUT",
      `Only http and https URLs are supported, received a "${url.protocol}" URL.`,
    );
  }
  return url;
}

/**
 * Finds the base URL for relative strings in a browser: the document's base URI, or the worker's
 * location.
 *
 * @returns The base URL, or `undefined` when neither exists.
 */
export function browserBaseUrl(): string | undefined {
  const scope = globalThis as {
    document?: { baseURI?: unknown };
    location?: { href?: unknown };
  };
  const fromDocument = scope.document?.baseURI;
  if (typeof fromDocument === "string") {
    return fromDocument;
  }
  const fromLocation = scope.location?.href;
  return typeof fromLocation === "string" ? fromLocation : undefined;
}

/**
 * Resolves a URL string in a browser: relative strings use the document or worker base URL, and
 * the result must be `http` or `https`.
 *
 * @param value - The URL string.
 * @returns The resolved URL.
 * @throws ColorExtractorError with code `INVALID_INPUT`.
 */
export function resolveBrowserUrl(value: string): URL {
  const base = browserBaseUrl();
  if (base === undefined) {
    let absolute = true;
    try {
      new URL(value);
    } catch {
      absolute = false;
    }
    if (!absolute) {
      let relative = true;
      try {
        new URL(value, "http://relative.invalid/");
      } catch {
        relative = false;
      }
      if (relative) {
        throw new ColorExtractorError(
          "INVALID_INPUT",
          "A relative URL needs a document or worker base URL, and none is available.",
        );
      }
    }
  }
  return parseHttpUrl(value, base);
}
