import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vite-plus/test";
import { CALIBRATION_THRESHOLDS, MATCH_THRESHOLD } from "../../../../eval/config.js";
import * as analyzer from "../../../../eval/lib/analyze.js";
import {
  parseAnnotationFile,
  serializeAnnotationFile,
  type AnnotationFile,
  type ImageAnnotation,
  type SetName,
} from "../../../../eval/lib/annotation-schema.js";
import type {
  AnnotationDraft,
  LabAnalysis,
  LabAnnotation,
  LabError,
  LabInventory,
  LabPixel,
} from "../../../../lab/api.js";
import {
  createLabHandler,
  MAX_JOBS,
  MAX_QUEUED_JOBS,
  type Analyzer,
  type LabHandler,
} from "../../../../lab/server/handler.js";
import { createEvalFixture, type EvalFixture } from "../../../support/eval-fixture.js";

// Pass-through spies: the bad-hash test proves that no request value reaches the file system.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    readdir: vi.fn(actual.readdir),
    stat: vi.fn(actual.stat),
    open: vi.fn(actual.open),
  };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});

type ImageName = keyof EvalFixture["images"];

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
  json<T>(): T;
}

interface CallOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  /** Sends the body in two chunks without content-length (chunked transfer encoding). */
  readonly chunked?: boolean;
}

interface Lab {
  readonly port: number;
  readonly handler: LabHandler;
  call(method: string, path: string, options?: CallOptions): Promise<Reply>;
  close(): Promise<void>;
}

interface Counters {
  loads: number;
  decodes: number;
  encodes: number;
}

function countingLoader(overrides: Partial<Analyzer> = {}): {
  readonly counters: Counters;
  readonly loadAnalyzer: () => Promise<Analyzer>;
} {
  const counters: Counters = { loads: 0, decodes: 0, encodes: 0 };
  const counted: Analyzer = {
    decodeEvalImage: (bytes) => {
      counters.decodes += 1;
      return analyzer.decodeEvalImage(bytes);
    },
    extractEvalColors: analyzer.extractEvalColors,
    pixelAt: analyzer.pixelAt,
    encodeDisplayPng: (image) => {
      counters.encodes += 1;
      return analyzer.encodeDisplayPng(image);
    },
    ...overrides,
  };
  return {
    counters,
    loadAnalyzer: () => {
      counters.loads += 1;
      return Promise.resolve(counted);
    },
  };
}

