import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ColorExtractorError } from "@/core/errors.js";
import { ALGORITHM_VERSION } from "@/core/pipeline/parameters.js";
import { MATCH_THRESHOLD, REPORT_COUNT } from "./config.js";
import {
  AnnotationError,
  crossSetDuplicates,
  SET_NAMES,
  type ImageAnnotation,
  type SetName,
} from "./lib/annotation-schema.js";
import { loadAnnotations, sha256Hex, writeFileAtomic } from "./lib/annotation-files.js";
import * as analyzer from "./lib/analyze.js";
import { scanEvalDir, type DiscoveredImage } from "./lib/discover.js";
import { readGitState, readPackageVersion, type GitState } from "./lib/git.js";
import {
  annotationsPath,
  EvalError,
  repositoryRoot,
  reportDir,
  reportsRoot,
  resolveEvalDir,
  resultsDir,
} from "./lib/locate.js";
import type { ColorLike } from "./lib/match.js";
import { findPreviousTestReport, testAnnotationsChange } from "./lib/previous.js";
import { buildReport, type MeasuredImage } from "./lib/report.js";
import { listReports, type PreviousReportRef, type Report } from "./lib/report-schema.js";
import { renderReportJson, renderReportMarkdown } from "./lib/render.js";

export interface CliOptions {
  /** `--set dev|test|all` (default all). */
  readonly sets: readonly SetName[];
  /** `--out <dir>`: write there only (no copy, no previous-report flag). */
  readonly out: string | null;
  /** `--threshold <t>`: only with `--out` and `--set dev`; 0 < t <= 1. */
  readonly threshold: number | null;
  readonly help: boolean;
}

export const USAGE: string = [
  "Usage: vp run eval [options]",
  "",
  "Measures both modes on the evaluation sets and writes the reports.",
  "",
  "Options:",
  "  --set dev|test|all   Sets to measure (default: all).",
  "  --out <dir>          Exploratory run: write the reports only to <dir>.",
  "  --threshold <t>      Match threshold for this run (0 < t <= 1). Only with --out and --set dev.",
  "  --help               Show this help.",
  "",
  "Without --out the run is official: src/, package.json, and pnpm-lock.yaml must be committed,",
  "and the reports go to eval/reports/<algorithmVersion>/ and results/<algorithmVersion>/.",
  "",
  "Exit codes: 0 success, 1 evaluation error, 2 usage error.",
].join("\n");

/**
 * Parses the arguments with `node:util` `parseArgs` in strict mode.
 *
 * @throws EvalError on unknown or invalid options (exit code 2).
 */
