import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_COUNT,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_PIXELS,
  DEFAULT_MODE,
} from "@/core/defaults.js";
import { ColorExtractorError, type ColorExtractorErrorCode } from "@/core/errors.js";
import {
  checkByteLimit,
  checkPixelLimit,
  resolveOptions,
  validatePixelRequest,
  validatePixels,
  type ResolvedLimits,
} from "@/core/validate.js";

function codeOf(action: () => unknown): ColorExtractorErrorCode {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError);
    return (error as ColorExtractorError).code;
  }
  throw new Error("Expected the call to throw.");
}

const DEFAULT_LIMITS = { maxBytes: DEFAULT_MAX_BYTES, maxPixels: DEFAULT_MAX_PIXELS };

function pixels(
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number } {
  return { data: new Uint8Array(width * height * 4), width, height };
}

describe("resolveOptions: defaults", () => {
  it("applies the defaults for undefined options", () => {
    expect(resolveOptions(undefined, "sync")).toEqual({
      count: DEFAULT_COUNT,
      mode: DEFAULT_MODE,
      limits: DEFAULT_LIMITS,
    });
  });

  it.each(["sync", "async"] as const)("applies the defaults for {} (%s)", (kind) => {
    const resolved = resolveOptions({}, kind);
    expect(resolved).toEqual({ count: 5, mode: "perceptual", limits: DEFAULT_LIMITS });
    expect("signal" in resolved).toBe(false);
    expect("fetch" in resolved).toBe(false);
  });

  it("treats keys set to undefined as absent", () => {
    const resolved = resolveOptions(
      { count: undefined, mode: undefined, limits: undefined, signal: undefined, fetch: undefined },
      "async",
    );
    expect(resolved).toEqual({ count: 5, mode: "perceptual", limits: DEFAULT_LIMITS });
    expect("signal" in resolved).toBe(false);
    expect("fetch" in resolved).toBe(false);
  });

  it("treats limit keys set to undefined as defaults", () => {
    expect(
      resolveOptions({ limits: { maxBytes: undefined, maxPixels: undefined } }, "sync").limits,
    ).toEqual(DEFAULT_LIMITS);
    expect(resolveOptions({ limits: {} }, "sync").limits).toEqual(DEFAULT_LIMITS);
  });

  it("keeps valid values", () => {
    const resolved = resolveOptions(
      { count: 16, mode: "population", limits: { maxBytes: 10, maxPixels: 20 } },
      "sync",
    );
    expect(resolved).toEqual({
      count: 16,
      mode: "population",
      limits: { maxBytes: 10, maxPixels: 20 },
    });
    expect(resolveOptions({ count: 1 }, "sync").count).toBe(1);
  });

  it("fills a missing limit with its default", () => {
    expect(resolveOptions({ limits: { maxPixels: 7 } }, "sync").limits).toEqual({
      maxBytes: DEFAULT_MAX_BYTES,
      maxPixels: 7,
    });
  });
});

