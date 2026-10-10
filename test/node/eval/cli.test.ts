import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  main,
  parseCliArguments,
  runEvaluation,
  type EvaluationOptions,
} from "../../../eval/cli.js";
import * as analyzer from "../../../eval/lib/analyze.js";
import { saveAnnotations } from "../../../eval/lib/annotation-files.js";
import {
  emptyAnnotationFile,
  type ImageAnnotation,
  type SetName,
} from "../../../eval/lib/annotation-schema.js";
import type { Category } from "../../../eval/lib/categories.js";
import { EvalError, annotationsPath, resultsDir, reportDir } from "../../../eval/lib/locate.js";
import { parseReport } from "../../../eval/lib/report-schema.js";
import { createEvalFixture, type EvalFixture } from "../../support/eval-fixture.js";

const THRESHOLD = 0.05;
const CLEAN = { commit: "c".repeat(40), dirty: false };
const NOW = new Date("2026-10-20T18:04:05.123Z");

let fixture: EvalFixture;

beforeEach(async () => {
  fixture = await createEvalFixture();
});
afterEach(async () => {
  await fixture.cleanup();
  vi.restoreAllMocks();
});

type ImageName = keyof EvalFixture["images"];

/** An annotation whose single sample is the real pixel at (x, y), read from the decoded image. */
async function annotate(
  name: ImageName,
  id: number,
  category: Category,
  overrides: { hex?: string; sha256?: string } = {},
): Promise<ImageAnnotation> {
  const { set, relativePath, sha256 } = fixture.images[name];
  const image = await analyzer.decodeEvalImage(
    await readFile(join(fixture.evalDir, set, relativePath)),
  );
  const x = image.width - 1;
  const y = 0;
  return {
    id: `${set}-${String(id).padStart(3, "0")}`,
    sha256: overrides.sha256 ?? sha256,
    category,
    width: image.width,
    height: image.height,
    acceptable: [{ samples: [{ x, y, hex: overrides.hex ?? analyzer.pixelAt(image, x, y).hex }] }],
  };
}

async function save(set: SetName, images: readonly ImageAnnotation[]): Promise<void> {
  await saveAnnotations(annotationsPath(fixture.repoRoot, set), {
    ...emptyAnnotationFile(set),
    images,
  });
}

async function annotateAll(): Promise<void> {
  await save("dev", [
    await annotate("orange", 1, "reference"),
    await annotate("dark", 2, "dark"),
    await annotate("alpha", 3, "general"),
    await annotate("jpeg", 4, "general"),
  ]);
  await save("test", [
    await annotate("test-a", 1, "character-art"),
    await annotate("test-b", 2, "general"),
  ]);
}

function options(overrides: Partial<EvaluationOptions> = {}): EvaluationOptions {
  return {
    repoRoot: fixture.repoRoot,
    evalDir: fixture.evalDir,
    sets: ["dev", "test"],
    threshold: THRESHOLD,
    destination: { kind: "official" },
    now: NOW,
    git: CLEAN,
    packageVersion: "0.0.0-test",
    analyzer,
    log: () => undefined,
    ...overrides,
  };
}

const read = (path: string) => readFile(path, "utf8");

