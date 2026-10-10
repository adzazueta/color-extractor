import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EvalError } from "./locate.js";

export interface GitState {
  readonly commit: string;
  readonly dirty: boolean;
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * `commit` is `git rev-parse HEAD` (40 hex) or "unknown". `dirty` is true when
 * `git status --porcelain=v1 --untracked-files=all -- src package.json pnpm-lock.yaml` prints
 * anything, or when git fails.
 */
export function readGitState(repoRoot: string): GitState {
  let commit = "unknown";
  try {
    const head = git(repoRoot, ["rev-parse", "HEAD"]).trim();
    if (/^[0-9a-f]{40}$/.test(head)) commit = head;
  } catch {
    // No git, or no commit yet.
  }
  let dirty = true;
  try {
    const status = git(repoRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      "src",
      "package.json",
      "pnpm-lock.yaml",
    ]);
    dirty = status.trim() !== "";
  } catch {
    // Treated as dirty: an official report needs a known, clean tree.
  }
  return { commit, dirty };
}

/** The `version` field of the repository's package.json. */
export function readPackageVersion(repoRoot: string): string {
  const path = join(repoRoot, "package.json");
  let version: unknown;
  try {
    version = (JSON.parse(readFileSync(path, "utf8")) as { version?: unknown }).version;
  } catch (error) {
    throw new EvalError(`Cannot read ${path}.`, { cause: error });
  }
  if (typeof version !== "string" || version === "") {
    throw new EvalError(`${path} has no version.`);
  }
  return version;
}
