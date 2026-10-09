import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { browserBaseUrl, isHttpUrlString, parseHttpUrl, resolveBrowserUrl } from "@/shared/url.js";

function invalid(run: () => unknown): ColorExtractorError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ColorExtractorError);
    expect((error as ColorExtractorError).code).toBe("INVALID_INPUT");
    return error as ColorExtractorError;
  }
  throw new Error("expected INVALID_INPUT");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isHttpUrlString", () => {
  test.each(["http://a/x.png", "https://a/x.png", "HTTP://a", "HtTpS://a"])("accepts %s", (v) => {
    expect(isHttpUrlString(v)).toBe(true);
  });
  test.each(["/tmp/x.png", "ftp://a", "httpx://a", "http:/a", "C:\\x.png", ""])(
    "rejects %j",
    (v) => {
      expect(isHttpUrlString(v)).toBe(false);
    },
  );
});

describe("parseHttpUrl", () => {
  test("accepts http and https strings in any case", () => {
    expect(parseHttpUrl("http://example.com/a.png").href).toBe("http://example.com/a.png");
    expect(parseHttpUrl("HTTPS://Example.com/a.png").href).toBe("https://example.com/a.png");
  });

  test("accepts URL objects and returns a copy", () => {
    const original = new URL("https://example.com/a.png?x=1");
    const parsed = parseHttpUrl(original);
    expect(parsed).not.toBe(original);
    expect(parsed.href).toBe(original.href);
    parsed.pathname = "/other";
    expect(original.pathname).toBe("/a.png");
  });

  test("resolves relative strings against a base", () => {
    expect(parseHttpUrl("img/a.png", "https://example.com/dir/page.html").href).toBe(
      "https://example.com/dir/img/a.png",
    );
    expect(parseHttpUrl("//cdn.example.com/x.png", "https://example.com/").href).toBe(
      "https://cdn.example.com/x.png",
    );
  });

  test("rejects relative strings without a base", () => {
    expect(invalid(() => parseHttpUrl("img/a.png")).message).toBe("Input is not a valid URL.");
  });

  test.each([
    "blob:https://example.com/uuid",
    "data:image/png;base64,AAAA",
    "file:///x.png",
    "ftp://a/x",
  ])("rejects %s by protocol", (value) => {
    const protocol = new URL(value).protocol;
    expect(invalid(() => parseHttpUrl(value)).message).toBe(
      `Only http and https URLs are supported, received a "${protocol}" URL.`,
    );
  });

  test("rejects URL objects with another protocol", () => {
    invalid(() => parseHttpUrl(new URL("ftp://example.com/x.png")));
  });

  test.each(["C:\\x.png", "http://[::1", "http://", ""])("rejects %j", (value) => {
    invalid(() => parseHttpUrl(value));
  });

  test("rejects relative strings against a blob base", () => {
    invalid(() => parseHttpUrl("a.png", "blob:https://example.com/uuid"));
  });

  test("does not echo the input in the message", () => {
    const error = invalid(() => parseHttpUrl("ftp://user:secret@host/private/path?token=1"));
    expect(error.message).not.toMatch(/secret|private|token|host/);
  });
});

describe("browserBaseUrl and resolveBrowserUrl", () => {
  test("no document or location gives undefined", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("location", undefined);
    expect(browserBaseUrl()).toBeUndefined();
  });

  test("the document base wins over the location", () => {
    vi.stubGlobal("document", { baseURI: "https://doc.example/dir/" });
    vi.stubGlobal("location", { href: "https://loc.example/" });
    expect(browserBaseUrl()).toBe("https://doc.example/dir/");
    expect(resolveBrowserUrl("a.png").href).toBe("https://doc.example/dir/a.png");
  });

  test("a worker uses its location", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("location", { href: "https://worker.example/js/w.js" });
    expect(resolveBrowserUrl("/a.png").href).toBe("https://worker.example/a.png");
    expect(resolveBrowserUrl("//cdn.example/a.png").href).toBe("https://cdn.example/a.png");
    expect(resolveBrowserUrl("http://other.example/a.png").href).toBe("http://other.example/a.png");
  });

  test("relative strings without a base explain why", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("location", undefined);
    expect(invalid(() => resolveBrowserUrl("a.png")).message).toBe(
      "A relative URL needs a document or worker base URL, and none is available.",
    );
    expect(resolveBrowserUrl("https://example.com/a.png").href).toBe("https://example.com/a.png");
    expect(invalid(() => resolveBrowserUrl("http://[::1")).message).toBe(
      "Input is not a valid URL.",
    );
  });

  test("a blob base rejects relative strings, and blob/data results are rejected", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("location", { href: "blob:https://example.com/uuid" });
    invalid(() => resolveBrowserUrl("a.png"));
    vi.stubGlobal("location", { href: "https://example.com/" });
    invalid(() => resolveBrowserUrl("blob:https://example.com/uuid"));
    invalid(() => resolveBrowserUrl("data:image/png;base64,AAAA"));
  });
});