describe("an official run", () => {
  test("writes identical bytes to the package repository and the evaluation folder", async () => {
    await annotateAll();
    const result = await runEvaluation(options());
    const version = result.reports[0]!.header.algorithmVersion;
    const left = reportDir(fixture.repoRoot, version);
    const right = resultsDir(fixture.evalDir, version);
    expect((await readdir(left)).sort()).toEqual(["dev.json", "dev.md", "test.json", "test.md"]);
    expect((await readdir(right)).sort()).toEqual(["dev.json", "dev.md", "test.json", "test.md"]);
    for (const file of ["dev.json", "dev.md", "test.json", "test.md"]) {
      expect(await read(join(left, file))).toBe(await read(join(right, file)));
    }
    expect(result.written).toHaveLength(8);
    const dev = parseReport(await read(join(left, "dev.json")), "dev");
    expect(dev.header).toMatchObject({
      packageVersion: "0.0.0-test",
      commit: CLEAN.commit,
      dirty: false,
      generatedAt: "2026-10-20T18:04:05Z",
      threshold: THRESHOLD,
      count: 5,
      testAnnotationsChanged: null,
    });
    expect(dev.header.decoder.sharp).toMatch(/^\d/);
    expect(dev.summary).toMatchObject({ measured: 4, pending: 0, orphaned: 0, errors: 0 });
    expect(dev.summary.perceptual.firstHits).not.toBeNull();
    expect(dev.calibration).not.toBeNull();
    const test = parseReport(await read(join(left, "test.json")), "test");
    expect(test.calibration).toBeNull();
    expect(test.summary.measured).toBe(2);
  });

  test("a single set writes only its files", async () => {
    await annotateAll();
    const result = await runEvaluation(options({ sets: ["dev"] }));
    const left = reportDir(fixture.repoRoot, result.reports[0]!.header.algorithmVersion);
    expect((await readdir(left)).sort()).toEqual(["dev.json", "dev.md"]);
  });

  test("refuses uncommitted changes before writing anything", async () => {
    await annotateAll();
    await expect(runEvaluation(options({ git: { ...CLEAN, dirty: true } }))).rejects.toThrow(
      /uncommitted changes.*--out/,
    );
    expect(await readdir(join(fixture.repoRoot, "eval", "reports"))).toEqual([]);
    await expect(readdir(join(fixture.evalDir, "results"))).rejects.toThrow();
  });

  test("refuses the test set while the threshold is null", async () => {
    await annotateAll();
    await expect(runEvaluation(options({ threshold: null }))).rejects.toThrow(EvalError);
    await expect(runEvaluation(options({ threshold: null }))).rejects.toThrow(
      /match threshold is not set/,
    );
    await expect(
      runEvaluation(
        options({
          threshold: null,
          destination: { kind: "folder", path: join(fixture.evalDir, "out") },
        }),
      ),
    ).rejects.toThrow(/match threshold is not set/);
  });

  test("refuses the test set while a test image has no annotation", async () => {
    await save("dev", [await annotate("orange", 1, "reference")]);
    await save("test", [await annotate("test-a", 1, "general")]);
    await expect(runEvaluation(options())).rejects.toThrow(/1 test images have no annotation/);
    expect(await readdir(join(fixture.repoRoot, "eval", "reports"))).toEqual([]);
  });

  test("a second test run flags changed test annotations", async () => {
    await annotateAll();
    const first = await runEvaluation(options({ sets: ["test"] }));
    expect(first.reports[0]?.header.testAnnotationsChanged).toBeNull();
    const unchanged = await runEvaluation(
      options({ sets: ["test"], now: new Date("2026-10-21T00:00:00Z") }),
    );
    expect(unchanged.reports[0]?.header.testAnnotationsChanged).toBeNull();

    await save("test", [
      await annotate("test-a", 1, "dark"),
      await annotate("test-b", 2, "general"),
    ]);
    const second = await runEvaluation(
      options({ sets: ["test"], now: new Date("2026-10-22T00:00:00Z") }),
    );
    const changed = second.reports[0]?.header.testAnnotationsChanged;
    expect(changed).toMatchObject({ generatedAt: "2026-10-21T00:00:00Z" });
    expect(changed?.testAnnotations).toBe(first.reports[0]?.header.annotations.test);
    const version = second.reports[0]!.header.algorithmVersion;
    const markdown = await read(join(reportDir(fixture.repoRoot, version), "test.md"));
    expect(markdown).toContain("**Warning:** the test annotations changed since the report of");
    expect(markdown).toBe(await read(join(resultsDir(fixture.evalDir, version), "test.md")));
  });
});

describe("an exploratory run", () => {
  test("works with uncommitted changes and writes only to the folder", async () => {
    await annotateAll();
    const out = join(fixture.evalDir, "..", "out");
    const result = await runEvaluation(
      options({ git: { ...CLEAN, dirty: true }, destination: { kind: "folder", path: out } }),
    );
    expect((await readdir(out)).sort()).toEqual(["dev.json", "dev.md", "test.json", "test.md"]);
    expect(result.written).toHaveLength(4);
    expect(await read(join(out, "dev.md"))).toContain(
      "**Warning:** generated from uncommitted changes",
    );
    expect(await readdir(join(fixture.repoRoot, "eval", "reports"))).toEqual([]);
    await expect(readdir(join(fixture.evalDir, "results"))).rejects.toThrow();
    const test = parseReport(await read(join(out, "test.json")), "test");
    expect(test.header.testAnnotationsChanged).toBeNull();
  });

  test("measures the development set with a null threshold, counting pending images", async () => {
    await save("dev", [
      await annotate("orange", 1, "reference"),
      await annotate("dark", 2, "dark"),
    ]);
    const out = join(fixture.evalDir, "..", "out");
    const decode = vi.fn(analyzer.decodeEvalImage);
    const result = await runEvaluation(
      options({
        sets: ["dev"],
        threshold: null,
        destination: { kind: "folder", path: out },
        analyzer: { ...analyzer, decodeEvalImage: decode },
      }),
    );
    const report = result.reports[0]!;
    expect(report.header.threshold).toBeNull();
    expect(report.summary).toMatchObject({ measured: 2, pending: 2, orphaned: 0 });
    expect(report.summary.perceptual).toEqual({ firstHits: null, top3Hits: null });
    expect(report.calibration?.thresholds).toHaveLength(10);
    expect(result.warnings.filter((line) => line.startsWith("pending dev image:"))).toHaveLength(2);
    // Pending images are never decoded: only the 2 annotated ones.
    expect(decode).toHaveBeenCalledTimes(2);
  });
});

