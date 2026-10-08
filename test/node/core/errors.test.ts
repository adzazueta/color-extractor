import { describe, expect, it } from "vite-plus/test";
import { ColorExtractorError, type ColorExtractorErrorCode } from "@/core/errors.js";
import * as core from "@/core/index.js";

describe("ColorExtractorError", () => {
  it("is exported from /core", () => {
    expect(core.ColorExtractorError).toBe(ColorExtractorError);
  });

  it("is an Error and a ColorExtractorError", () => {
    const error = new ColorExtractorError("INVALID_INPUT", "bad input");
    expect(error).toBeInstanceOf(ColorExtractorError);
    expect(error).toBeInstanceOf(Error);
  });

  it("has the expected name, code and message", () => {
    const error = new ColorExtractorError("DECODE_FAILED", "cannot decode");
    expect(error.name).toBe("ColorExtractorError");
    expect(error.code).toBe("DECODE_FAILED");
    expect(error.message).toBe("cannot decode");
    expect(String(error)).toBe("ColorExtractorError: cannot decode");
  });

  it("keeps every code unchanged", () => {
    const codes: ColorExtractorErrorCode[] = [
      "INVALID_OPTIONS",
      "INVALID_INPUT",
      "INPUT_TOO_LARGE",
      "UNSUPPORTED_FORMAT",
      "DECODE_FAILED",
      "FETCH_FAILED",
      "READ_FAILED",
      "DECODER_MISSING",
      "ABORTED",
      "PROCESSING_FAILED",
    ];
    for (const code of codes) {
      expect(new ColorExtractorError(code, "m").code).toBe(code);
    }
  });

  it("has no cause and no status unless they are given", () => {
    for (const error of [
      new ColorExtractorError("ABORTED", "m"),
      new ColorExtractorError("ABORTED", "m", {}),
    ]) {
      expect("cause" in error).toBe(false);
      expect("status" in error).toBe(false);
      expect(error.status).toBeUndefined();
    }
  });

  it("preserves the identity of the cause", () => {
    const cause = new TypeError("underlying");
    const error = new ColorExtractorError("READ_FAILED", "m", { cause });
    expect(error.cause).toBe(cause);
    expect("status" in error).toBe(false);
  });

  it("keeps a cause that is explicitly undefined or falsy", () => {
    expect("cause" in new ColorExtractorError("READ_FAILED", "m", { cause: undefined })).toBe(true);
    expect(new ColorExtractorError("READ_FAILED", "m", { cause: 0 }).cause).toBe(0);
    expect(new ColorExtractorError("READ_FAILED", "m", { cause: null }).cause).toBeNull();
  });

  it("carries the HTTP status for FETCH_FAILED", () => {
    const error = new ColorExtractorError("FETCH_FAILED", "not found", { status: 404 });
    expect(error.status).toBe(404);
    expect("status" in error).toBe(true);
    expect("cause" in error).toBe(false);
  });

  it("keeps cause and status together", () => {
    const cause = new Error("network");
    const error = new ColorExtractorError("FETCH_FAILED", "m", { cause, status: 503 });
    expect(error.cause).toBe(cause);
    expect(error.status).toBe(503);
  });

  it("treats an undefined status as absent", () => {
    const error = new ColorExtractorError("FETCH_FAILED", "m", {});
    expect("status" in error).toBe(false);
  });
});