async function startLab(
  fixture: { readonly repoRoot: string; readonly evalDir: string },
  loadAnalyzer: () => Promise<Analyzer> = () => Promise.resolve(analyzer),
): Promise<Lab> {
  const handler = createLabHandler({
    root: fixture.repoRoot,
    evalDir: fixture.evalDir,
    loadAnalyzer,
  });
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end("next");
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const call = (method: string, path: string, options: CallOptions = {}) =>
    new Promise<Reply>((resolve, reject) => {
      const outgoing = request(
        {
          host: "127.0.0.1",
          port,
          method,
          path,
          agent: false,
          headers: { host: `127.0.0.1:${port}`, ...options.headers },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const body = Buffer.concat(chunks);
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body,
              json: <T>() => JSON.parse(body.toString("utf8")) as T,
            });
          });
          response.on("error", reject);
        },
      );
      outgoing.on("error", reject);
      const { body } = options;
      if (body !== undefined && options.chunked === true) {
        const bytes = typeof body === "string" ? Buffer.from(body) : body;
        const half = Math.floor(bytes.byteLength / 2);
        outgoing.write(bytes.subarray(0, half));
        outgoing.end(bytes.subarray(half));
      } else {
        if (body !== undefined) outgoing.setHeader("content-length", Buffer.byteLength(body));
        outgoing.end(body);
      }
    });
  return {
    port,
    handler,
    call,
    close: () =>
      new Promise<void>((resolve) => {
        handler.close();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const API = "/__lab/api";
const JSON_HEADERS = { "content-type": "application/json" };

function draftOf(
  category: string,
  ...colors: (readonly (readonly [number, number])[])[]
): AnnotationDraft {
  return {
    category,
    acceptable: colors.map((samples) => ({ samples: samples.map(([x, y]) => ({ x, y })) })),
  } as AnnotationDraft;
}

async function readAnnotationFile(repoRoot: string, set: SetName): Promise<AnnotationFile> {
  const text = await readFile(join(repoRoot, "eval", "annotations", `${set}.json`), "utf8");
  return parseAnnotationFile(text, set, `${set}.json`);
}

async function writeAnnotationFile(
  repoRoot: string,
  set: SetName,
  images: readonly ImageAnnotation[],
): Promise<void> {
  await writeFile(
    join(repoRoot, "eval", "annotations", `${set}.json`),
    serializeAnnotationFile({ schemaVersion: 1, set, images }),
  );
}

/** A stored report that passes `parseReport`'s light validation. */
async function writeReport(
  repoRoot: string,
  version: string,
  set: SetName,
  hashes: readonly string[],
): Promise<string> {
  const directory = join(repoRoot, "eval", "reports", version);
  await mkdir(directory, { recursive: true });
  const report = {
    schemaVersion: 1,
    set,
    header: {
      algorithmVersion: version,
      packageVersion: "0.4.0-next.0",
      commit: "c".repeat(40),
      generatedAt: "2026-10-20T18:04:05Z",
    },
    images: hashes.map((sha256) => ({ sha256 })),
  };
  const path = join(directory, `${set}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

async function resetRepository(repoRoot: string): Promise<void> {
  const evalFolder = join(repoRoot, "eval");
  await rm(join(evalFolder, "annotations"), { recursive: true, force: true });
  await rm(join(evalFolder, "reports"), { recursive: true, force: true });
  await mkdir(join(evalFolder, "annotations"), { recursive: true });
  await mkdir(join(evalFolder, "reports"), { recursive: true });
}

let fixture: EvalFixture;
let lab: Lab;

const hash = (name: ImageName): string => fixture.images[name].sha256;
const bytesOf = (name: ImageName): Promise<Buffer> => {
  const { set, relativePath } = fixture.images[name];
  return readFile(join(fixture.evalDir, set, relativePath));
};

beforeAll(async () => {
  fixture = await createEvalFixture();
  lab = await startLab(fixture);
});
afterAll(async () => {
  await lab.close();
  await fixture.cleanup();
});
beforeEach(async () => {
  await resetRepository(fixture.repoRoot);
});

describe("inventory", () => {
  test("lists both sets in order, with counts and the configuration", async () => {
    const reply = await lab.call("GET", `${API}/inventory`);
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    const inventory = reply.json<LabInventory>();
    expect(inventory.evalDir).toBe(fixture.evalDir);
    expect(inventory.threshold).toBe(MATCH_THRESHOLD);
    expect(inventory.calibrationThresholds).toEqual(CALIBRATION_THRESHOLDS);
    expect(inventory.images.map((image) => [image.set, image.relativePath])).toEqual([
      ["dev", "alpha.png"],
      ["dev", "orange.png"],
      ["dev", "photo.jpg"],
      ["dev", "sub/dark.jpg"],
      ["test", "a.webp"],
      ["test", "b.png"],
    ]);
    const orange = inventory.images.find((image) => image.sha256 === hash("orange"));
    expect(orange).toEqual({
      set: "dev",
      sha256: hash("orange"),
      relativePath: "orange.png",
      bytes: (await bytesOf("orange")).byteLength,
      annotation: null,
      locked: false,
    });
    expect(inventory.orphans).toEqual([]);
    expect(inventory.duplicates).toBe(0);
    expect(inventory.skipped).toBe(2); // notes.txt and anim.gif
    expect(inventory.problems).toEqual([]);
  });

  test("shows annotations and lists orphans (annotations of missing images)", async () => {
    const missing = "f".repeat(64);
    await writeAnnotationFile(fixture.repoRoot, "dev", [
      {
        id: "dev-001",
        sha256: hash("orange"),
        category: "reference",
        width: 64,
        height: 48,
        acceptable: [{ samples: [{ x: 0, y: 0, hex: "#d9822b" }] }],
      },
      {
        id: "dev-002",
        sha256: missing,
        category: "dark",
        width: 10,
        height: 10,
        acceptable: [{ samples: [{ x: 1, y: 1, hex: "#000000" }] }],
      },
    ]);
    const inventory = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    const orange = inventory.images.find((image) => image.sha256 === hash("orange"));
    expect(orange?.annotation).toEqual({ id: "dev-001", category: "reference" });
    expect(inventory.orphans).toEqual([
      { set: "dev", id: "dev-002", sha256: missing, category: "dark" },
    ]);
    expect(inventory.problems).toEqual([]);
  });

  test("reports an invalid annotation file in problems", async () => {
    await writeFile(join(fixture.repoRoot, "eval", "annotations", "test.json"), "{");
    const inventory = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    expect(inventory.problems).toHaveLength(1);
    expect(inventory.problems[0]).toContain("test.json is not a valid annotation file");
    expect(inventory.images).toHaveLength(6);
  });

  test("reports an image annotated in both files", async () => {
    const annotation = (id: string): ImageAnnotation => ({
      id,
      sha256: "e".repeat(64),
      category: "general",
      width: 4,
      height: 4,
      acceptable: [{ samples: [{ x: 0, y: 0, hex: "#000000" }] }],
    });
    await writeAnnotationFile(fixture.repoRoot, "dev", [annotation("dev-001")]);
    await writeAnnotationFile(fixture.repoRoot, "test", [annotation("test-004")]);
    const inventory = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    expect(inventory.problems).toEqual([
      "One image is annotated in both sets (dev-001 and test-004). Remove one annotation.",
    ]);
  });

  test("reports a missing evaluation folder", async () => {
    const missing = await startLab({
      repoRoot: fixture.repoRoot,
      evalDir: join(tmpdir(), "color-extractor-lab-missing-folder"),
    });
    try {
      const inventory = (await missing.call("GET", `${API}/inventory`)).json<LabInventory>();
      expect(inventory.images).toEqual([]);
      expect(inventory.orphans).toEqual([]);
      expect(inventory.problems).toHaveLength(1);
      expect(inventory.problems[0]).toContain("was not found");
      expect(inventory.problems[0]).toContain("COLOR_EXTRACTOR_EVAL_DIR");
      const png = await missing.call("GET", `${API}/images/${hash("orange")}.png`);
      expect(png.status).toBe(404);
    } finally {
      await missing.close();
    }
  });
});

describe("images and pixels", () => {
  test("the PNG holds exactly the decoded pixels", async () => {
    const { default: sharp } = await import("sharp");
    for (const name of ["alpha", "jpeg", "test-a"] as const) {
      const reply = await lab.call("GET", `${API}/images/${hash(name)}.png`);
      expect(reply.status).toBe(200);
      expect(reply.headers["content-type"]).toBe("image/png");
      expect(reply.headers["cache-control"]).toBe("no-store");
      expect(reply.headers["x-content-type-options"]).toBe("nosniff");
      const decoded = await analyzer.decodeEvalImage(await bytesOf(name));
      const { data, info } = await sharp(reply.body)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([decoded.width, decoded.height]);
      expect(new Uint8Array(data).every((value, index) => value === decoded.data[index])).toBe(
        true,
      );
    }
  });

  test("the pixel route is exact, including alpha 128 and alpha 0", async () => {
    const decoded = await analyzer.decodeEvalImage(await bytesOf("alpha"));
    for (const [x, y] of [
      [30, 10],
      [5, 5],
      [63, 47],
    ] as const) {
      const reply = await lab.call("GET", `${API}/images/${hash("alpha")}/pixel?x=${x}&y=${y}`);
      expect(reply.status).toBe(200);
      expect(reply.json<LabPixel>()).toEqual({ x, y, ...analyzer.pixelAt(decoded, x, y) });
    }
    const half = (
      await lab.call("GET", `${API}/images/${hash("alpha")}/pixel?x=30&y=10`)
    ).json<LabPixel>();
    expect(half).toEqual({ x: 30, y: 10, hex: "#1ea03c", alpha: 128 });
  });

  test("the pixel route refuses malformed or outside positions", async () => {
    const base = `${API}/images/${hash("orange")}/pixel`;
    for (const query of [
      "",
      "?x=1",
      "?x=-1&y=0",
      "?x=1.5&y=0",
      "?x=0x1&y=0",
      "?x=1234567&y=0",
      "?x=1&y=2&y=3",
      "?x=64&y=0",
      "?x=0&y=48",
    ]) {
      const reply = await lab.call("GET", `${base}${query}`);
      expect(reply.status, query).toBe(400);
      expect(reply.json<LabError>().error).toMatch(/x and y|outside/);
    }
  });

  test("bad hashes give 400 or 404 and never reach the file system", async () => {
    const fs = await import("node:fs/promises");
    const { createReadStream: stream } = await import("node:fs");
    const spies = [fs.readFile, fs.readdir, fs.stat, fs.open, stream] as unknown as Mock[];
    const counting = countingLoader();
    const fresh = await startLab(fixture, counting.loadAnalyzer);
    try {
      for (const spy of spies) spy.mockClear();
      const upper = hash("orange").toUpperCase();
      const short = hash("orange").slice(1);
      for (const path of [
        `${API}/images/../../etc/passwd`,
        `${API}/images/..%2F..%2Fetc%2Fpasswd.png`,
        `${API}/images/%2Fetc%2Fpasswd/pixel?x=0&y=0`,
        `${API}/annotations/../../../etc/passwd`,
        `${API}/annotations/..%2F..%2Feval%2Fannotations%2Fdev.json`,
        `${API}/images/${upper}.png`,
        `${API}/images/${short}.png`,
        `${API}/images/${hash("orange")}0.png`,
        `${API}/analysis/${upper}?count=5`,
        `${API}/annotations/${short}`,
      ]) {
        const reply = await fresh.call("GET", path);
        expect([400, 404], path).toContain(reply.status);
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(counting.counters.loads).toBe(0);
    } finally {
      await fresh.close();
    }
  });

  test("an unknown hash rescans the evaluation folder only", async () => {
    const fs = await import("node:fs/promises");
    const { createReadStream: stream } = await import("node:fs");
    const readFileSpy = fs.readFile as unknown as Mock;
    const readdirSpy = fs.readdir as unknown as Mock;
    const statSpy = fs.stat as unknown as Mock;
    const streamSpy = stream as unknown as Mock;
    await lab.call("GET", `${API}/inventory`); // the hashes are cached
    for (const spy of [readFileSpy, readdirSpy, statSpy, streamSpy]) spy.mockClear();
    const reply = await lab.call("GET", `${API}/images/${"0".repeat(64)}.png`);
    expect(reply.status).toBe(404);
    expect(readFileSpy).not.toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
    expect(readdirSpy).toHaveBeenCalled();
    for (const [path] of [...readdirSpy.mock.calls, ...statSpy.mock.calls]) {
      expect(String(path).startsWith(fixture.evalDir)).toBe(true);
    }
  });

  test("decodes once per image, caches, and decodes again after invalidate()", async () => {
    const counting = countingLoader();
    const fresh = await startLab(fixture, counting.loadAnalyzer);
    try {
      const pixel = `${API}/images/${hash("orange")}/pixel?x=0&y=0`;
      const replies = await Promise.all([1, 2, 3, 4].map(() => fresh.call("GET", pixel)));
      expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200, 200]);
      expect(counting.counters.decodes).toBe(1);
      const png = `${API}/images/${hash("orange")}.png`;
      expect((await fresh.call("GET", png)).status).toBe(200);
      expect((await fresh.call("GET", png)).status).toBe(200);
      expect(counting.counters).toMatchObject({ decodes: 1, encodes: 1 });
      fresh.handler.invalidate();
      expect((await fresh.call("GET", png)).status).toBe(200);
      expect(counting.counters).toMatchObject({ decodes: 2, encodes: 2 });
    } finally {
      await fresh.close();
    }
  });
});

describe("analysis", () => {
  test("for a dev image, equals extractEvalColors in both modes", async () => {
    const decoded = await analyzer.decodeEvalImage(await bytesOf("orange"));
    for (const count of [5, 3, 16]) {
      const reply = await lab.call("GET", `${API}/analysis/${hash("orange")}?count=${count}`);
      expect(reply.status).toBe(200);
      const analysis = reply.json<LabAnalysis>();
      const perceptual = analyzer.extractEvalColors(decoded, "perceptual", count);
      const population = analyzer.extractEvalColors(decoded, "population", count);
      expect(analysis).toMatchObject({
        sha256: hash("orange"),
        width: 64,
        height: 48,
        count,
        algorithmVersion: perceptual.meta.algorithmVersion,
      });
      expect(analysis.perceptual).toEqual(perceptual);
      expect(analysis.population).toEqual(population);
      for (const value of Object.values(analysis.milliseconds)) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("for a test image, answers 403 without loading the analyzer or decoding", async () => {
    const counting = countingLoader();
    const fresh = await startLab(fixture, counting.loadAnalyzer);
    try {
      for (const name of ["test-a", "test-b"] as const) {
        for (const query of ["?count=5", "?count=0", ""]) {
          const reply = await fresh.call("GET", `${API}/analysis/${hash(name)}${query}`);
          expect(reply.status).toBe(403);
          expect(reply.json<LabError>()).toEqual({
            error: "Results are hidden for test images (blind annotation).",
          });
        }
      }
      expect(counting.counters).toEqual({ loads: 0, decodes: 0, encodes: 0 });
    } finally {
      await fresh.close();
    }
  });

  test("refuses a count outside 1–16 and an unknown image", async () => {
    for (const query of [
      "?count=0",
      "?count=17",
      "?count=abc",
      "?count=5&count=6",
      "",
      "?count=-1",
    ]) {
      const reply = await lab.call("GET", `${API}/analysis/${hash("orange")}${query}`);
      expect(reply.status, query).toBe(400);
    }
    const unknown = await lab.call("GET", `${API}/analysis/${"a".repeat(64)}?count=5`);
    expect(unknown.status).toBe(404);
  });
});

describe("annotations", () => {
  const put = (name: ImageName, body: unknown, headers: Record<string, string> = JSON_HEADERS) =>
    lab.call("PUT", `${API}/annotations/${hash(name)}`, {
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  test("GET gives the size, the set, and no annotation yet", async () => {
    for (const [name, set] of [
      ["orange", "dev"],
      ["test-b", "test"],
    ] as const) {
      const reply = await lab.call("GET", `${API}/annotations/${hash(name)}`);
      expect(reply.status).toBe(200);
      expect(reply.json<LabAnnotation>()).toEqual({
        set,
        width: 64,
        height: 48,
        annotation: null,
        locked: false,
      });
    }
    expect((await lab.call("GET", `${API}/annotations/${"b".repeat(64)}`)).status).toBe(404);
  });

  test("PUT assigns ids, stores exact hexes from the server, and keeps the id", async () => {
    const first = await put(
      "orange",
      draftOf(
        "reference",
        [
          [0, 0],
          [5, 3],
        ],
        [[10, 30]],
      ),
    );
    expect(first.status).toBe(200);
    const expected: ImageAnnotation = {
      id: "dev-001",
      sha256: hash("orange"),
      category: "reference",
      width: 64,
      height: 48,
      acceptable: [
        {
          samples: [
            { x: 0, y: 0, hex: "#d9822b" },
            { x: 5, y: 3, hex: "#d9822b" },
          ],
        },
        { samples: [{ x: 10, y: 30, hex: "#28aab4" }] },
      ],
    };
    expect(first.json<{ annotation: ImageAnnotation }>()).toEqual({ annotation: expected });

    const photo = await put("jpeg", draftOf("general", [[1, 1]]));
    expect(photo.json<{ annotation: ImageAnnotation }>().annotation.id).toBe("dev-002");

    const again = await put("orange", draftOf("saturated-logo", [[63, 47]]));
    expect(again.status).toBe(200);
    expect(again.json<{ annotation: ImageAnnotation }>().annotation).toEqual({
      ...expected,
      category: "saturated-logo",
      acceptable: [{ samples: [{ x: 63, y: 47, hex: "#f5f5f5" }] }],
    });

    const file = await readAnnotationFile(fixture.repoRoot, "dev");
    expect(file.images.map((image) => [image.id, image.sha256])).toEqual([
      ["dev-001", hash("orange")],
      ["dev-002", hash("jpeg")],
    ]);
    const get = (
      await lab.call("GET", `${API}/annotations/${hash("orange")}`)
    ).json<LabAnnotation>();
    expect(get.annotation?.category).toBe("saturated-logo");
  });

  test("the stored file is canonical and holds no file name", async () => {
    await put("orange", draftOf("reference", [[0, 0]]));
    await put("test-a", draftOf("character-art", [[45, 10]]));
    for (const set of ["dev", "test"] as const) {
      const text = await readFile(
        join(fixture.repoRoot, "eval", "annotations", `${set}.json`),
        "utf8",
      );
      expect(serializeAnnotationFile(parseAnnotationFile(text, set, set))).toBe(text);
      expect(text).not.toContain("relativePath");
      expect(text).not.toMatch(/orange|\.png|\.webp|\.jpg/);
    }
    const leftovers = await readdir(join(fixture.repoRoot, "eval", "annotations"));
    expect(leftovers.sort()).toEqual(["dev.json", "test.json"]);
  });

  test.each([
    ["an alpha-0 sample", "alpha", draftOf("general", [[3, 3]]), "fully transparent"],
    ["an out-of-bounds sample", "orange", draftOf("general", [[64, 0]]), "outside the 64×48 image"],
    [
      "a repeated position",
      "orange",
      draftOf("general", [[1, 1]], [[1, 1]]),
      "already used in this image",
    ],
    [
      "an unknown key",
      "orange",
      { ...draftOf("general", [[1, 1]]), title: "Cover" },
      "body: unknown key",
    ],
    [
      "an unknown sample key",
      "orange",
      { category: "general", acceptable: [{ samples: [{ x: 1, y: 1, hex: "#000000" }] }] },
      "acceptable[0].samples[0]: unknown key",
    ],
    [
      "9 colors",
      "orange",
      draftOf("general", ...Array.from({ length: 9 }, (_, i) => [[i, 0] as const])),
      "1 to 8 colors",
    ],
    [
      "17 samples",
      "orange",
      draftOf(
        "general",
        Array.from({ length: 17 }, (_, i) => [i, 0] as const),
      ),
      "1 to 16 samples",
    ],
    [
      "a fractional x",
      "orange",
      draftOf("general", [[1.5, 0]]),
      "x: must be a non-negative integer",
    ],
    ["an unknown category", "orange", draftOf("poster", [[1, 1]]), "category: must be one of"],
    ["no colors", "orange", { category: "general", acceptable: [] }, "1 to 8 colors"],
    ["an array body", "orange", [], "body: must be an object"],
  ] as const)("%s gives 400 with problems", async (_label, name, body, problem) => {
    const reply = await put(name, body);
    expect(reply.status).toBe(400);
    const error = reply.json<LabError>();
    expect(error.error).toBe("The annotation is not valid.");
    expect(error.problems?.some((text) => text.includes(problem))).toBe(true);
    await expect(stat(join(fixture.repoRoot, "eval", "annotations", "dev.json"))).rejects.toThrow();
  });

  test("problems never echo request strings", async () => {
    const reply = await put("orange", {
      category: "<script>alert(1)</script>",
      acceptable: [{ samples: [{ x: "<img>", y: 0 }] }],
      "<b>key</b>": 1,
    });
    expect(reply.status).toBe(400);
    expect(reply.body.toString("utf8")).not.toMatch(/<script>|<img>|<b>/);
  });

  test("the wrong content type gives 415, a large body 413, and invalid JSON 400", async () => {
    const draft = JSON.stringify(draftOf("general", [[1, 1]]));
    expect((await put("orange", draft, { "content-type": "text/plain" })).status).toBe(415);
    expect((await put("orange", draft, {})).status).toBe(415);
    const large = JSON.stringify({ ...draftOf("general", [[1, 1]]), padding: "x".repeat(70_000) });
    const tooLarge = await put("orange", large);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.json<LabError>().error).toContain("65536");
    const chunked = await lab.call("PUT", `${API}/annotations/${hash("orange")}`, {
      headers: JSON_HEADERS,
      body: large,
      chunked: true,
    });
    expect(chunked.status).toBe(413);
    expect((await put("orange", "{not json")).status).toBe(400);
    expect(
      (await put("orange", draft, { "content-type": "application/json; charset=utf-8" })).status,
    ).toBe(200);
  });

  test("DELETE removes the annotation; a second DELETE gives 404", async () => {
    await put("orange", draftOf("reference", [[0, 0]]));
    await put("jpeg", draftOf("general", [[0, 0]]));
    const removed = await lab.call("DELETE", `${API}/annotations/${hash("orange")}`);
    expect(removed.status).toBe(204);
    expect(removed.body.byteLength).toBe(0);
    const file = await readAnnotationFile(fixture.repoRoot, "dev");
    expect(file.images.map((image) => image.sha256)).toEqual([hash("jpeg")]);
    const again = await lab.call("DELETE", `${API}/annotations/${hash("orange")}`);
    expect(again.status).toBe(404);
    expect(again.json<LabError>().error).toBe("This image has no annotation.");
  });

  test("a test annotation in a stored test report is locked", async () => {
    expect((await put("test-a", draftOf("general", [[1, 1]]))).status).toBe(200);
    const before = await readFile(
      join(fixture.repoRoot, "eval", "annotations", "test.json"),
      "utf8",
    );
    await writeReport(fixture.repoRoot, "1-population-only", "test", [hash("test-a")]);

    const changed = await put("test-a", draftOf("dark", [[2, 2]]));
    expect(changed.status).toBe(409);
    expect(changed.json<LabError>().error).toBe(
      "This test image is already in a test report; its annotation cannot change (specification 7.2).",
    );
    expect((await lab.call("DELETE", `${API}/annotations/${hash("test-a")}`)).status).toBe(409);
    expect(await readFile(join(fixture.repoRoot, "eval", "annotations", "test.json"), "utf8")).toBe(
      before,
    );

    const annotation = (
      await lab.call("GET", `${API}/annotations/${hash("test-a")}`)
    ).json<LabAnnotation>();
    expect(annotation.locked).toBe(true);
    const inventory = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    const locked = inventory.images.filter((image) => image.locked).map((image) => image.sha256);
    expect(locked).toEqual([hash("test-a")]);
    // The other test image is not in the report.
    expect((await put("test-b", draftOf("general", [[1, 1]]))).status).toBe(200);
  });

  test("a hash annotated in the other set's file gives 409", async () => {
    await writeAnnotationFile(fixture.repoRoot, "test", [
      {
        id: "test-001",
        sha256: hash("orange"),
        category: "general",
        width: 64,
        height: 48,
        acceptable: [{ samples: [{ x: 0, y: 0, hex: "#d9822b" }] }],
      },
    ]);
    const reply = await put("orange", draftOf("reference", [[0, 0]]));
    expect(reply.status).toBe(409);
    expect(reply.json<LabError>().error).toContain("annotated in the test set");
    await expect(stat(join(fixture.repoRoot, "eval", "annotations", "dev.json"))).rejects.toThrow();
  });

  test("an invalid annotation file gives 500 with its problems and is never overwritten", async () => {
    const path = join(fixture.repoRoot, "eval", "annotations", "dev.json");
    await writeFile(path, '{"schemaVersion":2}');
    for (const reply of [
      await lab.call("GET", `${API}/annotations/${hash("orange")}`),
      await put("orange", draftOf("general", [[0, 0]])),
      await lab.call("DELETE", `${API}/annotations/${hash("orange")}`),
    ]) {
      expect(reply.status).toBe(500);
      const error = reply.json<LabError>();
      expect(error.error).toContain("dev.json cannot be used");
      expect(error.problems?.length).toBeGreaterThan(0);
    }
    expect(await readFile(path, "utf8")).toBe('{"schemaVersion":2}');
  });
});

describe("fail-closed lock (an unreadable stored test report)", () => {
  const put = (name: ImageName, body: unknown) =>
    lab.call("PUT", `${API}/annotations/${hash(name)}`, {
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

  test.each([
    ["invalid JSON", "{"],
    ["a dev report stored as test.json", "dev"],
    ["no images array", JSON.stringify({ schemaVersion: 1, set: "test", header: {} })],
  ])("%s locks every test annotation until it is fixed", async (_label, content) => {
    expect((await put("test-a", draftOf("general", [[1, 1]]))).status).toBe(200);
    // A readable report that lists neither image: alone, it would lock nothing.
    await writeReport(fixture.repoRoot, "0-old", "test", ["d".repeat(64)]);
    const directory = join(fixture.repoRoot, "eval", "reports", "2-broken");
    await mkdir(directory, { recursive: true });
    const broken = join(directory, "test.json");
    if (content === "dev") {
      await writeReport(fixture.repoRoot, "2-broken", "dev", [hash("test-a")]);
      await copyFile(join(directory, "dev.json"), broken);
    } else {
      await writeFile(broken, content);
    }

    const inventory = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    expect(inventory.problems).toHaveLength(1);
    expect(inventory.problems[0]).toContain(broken);
    expect(inventory.problems[0]).toContain("Every test annotation is locked");
    for (const image of inventory.images) expect(image.locked).toBe(image.set === "test");

    for (const name of ["test-a", "test-b"] as const) {
      const reply = await put(name, draftOf("dark", [[2, 2]]));
      expect(reply.status).toBe(409);
      expect(reply.json<LabError>().error).toContain(broken);
      const annotation = (
        await lab.call("GET", `${API}/annotations/${hash(name)}`)
      ).json<LabAnnotation>();
      expect(annotation.locked).toBe(true);
    }
    const removed = await lab.call("DELETE", `${API}/annotations/${hash("test-a")}`);
    expect(removed.status).toBe(409);
    expect(removed.json<LabError>().error).toContain(broken);
    const file = await readAnnotationFile(fixture.repoRoot, "test");
    expect(file.images.map((image) => [image.sha256, image.category])).toEqual([
      [hash("test-a"), "general"],
    ]);

    // Dev images are unaffected.
    expect((await put("orange", draftOf("reference", [[0, 0]]))).status).toBe(200);
    expect((await lab.call("DELETE", `${API}/annotations/${hash("orange")}`)).status).toBe(204);

    // Once the report is fixed, the test images unlock (test-a was never measured).
    await rm(directory, { recursive: true });
    expect((await put("test-a", draftOf("dark", [[2, 2]]))).status).toBe(200);
    const fixed = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    expect(fixed.problems).toEqual([]);
    expect(fixed.images.some((image) => image.locked)).toBe(false);
  });

  test("an unreadable reports folder also locks every test annotation", async () => {
    const reports = join(fixture.repoRoot, "eval", "reports");
    await rm(reports, { recursive: true });
    await writeFile(reports, "not a folder");
    const inventory = (await lab.call("GET", `${API}/inventory`)).json<LabInventory>();
    expect(inventory.problems).toHaveLength(1);
    expect(inventory.problems[0]).toContain(reports);
    expect(inventory.images.filter((image) => image.locked)).toHaveLength(2);
    const reply = await put("test-b", draftOf("general", [[1, 1]]));
    expect(reply.status).toBe(409);
    expect(reply.json<LabError>().error).toContain(reports);
    expect((await put("orange", draftOf("general", [[0, 0]]))).status).toBe(200);
  });
});

describe("security", () => {
  test("a foreign Origin gives 403 and changes nothing", async () => {
    for (const origin of ["http://localhost:3000", "null", `http://localhost:${lab.port}`]) {
      const reply = await lab.call("GET", `${API}/inventory`, { headers: { origin } });
      expect(reply.status, origin).toBe(403);
      expect(reply.json<LabError>()).toEqual({ error: "Forbidden." });
    }
    const reply = await lab.call("PUT", `${API}/annotations/${hash("orange")}`, {
      headers: { ...JSON_HEADERS, origin: "http://localhost:3000" },
      body: JSON.stringify(draftOf("general", [[0, 0]])),
    });
    expect(reply.status).toBe(403);
    await expect(stat(join(fixture.repoRoot, "eval", "annotations", "dev.json"))).rejects.toThrow();
  });

  test("a cross-site or same-site Sec-Fetch-Site gives 403", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const reply = await lab.call("GET", `${API}/inventory`, {
        headers: { "sec-fetch-site": site },
      });
      expect(reply.status, site).toBe(403);
    }
  });

  test("a foreign Host gives 403 (DNS rebinding)", async () => {
    for (const host of ["evil.example", `evil.example:${lab.port}`, "localhost.evil.example"]) {
      const reply = await lab.call("GET", `${API}/inventory`, {
        headers: { host, origin: `http://${host}` },
      });
      expect(reply.status, host).toBe(403);
    }
  });

  test("the same origin passes", async () => {
    const origin = `http://127.0.0.1:${lab.port}`;
    for (const headers of [
      { origin },
      { origin, "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "none" },
      { host: `localhost:${lab.port}`, origin: `http://localhost:${lab.port}` },
    ]) {
      const reply = await lab.call("GET", `${API}/inventory`, { headers });
      expect(reply.status).toBe(200);
    }
    const reply = await lab.call("PUT", `${API}/annotations/${hash("orange")}`, {
      headers: { ...JSON_HEADERS, origin, "sec-fetch-site": "same-origin" },
      body: JSON.stringify(draftOf("general", [[0, 0]])),
    });
    expect(reply.status).toBe(200);
  });
});

