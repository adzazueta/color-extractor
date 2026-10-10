import { execFileSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SetName } from "./annotation-schema.js";

/** A user-facing problem: the message says what to do. */
export class EvalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EvalError";
  }
}

export const EVAL_DIR_ENV = "COLOR_EXTRACTOR_EVAL_DIR" as const;
export const EVAL_REPOSITORY_NAME: string = "color-extractor-eval";

const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;

/** The checkout that contains this file. */
export function repositoryRoot(): string {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)));
}

/**
 * The main checkout: the folder that holds the common git directory when it is named ".git";
 * otherwise (no git, bare layout) `repoRoot`. In a linked worktree this is not `repoRoot`.
 */
export function mainCheckoutRoot(repoRoot: string): string {
  try {
    const output = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (output !== "" && basename(output) === ".git") return dirname(output);
  } catch {
    // No git, or not a repository.
  }
  return repoRoot;
}

/**
 * `env[EVAL_DIR_ENV]` when non-empty (resolved against the working directory); otherwise the
 * `color-extractor-eval` folder next to the main checkout.
 */
export function resolveEvalDir(
  repoRoot: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = env[EVAL_DIR_ENV];
  if (override !== undefined && override !== "") return resolve(process.cwd(), override);
  return resolve(mainCheckoutRoot(repoRoot), "..", EVAL_REPOSITORY_NAME);
}

export function annotationsPath(repoRoot: string, set: SetName): string {
  return resolve(repoRoot, "eval", "annotations", `${set}.json`);
}

export function reportsRoot(repoRoot: string): string {
  return resolve(repoRoot, "eval", "reports");
}

function checkVersion(algorithmVersion: string): void {
  if (!VERSION_PATTERN.test(algorithmVersion)) {
    throw new EvalError(
      "The algorithm version cannot be used as a folder name: use letters, digits, dots, hyphens, and underscores.",
    );
  }
}

/** Throws EvalError unless `algorithmVersion` is safe to use as a folder name. */
export function reportDir(repoRoot: string, algorithmVersion: string): string {
  checkVersion(algorithmVersion);
  return resolve(reportsRoot(repoRoot), algorithmVersion);
}

export function resultsDir(evalDir: string, algorithmVersion: string): string {
  checkVersion(algorithmVersion);
  return resolve(evalDir, "results", algorithmVersion);
}
