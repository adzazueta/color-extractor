import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { extname, join } from "node:path";
import { afterAll, test } from "vite-plus/test";
import type { extractColors as sourceExtractColors, Mode } from "@/node/index.js";
import { loadSharp } from "@/node/sharp.js";
import { loadAnnotations, sha256Hex } from "../eval/lib/annotation-files.js";
import { readGitState, readPackageVersion } from "../eval/lib/git.js";
import { annotationsPath, repositoryRoot, resolveEvalDir } from "../eval/lib/locate.js";
import { renderBenchMarkdown, type BenchCase, type ModeTiming } from "./report.js";

// Local only: the covers cannot be in the public repository and shared runners are too noisy.
// Run with `vp run bench`. It reads `dev/` only, never `test/`. When every case ran, it writes
// `eval/reports/<algorithmVersion>/bench.md` (neutral ids only, never file names).
//
// The timed code is the built package (`dist/node.js`, the file users get), not `src/`: Vite's
// module runner wraps every export of every source module in a getter, which would roughly triple
// the times. `vp run bench` builds `dist/` first.

const MODES: readonly Mode[] = ["population", "perceptual"];
const TARGET_MEGAPIXELS: readonly number[] = [0.13, 1.1, 2.3];
const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif)$/i;
const OPTIONS = { time: 2000, warmupTime: 500, iterations: 5, warmupIterations: 2 } as const;
const WORST_CASE_OPTIONS = { time: 0, warmupTime: 0, iterations: 3, warmupIterations: 1 } as const;

interface Cover {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly megapixels: number;
}

/**
 * For each target size, the development image whose decoded size is closest to it. Names are
 * visited in sorted order and only a strictly closer image replaces the current one, so ties go to
 * the smaller file name and the choice is deterministic. An image serves one target at most.
 */
async function pickCovers(devDir: string): Promise<readonly (Cover | undefined)[]> {
  const sharp = await loadSharp();
  const names = (await readdir(devDir)).filter((name) => IMAGE_EXTENSIONS.test(name)).sort();
  const covers: Cover[] = [];
  for (const name of names) {
    const { width, height } = await sharp(join(devDir, name)).metadata();
    if (width !== undefined && height !== undefined) {
      covers.push({ name, width, height, megapixels: (width * height) / 1_000_000 });
    }
  }
  const used = new Set<string>();
  return TARGET_MEGAPIXELS.map((target) => {
    let best: Cover | undefined;
    for (const cover of covers) {
      if (used.has(cover.name)) continue;
      if (
        best === undefined ||
        Math.abs(cover.megapixels - target) < Math.abs(best.megapixels - target)
      ) {
        best = cover;
      }
    }
    if (best !== undefined) used.add(best.name);
    return best;
  });
}

/** 4096 × 4096 pixels with every RGB color exactly once (the accepted worst case). */
function worstCasePixels(): { data: Uint8ClampedArray; width: number; height: number } {
  const side = 4096;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let index = 0; index < side * side; index++) {
    data[index * 4] = index >>> 16;
    data[index * 4 + 1] = (index >>> 8) & 255;
    data[index * 4 + 2] = index & 255;
    data[index * 4 + 3] = 255;
  }
  return { data, width: side, height: side };
}

type ExtractColors = typeof sourceExtractColors;
const entry = new URL("../dist/node.js", import.meta.url);
const extractColors: ExtractColors = await import(/* @vite-ignore */ entry.href).then(
  (module: { extractColors: ExtractColors }) => module.extractColors,
  (error: unknown) => {
    throw new Error(
      "Benchmark: dist/node.js is missing; build it with `vp pack` (or use `vp run bench`).",
      { cause: error },
    );
  },
);

const cpu = cpus()[0]?.model ?? "unknown CPU";
console.info(`Machine: ${cpu} (${cpus().length} cores), Node ${process.version}`);

let covers: readonly (Cover | undefined)[] = [];
let devDir = "";
try {
  devDir = join(resolveEvalDir(repositoryRoot()), "dev");
  covers = await pickCovers(devDir);
  if (covers.some((cover) => cover === undefined)) {
    console.warn("Benchmark: fewer development covers than sizes; some cases are skipped.");
  }
} catch {
  console.warn(
    `Benchmark: the development covers were not found at ${devDir || "the evaluation folder"}; ` +
      "set COLOR_EXTRACTOR_EVAL_DIR. Only the synthetic case runs.",
  );
}

