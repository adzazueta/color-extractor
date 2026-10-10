import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { SetName } from "./annotation-schema.js";
import { EVAL_DIR_ENV, EvalError } from "./locate.js";

/** Matched without regard to case. */
export const IMAGE_EXTENSIONS: readonly string[] = [".jpg", ".jpeg", ".png", ".webp", ".avif"];
/** The package's default `maxBytes`. */
export const MAX_IMAGE_BYTES: number = 33_554_432;
export const MAX_SCANNED_FILES: number = 10_000;
export const MAX_DEPTH: number = 8;

export interface DiscoveredImage {
  readonly set: SetName;
  readonly sha256: string;
  /** Absolute; local use only, never in reports. */
  readonly path: string;
  /** POSIX, relative to the set folder; lab and console only. */
  readonly relativePath: string;
  readonly bytes: number;
}
export type SkipReason =
  | "unsupported-extension"
  | "too-large"
  | "symlink"
  | "not-a-file"
  | "too-deep";
export interface SkippedFile {
  readonly set: SetName;
  readonly relativePath: string;
  readonly reason: SkipReason;
}
export interface DuplicateFile {
  readonly set: SetName;
  readonly relativePath: string;
  readonly sha256: string;
  readonly duplicateOf: string;
}
export interface SetConflict {
  readonly sha256: string;
  readonly dev: string;
  readonly test: string;
}
export interface Inventory {
  readonly evalDir: string;
  /** Unique by hash, sorted by relativePath. */
  readonly images: Readonly<Record<SetName, readonly DiscoveredImage[]>>;
  readonly duplicates: readonly DuplicateFile[];
  readonly skipped: readonly SkippedFile[];
  /** The same file in dev/ and test/. */
  readonly conflicts: readonly SetConflict[];
}

/** key "<path>\0<size>\0<mtimeMs>" → sha256; the lab keeps one across scans. */
export type HashCache = Map<string, string>;

/** Strings compare by code unit, never by locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isSupportedImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extname(name).toLowerCase());
}

/** Streaming SHA-256, lowercase hex. */
export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Uint8Array);
  return hash.digest("hex");
}

interface Candidate {
  readonly path: string;
  readonly relativePath: string;
  readonly bytes: number;
  readonly mtimeMs: number;
}

async function requireFolder(path: string, what: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isDirectory()) {
    throw new EvalError(
      `${what} was not found at ${path}. Clone color-extractor-eval next to the repository or set ${EVAL_DIR_ENV}.`,
    );
  }
}

async function walkSet(
  set: SetName,
  setDir: string,
  skipped: SkippedFile[],
  budget: { remaining: number },
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  async function visit(directory: string, prefix: string, depth: number): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      compare(a.name, b.name),
    );
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skipped.push({ set, relativePath, reason: "symlink" });
      } else if (entry.isDirectory()) {
        if (depth >= MAX_DEPTH) skipped.push({ set, relativePath, reason: "too-deep" });
        else await visit(path, relativePath, depth + 1);
      } else if (entry.isFile()) {
        budget.remaining -= 1;
        if (budget.remaining < 0) {
          throw new EvalError(
            `The evaluation folder has more than ${MAX_SCANNED_FILES} files. Remove the ones that are not images.`,
          );
        }
        if (!isSupportedImageName(entry.name)) {
          skipped.push({ set, relativePath, reason: "unsupported-extension" });
          continue;
        }
        const info = await stat(path);
        if (info.size > MAX_IMAGE_BYTES) {
          skipped.push({ set, relativePath, reason: "too-large" });
          continue;
        }
        candidates.push({ path, relativePath, bytes: info.size, mtimeMs: info.mtimeMs });
      } else {
        skipped.push({ set, relativePath, reason: "not-a-file" });
      }
    }
  }

  await visit(setDir, "", 0);
  return candidates;
}

/**
 * Walks `<evalDir>/dev` and `<evalDir>/test` and hashes the images.
 *
 * @throws EvalError when evalDir, dev/, or test/ is missing or not a folder, or the folders hold
 * more than MAX_SCANNED_FILES files.
 */
export async function scanEvalDir(
  evalDir: string,
  options?: { readonly hashCache?: HashCache },
): Promise<Inventory> {
  await requireFolder(evalDir, "The evaluation folder");
  for (const set of ["dev", "test"] as const) {
    await requireFolder(join(evalDir, set), `The "${set}" folder`);
  }
  const cache = options?.hashCache;
  const skipped: SkippedFile[] = [];
  const duplicates: DuplicateFile[] = [];
  const budget = { remaining: MAX_SCANNED_FILES };
  const images: Record<SetName, DiscoveredImage[]> = { dev: [], test: [] };

  for (const set of ["dev", "test"] as const) {
    const candidates = (await walkSet(set, join(evalDir, set), skipped, budget)).sort((a, b) =>
      compare(a.relativePath, b.relativePath),
    );
    const firstOf = new Map<string, string>();
    for (const candidate of candidates) {
      const key = `${candidate.path}\0${candidate.bytes}\0${candidate.mtimeMs}`;
      let sha256 = cache?.get(key);
      if (sha256 === undefined) {
        sha256 = await hashFile(candidate.path);
        cache?.set(key, sha256);
      }
      const first = firstOf.get(sha256);
      if (first !== undefined) {
        duplicates.push({ set, relativePath: candidate.relativePath, sha256, duplicateOf: first });
        continue;
      }
      firstOf.set(sha256, candidate.relativePath);
      images[set].push({
        set,
        sha256,
        path: candidate.path,
        relativePath: candidate.relativePath,
        bytes: candidate.bytes,
      });
    }
  }

  const inTest = new Map(images.test.map((image) => [image.sha256, image.relativePath]));
  const conflicts: SetConflict[] = [];
  for (const image of images.dev) {
    const test = inTest.get(image.sha256);
    if (test !== undefined) {
      conflicts.push({ sha256: image.sha256, dev: image.relativePath, test });
    }
  }
  conflicts.sort((a, b) => compare(a.sha256, b.sha256));
  skipped.sort((a, b) => compare(a.set, b.set) || compare(a.relativePath, b.relativePath));

  return { evalDir, images, duplicates, skipped, conflicts };
}