describe("resolveOptions: invalid values", () => {
  it.each([0, 17, 2.5, Number.NaN, "5", null, Infinity, -1, true, {}])(
    "rejects count %s",
    (count) => {
      expect(codeOf(() => resolveOptions({ count }, "sync"))).toBe("INVALID_OPTIONS");
    },
  );

  it.each(["", "Perceptual", "fast", 1, null, true])("rejects mode %s", (mode) => {
    expect(codeOf(() => resolveOptions({ mode }, "sync"))).toBe("INVALID_OPTIONS");
  });

  it("rejects an unknown top-level key", () => {
    expect(codeOf(() => resolveOptions({ colors: 5 }, "sync"))).toBe("INVALID_OPTIONS");
    expect(codeOf(() => resolveOptions({ count: 5, extra: 1 }, "async"))).toBe("INVALID_OPTIONS");
  });

  it("rejects an unknown key inside limits", () => {
    expect(codeOf(() => resolveOptions({ limits: { maxWidth: 5 } }, "sync"))).toBe(
      "INVALID_OPTIONS",
    );
  });

  it.each(["maxBytes", "maxPixels"])("rejects invalid values for limits.%s", (key) => {
    for (const value of [0, -1, 1.5, Infinity, Number.NaN, "1", null, 2 ** 53]) {
      expect(codeOf(() => resolveOptions({ limits: { [key]: value } }, "sync"))).toBe(
        "INVALID_OPTIONS",
      );
    }
  });

  it("accepts the largest safe integer as a limit", () => {
    expect(
      resolveOptions({ limits: { maxBytes: Number.MAX_SAFE_INTEGER } }, "sync").limits.maxBytes,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([null, 1, "x", true, [], [1], () => ({})])("rejects limits %s", (limits) => {
    expect(codeOf(() => resolveOptions({ limits }, "sync"))).toBe("INVALID_OPTIONS");
  });

  it.each([null, [], [{ count: 5 }], () => ({}), 5, "options", true, Symbol("x")])(
    "rejects non-object options %s",
    (options) => {
      expect(codeOf(() => resolveOptions(options, "sync"))).toBe("INVALID_OPTIONS");
      expect(codeOf(() => resolveOptions(options, "async"))).toBe("INVALID_OPTIONS");
    },
  );

  it("does not echo a long unknown key in full", () => {
    try {
      resolveOptions({ ["x".repeat(500)]: 1 }, "sync");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message.length).toBeLessThan(200);
    }
  });
});

describe("resolveOptions: signal and fetch", () => {
  const signal = new AbortController().signal;
  const fakeFetch = async (): Promise<Response> => new Response();

  it("rejects signal and fetch for the sync kind", () => {
    expect(codeOf(() => resolveOptions({ signal }, "sync"))).toBe("INVALID_OPTIONS");
    expect(codeOf(() => resolveOptions({ fetch: fakeFetch }, "sync"))).toBe("INVALID_OPTIONS");
  });

  it("accepts a real AbortSignal and a function for the async kind", () => {
    const resolved = resolveOptions({ signal, fetch: fakeFetch }, "async");
    expect(resolved.signal).toBe(signal);
    expect(resolved.fetch).toBe(fakeFetch);
  });

  it("accepts an AbortSignal-like object", () => {
    const like = { aborted: false, addEventListener: () => {} };
    expect(resolveOptions({ signal: like }, "async").signal).toBe(like);
  });

  it("accepts an already aborted signal", () => {
    const aborted = AbortSignal.abort();
    expect(resolveOptions({ signal: aborted }, "async").signal).toBe(aborted);
  });

  it.each([
    null,
    1,
    "signal",
    {},
    { aborted: true },
    { aborted: "no", addEventListener() {} },
    () => {},
  ])("rejects invalid signal %s", (bad) => {
    expect(codeOf(() => resolveOptions({ signal: bad }, "async"))).toBe("INVALID_OPTIONS");
  });

  it.each([null, 1, "fetch", {}, []])("rejects invalid fetch %s", (bad) => {
    expect(codeOf(() => resolveOptions({ fetch: bad }, "async"))).toBe("INVALID_OPTIONS");
  });

  it("still validates count and mode for the async kind", () => {
    expect(codeOf(() => resolveOptions({ count: 0, signal }, "async"))).toBe("INVALID_OPTIONS");
  });
});

describe("validatePixels: valid inputs", () => {
  it("accepts a Uint8Array and returns the same data object", () => {
    const input = pixels(3, 2);
    const result = validatePixels(input);
    expect(result.data).toBe(input.data);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
  });

  it("accepts a Uint8ClampedArray", () => {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    expect(validatePixels({ data, width: 2, height: 2 }).data).toBe(data);
  });

  it("accepts a Node Buffer", () => {
    const data = Buffer.alloc(4);
    expect(validatePixels({ data, width: 1, height: 1 }).data).toBe(data);
  });

  it("accepts an ImageData-like plain object with extra properties", () => {
    const data = new Uint8ClampedArray(8);
    const imageData = { data, width: 2, height: 1, colorSpace: "srgb" };
    expect(validatePixels(imageData).data).toBe(data);
  });

  it("accepts a view over part of a larger buffer", () => {
    const data = new Uint8Array(new ArrayBuffer(64), 16, 8);
    expect(validatePixels({ data, width: 2, height: 1 }).data).toBe(data);
  });

  it("accepts a Uint8Array from another realm", () => {
    const foreign = runInNewContext("new Uint8Array(8)") as Uint8Array;
    expect(foreign instanceof Uint8Array).toBe(false);
    expect(validatePixels({ data: foreign, width: 2, height: 1 }).data).toBe(foreign);
    const clamped = runInNewContext("new Uint8ClampedArray(4)") as Uint8ClampedArray;
    expect(validatePixels({ data: clamped, width: 1, height: 1 }).data).toBe(clamped);
  });
});

describe("validatePixels: invalid inputs", () => {
  const data = new Uint8Array(4);

  it.each([undefined, null, 5, "pixels", true, Symbol("x")])(
    "rejects non-object input %s",
    (input) => {
      expect(codeOf(() => validatePixels(input))).toBe("INVALID_INPUT");
    },
  );

  it("rejects missing or wrong data", () => {
    expect(codeOf(() => validatePixels({ width: 1, height: 1 }))).toBe("INVALID_INPUT");
    expect(codeOf(() => validatePixels({ data: null, width: 1, height: 1 }))).toBe("INVALID_INPUT");
    expect(codeOf(() => validatePixels({ data: [0, 0, 0, 0], width: 1, height: 1 }))).toBe(
      "INVALID_INPUT",
    );
    expect(codeOf(() => validatePixels({ data: "abcd", width: 1, height: 1 }))).toBe(
      "INVALID_INPUT",
    );
  });

  it("rejects typed arrays of other types", () => {
    for (const bad of [
      new Uint16Array(4),
      new Int8Array(4),
      new Uint32Array(1),
      new Float32Array(1),
      new Float64Array(1),
      new DataView(new ArrayBuffer(4)),
      new ArrayBuffer(4),
    ]) {
      expect(codeOf(() => validatePixels({ data: bad, width: 1, height: 1 }))).toBe(
        "INVALID_INPUT",
      );
    }
  });

  it("rejects a plain object that fakes Symbol.toStringTag", () => {
    const fake = { [Symbol.toStringTag]: "Uint8Array", length: 4 };
    expect(Object.prototype.toString.call(fake)).toBe("[object Uint8Array]");
    expect(codeOf(() => validatePixels({ data: fake, width: 1, height: 1 }))).toBe("INVALID_INPUT");
  });

  it("rejects other typed arrays that fake Symbol.toStringTag", () => {
    for (const bad of [new Uint16Array(4), new Int8Array(4)]) {
      Object.defineProperty(bad, Symbol.toStringTag, { value: "Uint8Array" });
      expect(Object.prototype.toString.call(bad)).toBe("[object Uint8Array]");
      expect(codeOf(() => validatePixels({ data: bad, width: 1, height: 1 }))).toBe(
        "INVALID_INPUT",
      );
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, "1", null, undefined, 2 ** 53])(
    "rejects width %s",
    (width) => {
      expect(codeOf(() => validatePixels({ data, width, height: 1 }))).toBe("INVALID_INPUT");
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Infinity, "1", null, undefined, 2 ** 53])(
    "rejects height %s",
    (height) => {
      expect(codeOf(() => validatePixels({ data, width: 1, height }))).toBe("INVALID_INPUT");
    },
  );

  it("rejects dimensions whose product is not a safe integer", () => {
    expect(codeOf(() => validatePixels({ data, width: 2 ** 40, height: 2 ** 40 }))).toBe(
      "INVALID_INPUT",
    );
    expect(codeOf(() => validatePixels({ data, width: Number.MAX_SAFE_INTEGER, height: 2 }))).toBe(
      "INVALID_INPUT",
    );
  });

  it("rejects a data length that does not match width * height * 4", () => {
    expect(codeOf(() => validatePixels({ data: new Uint8Array(3), width: 1, height: 1 }))).toBe(
      "INVALID_INPUT",
    );
    expect(codeOf(() => validatePixels({ data: new Uint8Array(5), width: 1, height: 1 }))).toBe(
      "INVALID_INPUT",
    );
    expect(codeOf(() => validatePixels({ data: new Uint8Array(8), width: 1, height: 1 }))).toBe(
      "INVALID_INPUT",
    );
    expect(codeOf(() => validatePixels({ data: new Uint8Array(0), width: 1, height: 1 }))).toBe(
      "INVALID_INPUT",
    );
  });
});

describe("limits", () => {
  const limits = (maxBytes: number, maxPixels: number): ResolvedLimits => ({ maxBytes, maxPixels });

  it("checkPixelLimit passes at the boundary and fails one pixel over", () => {
    expect(() => checkPixelLimit(10, 10, limits(1, 100))).not.toThrow();
    expect(codeOf(() => checkPixelLimit(101, 1, limits(1, 100)))).toBe("INPUT_TOO_LARGE");
    expect(codeOf(() => checkPixelLimit(10, 11, limits(1, 100)))).toBe("INPUT_TOO_LARGE");
  });

  it("checkByteLimit passes at the boundary and fails one byte over", () => {
    expect(() => checkByteLimit(100, limits(100, 1))).not.toThrow();
    expect(() => checkByteLimit(0, limits(100, 1))).not.toThrow();
    expect(codeOf(() => checkByteLimit(101, limits(100, 1)))).toBe("INPUT_TOO_LARGE");
  });

  it("validatePixelRequest applies maxPixels at the boundary", () => {
    const options = { limits: { maxPixels: 6 } };
    expect(validatePixelRequest(pixels(3, 2), options, "sync").pixels.width).toBe(3);
    expect(codeOf(() => validatePixelRequest(pixels(7, 1), options, "sync"))).toBe(
      "INPUT_TOO_LARGE",
    );
  });

  it("validatePixelRequest ignores maxBytes for pixel inputs", () => {
    const result = validatePixelRequest(pixels(4, 4), { limits: { maxBytes: 1 } }, "sync");
    expect(result.pixels.width).toBe(4);
    expect(result.options.limits.maxBytes).toBe(1);
  });
});

describe("validatePixelRequest: order of checks", () => {
  it("reports invalid options before invalid pixels", () => {
    expect(codeOf(() => validatePixelRequest(null, { count: 0 }, "sync"))).toBe("INVALID_OPTIONS");
  });

  it("reports invalid pixels before an exceeded limit", () => {
    const bad = { data: new Uint8Array(3), width: 1_000_000, height: 1_000_000 };
    expect(codeOf(() => validatePixelRequest(bad, { limits: { maxPixels: 1 } }, "sync"))).toBe(
      "INVALID_INPUT",
    );
  });

  it("reports an exceeded limit for valid pixels", () => {
    expect(
      codeOf(() => validatePixelRequest(pixels(2, 2), { limits: { maxPixels: 3 } }, "sync")),
    ).toBe("INPUT_TOO_LARGE");
  });

  it("returns the same data object and the resolved options", () => {
    const input = pixels(2, 2);
    const result = validatePixelRequest(input, { count: 3 }, "sync");
    expect(result.pixels.data).toBe(input.data);
    expect(result.options.count).toBe(3);
    expect(result.options.mode).toBe("perceptual");
  });

  it("rejects async-only options for the sync kind before looking at the pixels", () => {
    expect(codeOf(() => validatePixelRequest(null, { fetch: () => {} }, "sync"))).toBe(
      "INVALID_OPTIONS",
    );
  });
});
