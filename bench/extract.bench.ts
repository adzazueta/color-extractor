import { readdir, readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";
import { test } from "vite-plus/test";
import type { extractColors as sourceExtractColors, Mode } from "@/node/index.js";
import { loadSharp } from "@/node/sharp.js";
import { repositoryRoot, resolveEvalDir } from "../eval/lib/locate.js";

// Local only: the covers cannot be in the public repository and shared runners are too noisy.
// Run with `vp run bench`. It reads `dev/` only, never `test/`.
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
      covers.push({ name, megapixels: (width * height) / 1_000_000 });
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

for (const cover of covers) {
  if (cover === undefined) continue;
  const bytes = new Uint8Array(await readFile(join(devDir, cover.name)));
  test(`${cover.name} (${cover.megapixels.toFixed(2)} MP)`, async ({ bench }) => {
    await bench.compare(
      ...MODES.map((mode) =>
        bench(mode, async () => {
          await extractColors(bytes, { mode });
        }),
      ),
      OPTIONS,
    );
  });
}

const worstCase = worstCasePixels();
test("synthetic worst case (16.78 MP, every RGB color once, raw pixels)", async ({ bench }) => {
  await bench.compare(
    ...MODES.map((mode) =>
      bench(mode, async () => {
        await extractColors(worstCase, { mode });
      }),
    ),
    WORST_CASE_OPTIONS,
  );
});
