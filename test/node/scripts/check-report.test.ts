import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";

interface Result {
  exempt: boolean;
  problems: string[];
  checked: string[];
}
interface CheckReportModule {
  checkReport: (input: { version: string; algorithmVersion: string; root: string }) => Result;
}

const scripts = new URL("../../../scripts/", import.meta.url);
// A computed specifier keeps TypeScript from asking for declarations of the plain .mjs script.
const specifier = new URL("check-report.mjs", scripts).href;
const { checkReport } = (await import(specifier)) as CheckReportModule;

const FILES = ["dev.md", "dev.json", "test.md", "test.json", "bench.md"];
const roots: string[] = [];

/** A temporary repository root with eval/reports/<algorithmVersion>/ holding the given files. */
function makeRoot(files: Record<string, string> | null, algorithmVersion = "3"): string {
  const root = mkdtempSync(join(tmpdir(), "check-report-"));
  roots.push(root);
  if (files !== null) {
    const directory = join(root, "eval", "reports", algorithmVersion);
    mkdirSync(directory, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(directory, name), body);
  }
  return root;
}

function allFiles(testJson = JSON.stringify({ header: { algorithmVersion: "3" } })) {
  return Object.fromEntries(FILES.map((name) => [name, name === "test.json" ? testJson : "x"]));
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("checkReport", () => {
  test("a prerelease is exempt, even without reports", () => {
    const result = checkReport({
      version: "0.4.0-next.1",
      algorithmVersion: "3",
      root: makeRoot(null),
    });
    expect(result).toEqual({ exempt: true, problems: [], checked: [] });
  });

  test("a stable version with every file and a matching test.json passes", () => {
    const result = checkReport({
      version: "0.4.0",
      algorithmVersion: "3",
      root: makeRoot(allFiles()),
    });
    expect(result.exempt).toBe(false);
    expect(result.problems).toEqual([]);
    expect(result.checked).toHaveLength(5);
  });

  test("a stable version without the folder fails", () => {
    const result = checkReport({ version: "0.4.0", algorithmVersion: "3", root: makeRoot(null) });
    expect(result.problems).toEqual(["The folder eval/reports/3/ does not exist."]);
  });

  test("a missing file fails and is named", () => {
    const files = allFiles();
    delete files["bench.md"];
    const result = checkReport({ version: "0.4.0", algorithmVersion: "3", root: makeRoot(files) });
    expect(result.problems).toEqual(["The file eval/reports/3/bench.md is missing."]);
  });

  test("every problem is listed", () => {
    const files = allFiles();
    delete files["dev.md"];
    delete files["test.md"];
    const result = checkReport({ version: "1.0.0", algorithmVersion: "3", root: makeRoot(files) });
    expect(result.problems).toHaveLength(2);
  });

  test("a test.json with another algorithmVersion fails", () => {
    const root = makeRoot(allFiles(JSON.stringify({ header: { algorithmVersion: "2" } })));
    const result = checkReport({ version: "0.4.0", algorithmVersion: "3", root });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("test.json names algorithmVersion");
  });

  test("a test.json without a header fails", () => {
    const root = makeRoot(allFiles("{}"));
    expect(checkReport({ version: "0.4.0", algorithmVersion: "3", root }).problems).toHaveLength(1);
  });

  test("an unparsable test.json fails", () => {
    const root = makeRoot(allFiles("{not json"));
    const result = checkReport({ version: "0.4.0", algorithmVersion: "3", root });
    expect(result.problems).toEqual(["eval/reports/3/test.json is not valid JSON."]);
  });
});
