import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import {
  annotationsPath,
  EVAL_DIR_ENV,
  EVAL_REPOSITORY_NAME,
  EvalError,
  mainCheckoutRoot,
  reportDir,
  reportsRoot,
  repositoryRoot,
  resolveEvalDir,
  resultsDir,
} from "../../../eval/lib/locate.js";

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "locate-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs git without the user's configuration, so no signing or hooks interfere with the temp repository. */
function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}

test("repositoryRoot is the folder with package.json and eval/", () => {
  const repo = repositoryRoot();
  expect(repo.endsWith("/")).toBe(false);
  expect(resolve(repo, "eval", "lib", "locate.ts")).toBe(
    resolve(import.meta.dirname, "../../../eval/lib/locate.ts"),
  );
});

test("the env override wins, and a relative value resolves against the working directory", () => {
  expect(resolveEvalDir("/repo", { [EVAL_DIR_ENV]: "/somewhere/images" })).toBe(
    "/somewhere/images",
  );
  expect(resolveEvalDir("/repo", { [EVAL_DIR_ENV]: "images" })).toBe(
    resolve(process.cwd(), "images"),
  );
});

test("an empty or missing env value uses the sibling of the main checkout", async () => {
  const main = join(root, "color-extractor");
  await mkdir(main);
  git(main, "init", "-q");
  const expected = join(root, EVAL_REPOSITORY_NAME);
  expect(resolveEvalDir(main, { [EVAL_DIR_ENV]: "" })).toBe(expected);
  expect(resolveEvalDir(main, {})).toBe(expected);
});

test("in a linked worktree, mainCheckoutRoot is the main folder", async () => {
  const main = join(root, "color-extractor");
  await mkdir(main);
  git(main, "init", "-q");
  git(main, "commit", "-q", "--allow-empty", "-m", "initial");
  const linked = join(root, ".worktrees", "color-extractor", "task");
  await mkdir(dirname(linked), { recursive: true });
  git(main, "worktree", "add", "-q", "--detach", linked);
  expect(mainCheckoutRoot(linked)).toBe(main);
  expect(mainCheckoutRoot(main)).toBe(main);
  expect(resolveEvalDir(linked, {})).toBe(join(root, EVAL_REPOSITORY_NAME));
});

test("without git, mainCheckoutRoot falls back to the given folder", async () => {
  const plain = join(root, "plain");
  await mkdir(plain);
  expect(mainCheckoutRoot(plain)).toBe(plain);
  expect(mainCheckoutRoot(join(root, "missing"))).toBe(join(root, "missing"));
});

test("the real checkout resolves a sibling named color-extractor-eval", () => {
  const evalDir = resolveEvalDir(repositoryRoot(), {});
  expect(basename(evalDir)).toBe(EVAL_REPOSITORY_NAME);
  expect(dirname(evalDir)).toBe(dirname(mainCheckoutRoot(repositoryRoot())));
});

test("paths inside the repository and the evaluation folder", () => {
  expect(annotationsPath("/repo", "dev")).toBe("/repo/eval/annotations/dev.json");
  expect(annotationsPath("/repo", "test")).toBe("/repo/eval/annotations/test.json");
  expect(reportsRoot("/repo")).toBe("/repo/eval/reports");
  expect(reportDir("/repo", "1-population-only")).toBe("/repo/eval/reports/1-population-only");
  expect(resultsDir("/eval", "1-population-only")).toBe("/eval/results/1-population-only");
});

test("reportDir and resultsDir reject names that are not safe folder names", () => {
  for (const bad of ["..", ".", "a/b", "a\\b", "", "-x", ".hidden", "a b", "x".repeat(65)]) {
    expect(() => reportDir("/repo", bad), JSON.stringify(bad)).toThrow(EvalError);
    expect(() => resultsDir("/eval", bad), JSON.stringify(bad)).toThrow(EvalError);
  }
  expect(reportDir("/repo", "x".repeat(64))).toContain("x".repeat(64));
  expect(reportDir("/repo", "2.0_beta-1")).toBe("/repo/eval/reports/2.0_beta-1");
});

test("EvalError is an Error with its own name", () => {
  const error = new EvalError("Do this.");
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("EvalError");
});
