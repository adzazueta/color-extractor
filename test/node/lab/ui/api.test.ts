import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  BlindModeError,
  LabRequestError,
  fetchAnalysis,
  fetchPixel,
  removeAnnotation,
  saveAnnotation,
} from "../../../../lab/ui/api.js";

const sha = "a".repeat(64);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blind mode", () => {
  test("a test image never reaches the analysis route", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAnalysis({ set: "test", sha256: sha }, 5)).rejects.toBeInstanceOf(
      BlindModeError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a dev image requests the analysis with its count", async () => {
    const fetchSpy = vi.fn(async () => json({ count: 7 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAnalysis({ set: "dev", sha256: sha }, 7)).resolves.toEqual({ count: 7 });
    expect(fetchSpy).toHaveBeenCalledWith(`/__lab/api/analysis/${sha}?count=7`, undefined);
  });
});

describe("requests", () => {
  test("the exact pixel route", async () => {
    const fetchSpy = vi.fn(async () => json({ x: 3, y: 4, hex: "#010203", alpha: 255 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchPixel(sha, 3, 4)).resolves.toEqual({
      x: 3,
      y: 4,
      hex: "#010203",
      alpha: 255,
    });
    expect(fetchSpy).toHaveBeenCalledWith(`/__lab/api/images/${sha}/pixel?x=3&y=4`, undefined);
  });

  test("PUT sends JSON and returns the stored annotation", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ annotation: { id: "dev-001" } }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const body = { category: "dark" as const, acceptable: [{ samples: [{ x: 1, y: 2 }] }] };
    await expect(saveAnnotation(sha, body)).resolves.toEqual({ id: "dev-001" });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(`/__lab/api/annotations/${sha}`);
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "")).toEqual(body);
  });

  test("DELETE accepts 204 and reads its empty body", async () => {
    const response = new Response(null, { status: 204 });
    const read = vi.spyOn(response, "arrayBuffer");
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => response);
    vi.stubGlobal("fetch", fetchSpy);
    await expect(removeAnnotation(sha)).resolves.toBeUndefined();
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(read).toHaveBeenCalledOnce();
  });
});

describe("errors", () => {
  test("a non-2xx response becomes a LabRequestError with its problems", async () => {
    vi.stubGlobal("fetch", async () =>
      json({ error: "Invalid.", problems: ["one", "two", 3] }, 400),
    );
    const error = await saveAnnotation(sha, { category: "dark", acceptable: [] }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LabRequestError);
    expect(error).toMatchObject({ status: 400, error: "Invalid.", problems: ["one", "two"] });
  });

  test("a body that is not JSON falls back to the status", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 502 }));
    await expect(fetchPixel(sha, 0, 0)).rejects.toMatchObject({
      status: 502,
      error: "The lab server answered 502.",
      problems: [],
    });
  });

  test("a network failure has status 0", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("failed");
    });
    await expect(fetchPixel(sha, 0, 0)).rejects.toMatchObject({ status: 0 });
  });
});