describe("problems", () => {
  test("an annotation whose image is in the other set is an error", async () => {
    const wrong = await annotate("test-a", 1, "general", {});
    await save("dev", [{ ...wrong, id: "dev-001" }]);
    await expect(
      runEvaluation(
        options({
          sets: ["dev"],
          threshold: null,
          destination: { kind: "folder", path: join(fixture.evalDir, "out") },
        }),
      ),
    ).rejects.toThrow("dev-001 is annotated in dev.json but its image is in test/.");
  });

  test("the same hash annotated in both files is an error", async () => {
    const orange = await annotate("orange", 1, "general");
    await save("dev", [orange]);
    await save("test", [{ ...orange, id: "test-001" }]);
    await expect(runEvaluation(options())).rejects.toThrow(/annotated in both/);
  });

  test("an invalid annotation file lists the problems", async () => {
    await writeFile(annotationsPath(fixture.repoRoot, "dev"), "{}\n");
    await expect(
      runEvaluation(
        options({
          sets: ["dev"],
          threshold: 0.05,
          destination: { kind: "folder", path: join(fixture.evalDir, "out") },
        }),
      ),
    ).rejects.toThrow(/not a valid annotation file/);
  });

  test("a file in both dev/ and test/ is an error", async () => {
    await annotateAll();
    await writeFile(
      join(fixture.evalDir, "test", "copy.png"),
      await readFile(join(fixture.evalDir, "dev", "orange.png")),
    );
    await expect(runEvaluation(options())).rejects.toThrow(/both dev\/ and test\//);
  });

  test("sample drift is counted and the match uses the stored hex", async () => {
    await save("dev", [
      await annotate("orange", 1, "reference", { hex: "#123456" }),
      await annotate("dark", 2, "dark"),
    ]);
    const out = join(fixture.evalDir, "..", "out");
    const result = await runEvaluation(
      options({ sets: ["dev"], destination: { kind: "folder", path: out } }),
    );
    expect(result.reports[0]?.summary.sampleDrift).toBe(1);
    expect(
      result.warnings.some((line) => line.startsWith("dev-001: the decoded pixels differ")),
    ).toBe(true);
    expect(result.reports[0]?.images[0]?.perceptual.nearest?.hex).toBe("#123456");
  });

  test("a changed size counts as drift", async () => {
    const orange = await annotate("orange", 1, "reference");
    await save("dev", [{ ...orange, width: 128 }]);
    const result = await runEvaluation(
      options({
        sets: ["dev"],
        destination: { kind: "folder", path: join(fixture.evalDir, "out") },
      }),
    );
    expect(result.reports[0]?.summary.sampleDrift).toBe(1);
  });

  test("an image that fails to decode is a miss in both modes with its code", async () => {
    const bytes = new TextEncoder().encode("this is not an image");
    await writeFile(join(fixture.evalDir, "dev", "broken.png"), bytes);
    const { sha256Hex } = await import("../../../eval/lib/annotation-files.js");
    const orange = await annotate("orange", 1, "general");
    await save("dev", [
      orange,
      { ...orange, id: "dev-002", sha256: sha256Hex(bytes), category: "dark" },
    ]);
    const result = await runEvaluation(
      options({
        sets: ["dev"],
        destination: { kind: "folder", path: join(fixture.evalDir, "out") },
      }),
    );
    const report = result.reports[0]!;
    expect(report.summary).toMatchObject({ measured: 2, errors: 1 });
    expect(report.images[1]).toMatchObject({
      id: "dev-002",
      error: "UNSUPPORTED_FORMAT",
      perceptual: { firstHit: false, top3Hit: false, nearest: null },
    });
    expect(report.dark[0]?.id).toBe("dev-002");
    expect(
      result.warnings.some((line) => line.includes("failed to decode (UNSUPPORTED_FORMAT)")),
    ).toBe(true);
  });

  test("an annotation without an image is orphaned and not counted", async () => {
    const orange = await annotate("orange", 1, "general");
    await save("dev", [orange, { ...orange, id: "dev-002", sha256: "9".repeat(64) }]);
    const result = await runEvaluation(
      options({
        sets: ["dev"],
        destination: { kind: "folder", path: join(fixture.evalDir, "out") },
      }),
    );
    expect(result.reports[0]?.summary).toMatchObject({ measured: 1, orphaned: 1 });
  });

  test("duplicate files are warnings and are counted", async () => {
    await save("dev", [await annotate("orange", 1, "general")]);
    await writeFile(
      join(fixture.evalDir, "dev", "zz-copy.png"),
      await readFile(join(fixture.evalDir, "dev", "orange.png")),
    );
    const result = await runEvaluation(
      options({
        sets: ["dev"],
        destination: { kind: "folder", path: join(fixture.evalDir, "out") },
      }),
    );
    expect(result.reports[0]?.summary.duplicates).toBe(1);
    expect(result.warnings.some((line) => line.startsWith("duplicate dev file: zz-copy.png"))).toBe(
      true,
    );
  });

  test("a missing evaluation folder is an EvalError", async () => {
    await expect(
      runEvaluation(
        options({
          evalDir: join(fixture.evalDir, "missing"),
          sets: ["dev"],
          threshold: null,
          destination: { kind: "folder", path: join(fixture.evalDir, "out") },
        }),
      ),
    ).rejects.toThrow(EvalError);
  });
});

describe("privacy", () => {
  test("reports contain no file name, relative path, or folder", async () => {
    await annotateAll();
    const result = await runEvaluation(options());
    const version = result.reports[0]!.header.algorithmVersion;
    const names = Object.values(fixture.images).map((image) => image.relativePath);
    for (const folder of [
      reportDir(fixture.repoRoot, version),
      resultsDir(fixture.evalDir, version),
    ]) {
      for (const file of await readdir(folder)) {
        const text = await read(join(folder, file));
        for (const name of [
          ...names,
          ...names.map((n) => n.split("/").at(-1)!),
          fixture.evalDir,
          fixture.repoRoot,
          "notes.txt",
          "anim.gif",
        ]) {
          expect(text, `${file} mentions ${name}`).not.toContain(name);
        }
      }
    }
  });
});

describe("the console summary", () => {
  test("lists each set, the counts, where it wrote, and the warnings", async () => {
    await save("dev", [await annotate("orange", 1, "reference")]);
    const lines: string[] = [];
    await runEvaluation(options({ sets: ["dev"], log: (line) => lines.push(line) }));
    expect(lines[0]).toBe(`Evaluation folder: ${fixture.evalDir}`);
    expect(lines[1]).toBe("dev   1 measured, 3 pending, 0 orphaned");
    expect(lines[2]).toMatch(/^ {2}perceptual {2}first \d\/1 {2}top 3 \d\/1$/);
    expect(lines.some((line) => /^Wrote eval\/reports\/.+\/dev\.\{md,json\} and /.test(line))).toBe(
      true,
    );
    expect(lines).toContain("Warnings:");
    expect(lines.some((line) => line.startsWith("  - pending dev image:"))).toBe(true);
  });
});

describe("parseCliArguments", () => {
  test("defaults", () => {
    expect(parseCliArguments([])).toEqual({
      sets: ["dev", "test"],
      out: null,
      threshold: null,
      help: false,
    });
  });

  test("a leading double dash is ignored", () => {
    expect(parseCliArguments(["--", "--set", "dev"])).toEqual({
      sets: ["dev"],
      out: null,
      threshold: null,
      help: false,
    });
    expect(parseCliArguments(["--", "--help"]).help).toBe(true);
  });

  test("sets, out, and threshold", () => {
    expect(parseCliArguments(["--set", "test"]).sets).toEqual(["test"]);
    expect(parseCliArguments(["--set", "all"]).sets).toEqual(["dev", "test"]);
    expect(parseCliArguments(["--set=dev", "--out", "tmp/x", "--threshold", "0.06"])).toEqual({
      sets: ["dev"],
      out: "tmp/x",
      threshold: 0.06,
      help: false,
    });
    expect(parseCliArguments(["--help"]).help).toBe(true);
  });

  test.each([
    [["--nope"]],
    [["extra"]],
    [["--set", "other"]],
    [["--set"]],
    [["--out", ""]],
    [["--threshold", "0.05"]],
    [["--out", "x", "--threshold", "0.05"]],
    [["--set", "test", "--out", "x", "--threshold", "0.05"]],
    [["--set", "dev", "--out", "x", "--threshold", "0"]],
    [["--set", "dev", "--out", "x", "--threshold", "1.5"]],
    [["--set", "dev", "--out", "x", "--threshold", "abc"]],
    [["--set", "dev", "--out", "x", "--threshold", ""]],
  ])("rejects %j", (args) => {
    expect(() => parseCliArguments(args)).toThrow(EvalError);
  });

  test("a threshold of exactly 1 is allowed", () => {
    expect(parseCliArguments(["--set", "dev", "--out", "x", "--threshold", "1"]).threshold).toBe(1);
  });
});

describe("main", () => {
  test("--help exits 0 and a usage error exits 2, without touching anything", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await main(["--help"])).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain("Usage: vp run eval");
    expect(await main(["--bogus"])).toBe(2);
    expect(String(error.mock.calls[0]?.[0])).toContain("Usage: vp run eval");
    expect(await main(["--threshold", "0.05"])).toBe(2);
  });
});
