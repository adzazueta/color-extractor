import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SetName } from "../../eval/lib/annotation-schema.js";

export interface EvalFixtureImage {
  readonly sha256: string;
  readonly relativePath: string;
  readonly set: SetName;
}

export interface EvalFixture {
  readonly evalDir: string;
  /** A temp folder with eval/annotations and eval/reports. */
  readonly repoRoot: string;
  readonly images: Readonly<
    Record<"orange" | "dark" | "alpha" | "jpeg" | "test-a" | "test-b", EvalFixtureImage>
  >;
  cleanup(): Promise<void>;
}

const WIDTH = 64;
const HEIGHT = 48;

type Rgba = readonly [number, number, number, number];

function raw(colorAt: (x: number, y: number, i: number) => Rgba): Uint8Array {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      data.set(colorAt(x, y, i), i * 4);
    }
  }
  return data;
}

/** A small deterministic generator, so JPEG noise is the same on every run. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * A temporary evaluation folder and repository, built from tiny images made with sharp:
 * dev/ has orange.png (3 blocks, 64×48), sub/dark.jpg (noisy near-blacks), alpha.png (alpha 0,
 * 128, and 255), and photo.jpg; test/ has a.webp (lossless) and b.png; plus .gitkeep, notes.txt,
 * and anim.gif, which discovery skips.
 */
export async function createEvalFixture(): Promise<EvalFixture> {
  const { default: sharp } = await import("sharp");
  const root = await mkdtemp(join(tmpdir(), "eval-fixture-"));
  const evalDir = join(root, "color-extractor-eval");
  const repoRoot = join(root, "color-extractor");

  const encode = (data: Uint8Array) =>
    sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } });

  const orange = await encode(
    raw((_x, _y, i) =>
      i < 1843 ? [217, 130, 43, 255] : i < 2764 ? [40, 170, 180, 255] : [245, 245, 245, 255],
    ),
  )
    .png()
    .toBuffer();
  const random = lcg(7);
  const dark = await encode(
    raw(() => {
      const level = Math.floor(random() * 22);
      return [level, level, Math.min(255, level + 3), 255];
    }),
  )
    .jpeg({ quality: 90 })
    .toBuffer();
  const alpha = await encode(
    raw((x) => (x < 21 ? [200, 30, 30, 0] : x < 42 ? [30, 160, 60, 128] : [30, 60, 200, 255])),
  )
    .png()
    .toBuffer();
  const jpeg = await encode(raw((x, y) => [x * 4, y * 5, 128, 255]))
    .jpeg({ quality: 90 })
    .toBuffer();
  const testA = await encode(raw((x) => (x < 40 ? [20, 120, 220, 255] : [230, 200, 30, 255])))
    .webp({ lossless: true })
    .toBuffer();
  const testB = await encode(raw((_x, y) => (y < 30 ? [120, 40, 160, 255] : [250, 250, 250, 255])))
    .png()
    .toBuffer();

  const files: [SetName, string, Uint8Array][] = [
    ["dev", "orange.png", orange],
    ["dev", "sub/dark.jpg", dark],
    ["dev", "alpha.png", alpha],
    ["dev", "photo.jpg", jpeg],
    ["test", "a.webp", testA],
    ["test", "b.png", testB],
  ];
  const image = (set: SetName, relativePath: string, data: Uint8Array): EvalFixtureImage => ({
    sha256: createHash("sha256").update(data).digest("hex"),
    relativePath,
    set,
  });

  await mkdir(join(evalDir, "dev", "sub"), { recursive: true });
  await mkdir(join(evalDir, "test"), { recursive: true });
  await mkdir(join(repoRoot, "eval", "annotations"), { recursive: true });
  await mkdir(join(repoRoot, "eval", "reports"), { recursive: true });
  for (const [set, relativePath, data] of files) {
    await writeFile(join(evalDir, set, relativePath), data);
  }
  await writeFile(join(evalDir, "dev", ".gitkeep"), "");
  await writeFile(join(evalDir, "test", ".gitkeep"), "");
  await writeFile(join(evalDir, "dev", "notes.txt"), "notes\n");
  await writeFile(join(evalDir, "dev", "anim.gif"), "GIF89a");

  return {
    evalDir,
    repoRoot,
    images: {
      orange: image("dev", "orange.png", orange),
      dark: image("dev", "sub/dark.jpg", dark),
      alpha: image("dev", "alpha.png", alpha),
      jpeg: image("dev", "photo.jpg", jpeg),
      "test-a": image("test", "a.webp", testA),
      "test-b": image("test", "b.png", testB),
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