// Results for the report, in case order. Covers come first, then the synthetic case.
const results: BenchCase[] = [];
const expectedCases = TARGET_MEGAPIXELS.length + 1;
let algorithmVersion = "";

interface Stored {
  get: (name: Mode) => {
    latency: { mean: number; min: number; max: number; samplesCount: number };
  };
}

function timings(storage: Stored): Pick<BenchCase, "population" | "perceptual"> {
  const pick = (mode: Mode): ModeTiming => {
    const { mean, min, max, samplesCount } = storage.get(mode).latency;
    return { mean, min, max, samples: samplesCount };
  };
  return { population: pick("population"), perceptual: pick("perceptual") };
}

const formatNames: Readonly<Record<string, string>> = {
  ".jpg": "JPEG",
  ".jpeg": "JPEG",
  ".png": "PNG",
  ".webp": "WebP",
  ".avif": "AVIF",
};

let annotatedIds: ReadonlyMap<string, string> = new Map();
if (covers.length > 0) {
  try {
    const { file } = await loadAnnotations(annotationsPath(repositoryRoot(), "dev"), "dev");
    annotatedIds = new Map(file.images.map((image) => [image.sha256, image.id]));
  } catch {
    console.warn("Benchmark: the development annotations could not be read; no report is written.");
  }
}

for (const cover of covers) {
  if (cover === undefined) continue;
  const bytes = new Uint8Array(await readFile(join(devDir, cover.name)));
  const id = annotatedIds.get(sha256Hex(bytes));
  test(`${cover.name} (${cover.megapixels.toFixed(2)} MP)`, async ({ bench }) => {
    const storage = await bench.compare(
      ...MODES.map((mode) =>
        bench(mode, async () => {
          const result = await extractColors(bytes, { mode });
          algorithmVersion = result.meta.algorithmVersion;
        }),
      ),
      OPTIONS,
    );
    if (id !== undefined) {
      results.push({
        label: id,
        format: formatNames[extname(cover.name).toLowerCase()] ?? "unknown",
        width: cover.width,
        height: cover.height,
        ...timings(storage),
      });
    } else {
      console.warn(`Benchmark: ${cover.name} has no development annotation; no report is written.`);
    }
  });
}

const worstCase = worstCasePixels();
test("synthetic worst case (16.78 MP, every RGB color once, raw pixels)", async ({ bench }) => {
  const storage = await bench.compare(
    ...MODES.map((mode) =>
      bench(mode, async () => {
        const result = await extractColors(worstCase, { mode });
        algorithmVersion = result.meta.algorithmVersion;
      }),
    ),
    WORST_CASE_OPTIONS,
  );
  results.push({
    label: "synthetic worst case (every RGB color once, raw pixels)",
    format: "raw",
    width: worstCase.width,
    height: worstCase.height,
    ...timings(storage),
  });
});

afterAll(async () => {
  if (results.length !== expectedCases || algorithmVersion === "") {
    console.warn(
      `Benchmark: ${results.length} of ${expectedCases} cases ran; eval/reports/<algorithmVersion>/bench.md was not written.`,
    );
    return;
  }
  const root = repositoryRoot();
  const sharp = await loadSharp();
  const git = readGitState(root);
  const markdown = renderBenchMarkdown({
    algorithmVersion,
    packageVersion: readPackageVersion(root),
    commit: git.commit,
    dirty: git.dirty,
    generatedAt: `${new Date().toISOString().slice(0, 19)}Z`,
    machine: {
      cpu,
      cores: cpus().length,
      memoryBytes: totalmem(),
      platform: platform(),
      release: release(),
      arch: arch(),
    },
    nodeVersion: process.version,
    sharp: sharp.versions.sharp,
    libvips: sharp.versions.vips,
    coverOptions: OPTIONS,
    worstCaseOptions: WORST_CASE_OPTIONS,
    cases: results,
  });
  const directory = join(root, "eval", "reports", algorithmVersion);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "bench.md"), markdown);
  console.info(`Benchmark: wrote eval/reports/${algorithmVersion}/bench.md`);
});