describe("routes", () => {
  test("GET / redirects to the lab and other paths go to next", async () => {
    const root = await lab.call("GET", "/");
    expect(root.status).toBe(302);
    expect(root.headers.location).toBe("/lab/");
    for (const path of ["/lab/", "/src/core/types.ts", "/__lab/apix", "/__lab"]) {
      const reply = await lab.call("GET", path);
      expect(reply.status, path).toBe(404);
      expect(reply.body.toString("utf8")).toBe("next");
    }
  });

  test("unknown routes give 404", async () => {
    for (const path of [
      API,
      `${API}/`,
      `${API}/nope`,
      `${API}/inventory/`,
      `${API}/images/${hash("orange")}`,
      `${API}/images/${hash("orange")}.png/x`,
      `${API}/images/${hash("orange")}/pixels`,
      `${API}/annotations/${hash("orange")}/x`,
      `${API}/analysis`,
    ]) {
      const reply = await lab.call("GET", path);
      expect(reply.status, path).toBe(404);
      expect(reply.json<LabError>()).toEqual({ error: "Not found." });
    }
  });

  test("a wrong method gives 405 with an allow header", async () => {
    for (const [method, path, allow] of [
      ["POST", `${API}/inventory`, "GET"],
      ["DELETE", `${API}/images/${hash("orange")}.png`, "GET"],
      ["PUT", `${API}/images/${hash("orange")}/pixel?x=0&y=0`, "GET"],
      ["PATCH", `${API}/annotations/${hash("orange")}`, "GET, PUT, DELETE"],
      ["POST", `${API}/analysis/${hash("orange")}?count=5`, "GET"],
      ["HEAD", `${API}/inventory`, "GET"],
    ] as const) {
      const reply = await lab.call(method, path);
      expect(reply.status, `${method} ${path}`).toBe(405);
      expect(reply.headers.allow).toBe(allow);
    }
  });

  test("after close(), API requests give 503", async () => {
    const fresh = await startLab(fixture);
    fresh.handler.close();
    try {
      expect((await fresh.call("GET", `${API}/inventory`)).status).toBe(503);
    } finally {
      await fresh.close();
    }
  });
});