export function parseCliArguments(argv: readonly string[]): CliOptions {
  let values;
  try {
    ({ values } = parseArgs({
      // `vp run eval` forwards its arguments as they are; a leading "--" typed out of habit is ignored.
      args: argv[0] === "--" ? argv.slice(1) : [...argv],
      options: {
        set: { type: "string" },
        out: { type: "string" },
        threshold: { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new EvalError((error as Error).message, { cause: error });
  }

  if (values.help === true) return { sets: SET_NAMES, out: null, threshold: null, help: true };

  const setValue = values.set ?? "all";
  if (setValue !== "dev" && setValue !== "test" && setValue !== "all") {
    throw new EvalError("--set must be dev, test, or all.");
  }
  const sets: readonly SetName[] = setValue === "all" ? SET_NAMES : [setValue];

  const out = values.out ?? null;
  if (out !== null && out === "") throw new EvalError("--out needs a folder.");

  let threshold: number | null = null;
  if (values.threshold !== undefined) {
    if (out === null) {
      throw new EvalError(
        "--threshold needs --out: official runs use the threshold of eval/config.ts.",
      );
    }
    if (sets.length !== 1 || sets[0] !== "dev") {
      throw new EvalError(
        "--threshold works only with --set dev: the test set uses the fixed threshold.",
      );
    }
    const parsed = values.threshold.trim() === "" ? Number.NaN : Number(values.threshold);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      throw new EvalError("--threshold must be a number greater than 0 and at most 1.");
    }
    threshold = parsed;
  }
  return { sets, out, threshold, help: false };
}

export interface EvaluationOptions {
  readonly repoRoot: string;
  readonly evalDir: string;
  readonly sets: readonly SetName[];
  /** MATCH_THRESHOLD or `--threshold`. */
  readonly threshold: number | null;
  readonly destination:
    | { readonly kind: "official" }
    | { readonly kind: "folder"; readonly path: string };
  readonly now: Date;
  readonly git: GitState;
  readonly packageVersion: string;
  readonly analyzer: Pick<
    typeof import("./lib/analyze.js"),
    "decodeEvalImage" | "extractEvalColors" | "pixelAt" | "decoderVersions"
  >;
  readonly log: (line: string) => void;
}

export interface EvaluationResult {
  readonly reports: readonly Report[];
  readonly written: readonly string[];
  readonly warnings: readonly string[];
}

interface SetPlan {
  readonly set: SetName;
  readonly annotated: readonly { annotation: ImageAnnotation; image: DiscoveredImage }[];
  readonly pending: readonly DiscoveredImage[];
  readonly orphaned: readonly ImageAnnotation[];
  readonly duplicates: number;
}

function fail(error: unknown, label: string): never {
  if (error instanceof AnnotationError) throw new EvalError(error.message, { cause: error });
  throw new EvalError(`${label}: ${(error as Error).message}`, { cause: error });
}

function otherSet(set: SetName): SetName {
  return set === "dev" ? "test" : "dev";
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function colors(result: {
  readonly colors: readonly { readonly hex: string; readonly coverage: number }[];
}): ColorLike[] {
  return result.colors.map((color) => ({ hex: color.hex, coverage: color.coverage }));
}

/**
 * The whole run, injectable for tests. Blocking problems throw EvalError before any file is
 * written.
 *
 * @throws EvalError
 */
export async function runEvaluation(options: EvaluationOptions): Promise<EvaluationResult> {
  const { repoRoot, evalDir, sets, threshold, destination, log } = options;
  const analyzer = options.analyzer;
  const official = destination.kind === "official";
  const warnings: string[] = [];

  // 1. Guards.
  if (official && options.git.dirty) {
    throw new EvalError(
      "src/, package.json, or pnpm-lock.yaml have uncommitted changes. Commit them, or use --out <dir> for an exploratory run.",
    );
  }
  if (sets.includes("test") && threshold === null) {
    throw new EvalError(
      "The match threshold is not set (eval/config.ts). Calibrate it on the development set first (specification 7.2).",
    );
  }

  // 2. Annotations: both files, always.
  const loaded = {} as Record<SetName, Awaited<ReturnType<typeof loadAnnotations>>>;
  for (const set of SET_NAMES) {
    try {
      loaded[set] = await loadAnnotations(annotationsPath(repoRoot, set), set);
    } catch (error) {
      fail(error, `Cannot read the ${set} annotations`);
    }
  }
  const both = crossSetDuplicates(loaded.dev.file, loaded.test.file);
  if (both.length > 0) {
    throw new EvalError(
      `${both.length} image(s) are annotated in both dev.json and test.json (first hash: ${both[0]}). Each image belongs to one set.`,
    );
  }

  // 3. Inventory.
  const inventory = await scanEvalDir(evalDir);
  if (inventory.conflicts.length > 0) {
    const conflict = inventory.conflicts[0]!;
    throw new EvalError(
      `${inventory.conflicts.length} file(s) exist in both dev/ and test/ (for example dev/${conflict.dev} and test/${conflict.test}). Remove one copy.`,
    );
  }
  const present = {} as Record<SetName, Map<string, DiscoveredImage>>;
  for (const set of SET_NAMES) {
    present[set] = new Map(inventory.images[set].map((image) => [image.sha256, image]));
  }
  for (const set of SET_NAMES) {
    for (const annotation of loaded[set].file.images) {
      if (present[otherSet(set)].has(annotation.sha256) && !present[set].has(annotation.sha256)) {
        throw new EvalError(
          `${annotation.id} is annotated in ${set}.json but its image is in ${otherSet(set)}/.`,
        );
      }
    }
  }
  for (const duplicate of inventory.duplicates) {
    warnings.push(
      `duplicate ${duplicate.set} file: ${duplicate.relativePath} (same as ${duplicate.duplicateOf})`,
    );
  }
  for (const skipped of inventory.skipped) {
    warnings.push(`skipped ${skipped.set} file (${skipped.reason}): ${skipped.relativePath}`);
  }

  // 4. Plans per requested set. Pending images are never decoded.
  const plans: SetPlan[] = [];
  for (const set of sets) {
    const images = present[set];
    const annotations = loaded[set].file.images;
    const annotatedHashes = new Set(annotations.map((annotation) => annotation.sha256));
    const annotated = annotations.flatMap((annotation) => {
      const image = images.get(annotation.sha256);
      return image === undefined ? [] : [{ annotation, image }];
    });
    const pending = inventory.images[set].filter((image) => !annotatedHashes.has(image.sha256));
    const orphaned = annotations.filter((annotation) => !images.has(annotation.sha256));
    if (official && set === "test" && pending.length > 0) {
      throw new EvalError(
        `${pending.length} test images have no annotation. Annotate every test image in the lab before measuring, or move them out of test/.`,
      );
    }
    for (const image of pending) warnings.push(`pending ${set} image: ${image.relativePath}`);
    for (const annotation of orphaned) {
      warnings.push(`orphaned ${set} annotation: ${annotation.id} has no image`);
    }
    plans.push({
      set,
      annotated,
      pending,
      orphaned,
      duplicates: inventory.duplicates.filter((duplicate) => duplicate.set === set).length,
    });
  }

  // 5. Analysis, one image at a time in id order.
  let algorithmVersion: string | null = null;
  const noteVersion = (version: string): void => {
    if (algorithmVersion !== null && algorithmVersion !== version) {
      throw new EvalError(
        "The algorithm version differs between results. Run the evaluation again.",
      );
    }
    algorithmVersion = version;
  };
  const measuredBySet = new Map<SetName, MeasuredImage[]>();
  for (const plan of plans) {
    const measured: MeasuredImage[] = [];
    for (const { annotation, image } of plan.annotated) {
      const bytes = await readFile(image.path);
      if (sha256Hex(bytes) !== annotation.sha256) {
        throw new EvalError(
          `${annotation.id} changed on disk since the scan (${image.relativePath}). Run the evaluation again.`,
        );
      }
      let decoded;
      try {
        decoded = await analyzer.decodeEvalImage(bytes);
      } catch (error) {
        if (!(error instanceof ColorExtractorError)) throw error;
        warnings.push(`${annotation.id} failed to decode (${error.code}): ${image.relativePath}`);
        measured.push({
          annotation,
          error: error.code,
          perceptual: [],
          population: [],
          sampleDrift: false,
        });
        continue;
      }
      let sampleDrift = decoded.width !== annotation.width || decoded.height !== annotation.height;
      if (!sampleDrift) {
        sampleDrift = annotation.acceptable.some((color) =>
          color.samples.some((sample) => {
            try {
              return analyzer.pixelAt(decoded, sample.x, sample.y).hex !== sample.hex;
            } catch (error) {
              if (error instanceof RangeError) return true;
              throw error;
            }
          }),
        );
      }
      if (sampleDrift) {
        warnings.push(
          `${annotation.id}: the decoded pixels differ from the annotation (${image.relativePath})`,
        );
      }
      const perceptual = analyzer.extractEvalColors(decoded, "perceptual", REPORT_COUNT);
      const population = analyzer.extractEvalColors(decoded, "population", REPORT_COUNT);
      noteVersion(perceptual.meta.algorithmVersion);
      noteVersion(population.meta.algorithmVersion);
      measured.push({
        annotation,
        error: null,
        perceptual: colors(perceptual),
        population: colors(population),
        sampleDrift,
      });
    }
    measuredBySet.set(plan.set, measured);
  }
  const version: string = algorithmVersion ?? ALGORITHM_VERSION;

  // 6. Header and 7. previous test report.
  const decoder = await analyzer.decoderVersions();
  let testChange: PreviousReportRef | null = null;
  if (official && sets.includes("test")) {
    const stored = await listReports(reportsRoot(repoRoot), "test");
    for (const problem of stored.problems) warnings.push(`stored report ignored: ${problem}`);
    testChange = testAnnotationsChange(findPreviousTestReport(stored.reports), loaded.test.sha256);
  }

  // 8. Reports.
  const reports: Report[] = [];
  const files: { readonly set: SetName; readonly json: string; readonly markdown: string }[] = [];
  for (const plan of plans) {
    const report = buildReport({
      set: plan.set,
      header: {
        algorithmVersion: version,
        packageVersion: options.packageVersion,
        commit: options.git.commit,
        dirty: options.git.dirty,
        generatedAt: iso(options.now),
        threshold,
        count: REPORT_COUNT,
        decoder,
        annotations: { dev: loaded.dev.sha256, test: loaded.test.sha256 },
        testAnnotationsChanged: plan.set === "test" ? testChange : null,
      },
      measured: measuredBySet.get(plan.set) ?? [],
      pending: plan.pending.length,
      orphaned: plan.orphaned.length,
      duplicates: plan.duplicates,
    });
    reports.push(report);
    files.push({
      set: plan.set,
      json: renderReportJson(report),
      markdown: renderReportMarkdown(report),
    });
  }

  // 9. Write: the same bytes in every destination.
  const folders =
    destination.kind === "official"
      ? [reportDir(repoRoot, version), resultsDir(evalDir, version)]
      : [destination.path];
  const written: string[] = [];
  for (const file of files) {
    for (const folder of folders) {
      await writeFileAtomic(join(folder, `${file.set}.json`), file.json);
      await writeFileAtomic(join(folder, `${file.set}.md`), file.markdown);
      written.push(join(folder, `${file.set}.json`), join(folder, `${file.set}.md`));
    }
  }

  // 10. Console summary (local; may name pending files).
  log(`Evaluation folder: ${evalDir}`);
  for (const report of reports) {
    const { summary } = report;
    log(
      `${report.set.padEnd(5)} ${summary.measured} measured, ${summary.pending} pending, ${summary.orphaned} orphaned`,
    );
    for (const mode of ["perceptual", "population"] as const) {
      const counts = summary[mode];
      const first = counts.firstHits === null ? "n/a" : `${counts.firstHits}/${summary.measured}`;
      const top3 = counts.top3Hits === null ? "n/a" : `${counts.top3Hits}/${summary.measured}`;
      log(`  ${mode}  first ${first}  top 3 ${top3}`);
    }
    if (official) {
      log(
        `Wrote eval/reports/${version}/${report.set}.{md,json} and ${relative(resolve(evalDir, ".."), resultsDir(evalDir, version))}/${report.set}.{md,json}`,
      );
    } else if (destination.kind === "folder") {
      log(`Wrote ${join(destination.path, report.set)}.{md,json}`);
    }
  }
  if (warnings.length > 0) {
    log("Warnings:");
    for (const warning of warnings) log(`  - ${warning}`);
  }
  return { reports, written, warnings };
}

/**
 * Exit code: 0 success, 1 evaluation error, 2 usage error. Prints errors itself.
 */
export async function main(argv: readonly string[]): Promise<number> {
  let parsed: CliOptions;
  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    if (!(error instanceof EvalError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    const repoRoot = repositoryRoot();
    await runEvaluation({
      repoRoot,
      evalDir: resolveEvalDir(repoRoot),
      sets: parsed.sets,
      threshold: parsed.threshold ?? MATCH_THRESHOLD,
      destination:
        parsed.out === null
          ? { kind: "official" }
          : { kind: "folder", path: resolve(process.cwd(), parsed.out) },
      now: new Date(),
      git: readGitState(repoRoot),
      packageVersion: readPackageVersion(repoRoot),
      analyzer,
      log: (line) => console.log(line),
    });
    return 0;
  } catch (error) {
    if (!(error instanceof EvalError)) throw error;
    console.error(error.message);
    return 1;
  }
}
