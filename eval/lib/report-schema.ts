import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SET_NAMES, type SetName } from "./annotation-schema.js";
import type { Category } from "./categories.js";
import { EvalError } from "./locate.js";
import type { DarkDiagnostic, SampleMatch } from "./match.js";

export const REPORT_SCHEMA_VERSION = 1 as const;

/** The previous report of the same set, for the "test annotations changed" flag. */
export interface PreviousReportRef {
  readonly algorithmVersion: string;
  readonly generatedAt: string;
  readonly testAnnotations: string | null;
}

export interface ReportHeader {
  readonly algorithmVersion: string;
  readonly packageVersion: string;
  readonly commit: string;
  readonly dirty: boolean;
  readonly generatedAt: string;
  readonly threshold: number | null;
  readonly count: number;
  readonly decoder: { readonly sharp: string; readonly libvips: string };
  /** SHA-256 of each annotation file; null when the file does not exist. */
  readonly annotations: { readonly dev: string | null; readonly test: string | null };
  /** Test report only: set when the test annotations differ from the previous report's. */
  readonly testAnnotationsChanged: PreviousReportRef | null;
}

/** Hits per mode; null when the threshold is null. */
export interface ModeCounts {
  readonly firstHits: number | null;
  readonly top3Hits: number | null;
}

export interface ReportSummary {
  readonly measured: number;
  readonly pending: number;
  readonly orphaned: number;
  readonly duplicates: number;
  readonly errors: number;
  readonly sampleDrift: number;
  readonly perceptual: ModeCounts;
  readonly population: ModeCounts;
  readonly perceptualMinusPopulation: number | null;
}

export interface CategoryCounts {
  readonly category: Category;
  readonly measured: number;
  readonly perceptual: ModeCounts;
  readonly population: ModeCounts;
}

export interface CalibrationRow {
  readonly threshold: number;
  readonly perceptual: number;
  readonly population: number;
}

/** `from` is -1 for the "no color" row; `to` is null for the last, open bucket. */
export interface DistanceBucket {
  readonly from: number;
  readonly to: number | null;
  readonly perceptual: number;
  readonly population: number;
}

export interface Calibration {
  readonly thresholds: readonly CalibrationRow[];
  readonly distances: readonly DistanceBucket[];
}

export interface DarkRow {
  readonly id: string;
  readonly perceptual: DarkDiagnostic;
  readonly population: DarkDiagnostic;
}

export interface ImageModeResult {
  readonly colors: readonly string[];
  readonly firstHit: boolean | null;
  readonly top3Hit: boolean | null;
  /** Describes the first color only; null when there is none. */
  readonly nearest: SampleMatch | null;
}

export interface ImageRow {
  readonly id: string;
  readonly sha256: string;
  readonly category: Category;
  /** A ColorExtractorError code when the analysis failed. */
  readonly error: string | null;
  readonly perceptual: ImageModeResult;
  readonly population: ImageModeResult;
}

export interface Report {
  readonly schemaVersion: 1;
  readonly set: SetName;
  readonly header: ReportHeader;
  readonly summary: ReportSummary;
  readonly categories: readonly CategoryCounts[];
  /** Null in the test report. */
  readonly calibration: Calibration | null;
  readonly dark: readonly DarkRow[];
  readonly images: readonly ImageRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Light validation: schemaVersion 1, set, header strings, and images[].sha256.
 *
 * @throws EvalError
 */
export function parseReport(text: string, label: string): Report {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new EvalError(`${label} is not valid JSON.`);
  }
  if (!isRecord(value) || value["schemaVersion"] !== REPORT_SCHEMA_VERSION) {
    throw new EvalError(`${label} is not a report with schemaVersion ${REPORT_SCHEMA_VERSION}.`);
  }
  if (!SET_NAMES.includes(value["set"] as SetName)) {
    throw new EvalError(`${label} has an unknown set.`);
  }
  const header = value["header"];
  if (!isRecord(header)) throw new EvalError(`${label} has no header.`);
  for (const key of ["algorithmVersion", "packageVersion", "commit", "generatedAt"]) {
    if (typeof header[key] !== "string")
      throw new EvalError(`${label}: header.${key} must be a string.`);
  }
  const images = value["images"];
  if (!Array.isArray(images)) throw new EvalError(`${label}: images must be an array.`);
  images.forEach((image: unknown, index) => {
    if (!isRecord(image) || typeof image["sha256"] !== "string") {
      throw new EvalError(`${label}: images[${index}].sha256 must be a string.`);
    }
  });
  return value as unknown as Report;
}

export interface StoredReport {
  readonly algorithmVersion: string;
  readonly report: Report;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every `<reportsRoot>/<version>/<set>.json` that parses, sorted by algorithmVersion; unparsable
 * files go to `problems` (path and reason). A missing reportsRoot gives empty lists.
 */
export async function listReports(
  reportsRoot: string,
  set: SetName,
): Promise<{ readonly reports: readonly StoredReport[]; readonly problems: readonly string[] }> {
  const reports: StoredReport[] = [];
  const problems: string[] = [];
  let entries;
  try {
    entries = await readdir(reportsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { reports, problems };
    throw error;
  }
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    if (!entry.isDirectory()) continue;
    const path = join(reportsRoot, entry.name, `${set}.json`);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      problems.push(`${path}: ${(error as Error).message}`);
      continue;
    }
    try {
      const report = parseReport(text, path);
      if (report.set !== set) throw new EvalError(`${path} is a ${report.set} report.`);
      reports.push({ algorithmVersion: report.header.algorithmVersion, report });
    } catch (error) {
      problems.push(`${path}: ${(error as Error).message}`);
    }
  }
  reports.sort((a, b) => compare(a.algorithmVersion, b.algorithmVersion));
  return { reports, problems };
}

/** sha256 of every image in any stored test report: the lab locks these annotations. */
export async function measuredTestHashes(reportsRoot: string): Promise<ReadonlySet<string>> {
  const { reports } = await listReports(reportsRoot, "test");
  const hashes = new Set<string>();
  for (const { report } of reports) for (const image of report.images) hashes.add(image.sha256);
  return hashes;
}