describe("bounded work", () => {
  test(`at most ${MAX_JOBS} jobs run, ${MAX_QUEUED_JOBS} wait, and one more gives 503`, async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let running = 0;
    let maxRunning = 0;
    const gated = countingLoader({
      async encodeDisplayPng(image) {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await gate;
        running -= 1;
        return analyzer.encodeDisplayPng(image);
      },
    });
    const fresh = await startLab(fixture, gated.loadAnalyzer);
    try {
      const png = `${API}/images/${hash("orange")}.png`;
      const accepted = Array.from({ length: MAX_JOBS + MAX_QUEUED_JOBS }, () =>
        fresh.call("GET", png),
      );
      await vi.waitFor(() => expect(running).toBe(MAX_JOBS));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const busy = await fresh.call("GET", png);
      expect(busy.status).toBe(503);
      expect(busy.json<LabError>().error).toContain("busy");
      release();
      const replies = await Promise.all(accepted);
      expect(replies.every((reply) => reply.status === 200)).toBe(true);
      expect(maxRunning).toBe(MAX_JOBS);
    } finally {
      release();
      await fresh.close();
    }
  });
});

describe("with duplicates, a conflict, a broken file, and more images", () => {
  let extra: EvalFixture;
  let extraLab: Lab;
  const EXTRA_COUNT = 10;
  const extraHashes: string[] = [];
  let conflictHash = "";
  let brokenHash = "";

  beforeAll(async () => {
    const { default: sharp } = await import("sharp");
    const { createHash } = await import("node:crypto");
    extra = await createEvalFixture();
    const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
    await mkdir(join(extra.evalDir, "dev", "extra"), { recursive: true });
    for (let index = 0; index < EXTRA_COUNT; index++) {
      const png = await sharp({
        create: {
          width: 8,
          height: 6,
          channels: 4,
          background: { r: index * 20, g: 100, b: 200 - index * 10, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      await writeFile(
        join(extra.evalDir, "dev", "extra", `${String(index).padStart(2, "0")}.png`),
        png,
      );
      extraHashes.push(sha(png));
    }
    await copyFile(
      join(extra.evalDir, "dev", "orange.png"),
      join(extra.evalDir, "dev", "copy.png"),
    );
    await copyFile(
      join(extra.evalDir, "test", "a.webp"),
      join(extra.evalDir, "dev", "conflict.webp"),
    );
    conflictHash = extra.images["test-a"].sha256;
    const garbage = new TextEncoder().encode("this is not an image");
    await writeFile(join(extra.evalDir, "dev", "broken.png"), garbage);
    brokenHash = sha(garbage);
    extraLab = await startLab(extra);
  });
  afterAll(async () => {
    await extraLab.close();
    await extra.cleanup();
  });

  test("the inventory counts duplicates and reports the conflict", async () => {
    const inventory = (await extraLab.call("GET", `${API}/inventory`)).json<LabInventory>();
    expect(inventory.duplicates).toBe(1);
    expect(inventory.problems).toEqual([
      "The same image is dev/conflict.webp and test/a.webp. Keep it in one set only.",
    ]);
    expect(inventory.images.filter((image) => image.sha256 === conflictHash)).toHaveLength(2);
    expect(inventory.images).toHaveLength(6 + EXTRA_COUNT + 2); // + broken.png and conflict.webp
  });

  test("a conflicting image is blind and cannot be annotated", async () => {
    const analysis = await extraLab.call("GET", `${API}/analysis/${conflictHash}?count=5`);
    expect(analysis.status).toBe(403);
    const reply = await extraLab.call("PUT", `${API}/annotations/${conflictHash}`, {
      headers: JSON_HEADERS,
      body: JSON.stringify(draftOf("general", [[0, 0]])),
    });
    expect(reply.status).toBe(409);
    expect(reply.json<LabError>().error).toContain("both dev/ and test/");
  });

  test("a file that fails to decode gives 422 with its error code", async () => {
    for (const path of [
      `${API}/images/${brokenHash}.png`,
      `${API}/images/${brokenHash}/pixel?x=0&y=0`,
      `${API}/annotations/${brokenHash}`,
      `${API}/analysis/${brokenHash}?count=5`,
    ]) {
      const reply = await extraLab.call("GET", path);
      expect(reply.status, path).toBe(422);
      expect(reply.json<LabError>().error).toMatch(/^UNSUPPORTED_FORMAT: /);
    }
  });

  test("10 concurrent PUTs to different images all persist", async () => {
    const replies = await Promise.all(
      extraHashes.map((sha256, index) =>
        extraLab.call("PUT", `${API}/annotations/${sha256}`, {
          headers: JSON_HEADERS,
          body: JSON.stringify(draftOf("general", [[index % 8, 0]])),
        }),
      ),
    );
    expect(replies.map((reply) => reply.status)).toEqual(extraHashes.map(() => 200));
    const file = await readAnnotationFile(extra.repoRoot, "dev");
    expect(file.images.map((image) => image.sha256).sort()).toEqual([...extraHashes].sort());
    expect(file.images.map((image) => image.id)).toEqual(
      extraHashes.map((_, index) => `dev-${String(index + 1).padStart(3, "0")}`),
    );
  });

  test("an image changed or removed after the scan is not served under its old hash", async () => {
    const { default: sharp } = await import("sharp");
    const fresh = await startLab(extra);
    try {
      await fresh.call("GET", `${API}/inventory`);
      const changed = await sharp({
        create: { width: 8, height: 6, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .png()
        .toBuffer();
      await writeFile(join(extra.evalDir, "dev", "extra", "00.png"), changed);
      await rm(join(extra.evalDir, "dev", "extra", "01.png"));
      const replaced = await fresh.call("GET", `${API}/images/${extraHashes[0]}/pixel?x=0&y=0`);
      expect(replaced.status).toBe(404);
      expect(replaced.json<LabError>().error).toBe(
        "The image changed on disk. Reload the inventory.",
      );
      const removed = await fresh.call("GET", `${API}/images/${extraHashes[1]}.png`);
      expect(removed.status).toBe(404);
      expect(removed.json<LabError>().error).toBe(
        "The image is no longer in the evaluation folder.",
      );
    } finally {
      await fresh.close();
    }
  });
});
