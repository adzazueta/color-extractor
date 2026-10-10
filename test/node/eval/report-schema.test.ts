import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import type { SetName } from "../../../eval/lib/annotation-schema.js";
import { EvalError } from "../../../eval/lib/locate.js";
import {
  listReports,
  measuredTestHashes,
  parseReport,
  REPORT_SCHEMA_VERSION,
  type ImageModeResult,
  type Report,
} from "../../../eval/lib/report-schema.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "report-schema-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const mode: ImageModeResult = { colors: ["#d9822b"], firstHit: true, top3Hit: true, nearest: null };

function report(set: SetName, algorithmVersion: string, hashes: readonly string[]): Report {
  const counts = { firstHits: 0, top3Hits: 0 };
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    set,
    header: {
      algorithmVersion,
      packageVersion: "0.4.0-next.0",
      commit: "c".repeat(40),
      dirty: false,
      generatedAt: "2026-10-20T18:04:05Z",
      threshold: 0.06,
      count: 5,
      decoder: { sharp: "0.35.5", libvips: "8.18.7" },
      annotations: { dev: null, test: null },
      testAnnotationsChanged: null,
    },
    summary: {
      measured: hashes.length,
      pending: 0,
      orphaned: 0,
      duplicates: 0,
      errors: 0,
      sampleDrift: 0,
      perceptual: counts,
      population: counts,
      perceptualMinusPopulation: 0,
    },
    categories: [],
    calibration: null,
    dark: [],
    images: hashes.map((sha256, index) => ({
      id: `${set}-${String(index + 1).padStart(3, "0")}`,
      sha256,
      category: "general",
      error: null,
      perceptual: mode,
      population: mode,
    })),
  };
}

async function store(version: string, set: SetName, content: Report | string): Promise<void> {
  const directory = join(root, version);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${set}.json`),
    typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

test("parseReport accepts a valid report and returns it", () => {
  const original = report("dev", "1-a", ["a".repeat(64)]);
  expect(parseReport(JSON.stringify(original), "dev.json")).toEqual(original);
});

test("parseReport rejects what is not a report", () => {
  const valid = report("test", "1-a", ["a".repeat(64)]);
  const bad: [string, unknown][] = [
    ["not json", "{"],
    ["an array", []],
    ["another schemaVersion", { ...valid, schemaVersion: 2 }],
    ["an unknown set", { ...valid, set: "other" }],
    ["no header", { ...valid, header: undefined }],
    ["a numeric version", { ...valid, header: { ...valid.header, algorithmVersion: 1 } }],
    ["no images", { ...valid, images: undefined }],
    ["an image without a hash", { ...valid, images: [{ id: "test-001" }] }],
  ];
  for (const [name, value] of bad) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    expect(() => parseReport(text, "label"), name).toThrow(EvalError);
  }
});

test("a missing reports folder gives empty lists", async () => {
  const missing = join(root, "none");
  expect(await listReports(missing, "dev")).toEqual({ reports: [], problems: [] });
  expect((await measuredTestHashes(missing)).size).toBe(0);
});

test("listReports sorts by algorithm version and reports the unparsable", async () => {
  await store("2-b", "dev", report("dev", "2-b", []));
  await store("1-a", "dev", report("dev", "1-a", []));
  await store("3-c", "dev", "{ broken");
  await store("4-d", "dev", report("test", "4-d", []));
  await store("5-e", "test", report("test", "5-e", []));
  await writeFile(join(root, "README.md"), "not a folder");
  const { reports, problems } = await listReports(root, "dev");
  expect(reports.map((r) => r.algorithmVersion)).toEqual(["1-a", "2-b"]);
  expect(problems).toHaveLength(2);
  expect(problems[0]).toContain(join("3-c", "dev.json"));
  expect(problems[1]).toContain(join("4-d", "dev.json"));
});

test("measuredTestHashes collects the images of every stored test report", async () => {
  const one = "1".repeat(64);
  const two = "2".repeat(64);
  const three = "3".repeat(64);
  await store("1-a", "test", report("test", "1-a", [one, two]));
  await store("2-b", "test", report("test", "2-b", [two, three]));
  await store("2-b", "dev", report("dev", "2-b", ["4".repeat(64)]));
  expect(await measuredTestHashes(root)).toEqual(new Set([one, two, three]));
});
