import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { readGitState, readPackageVersion } from "../../../eval/lib/git.js";
import { EvalError } from "../../../eval/lib/locate.js";

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "eval-git-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs git without the user's configuration, so no signing or hooks interfere with the temp repository. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
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

async function repository(): Promise<string> {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "x.ts"), "export const x = 1;\n");
  await writeFile(join(root, "package.json"), '{ "version": "1.2.3" }\n');
  await writeFile(join(root, "pnpm-lock.yaml"), "lock\n");
  await writeFile(join(root, "README.md"), "readme\n");
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "first");
  return git(root, "rev-parse", "HEAD").trim();
}

describe("readGitState", () => {
  test("a clean tree has the HEAD commit and is not dirty", async () => {
    const head = await repository();
    expect(readGitState(root)).toEqual({ commit: head, dirty: false });
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });

  test("a modified file in src/ is dirty", async () => {
    await repository();
    await writeFile(join(root, "src", "x.ts"), "export const x = 2;\n");
    expect(readGitState(root).dirty).toBe(true);
  });

  test("an untracked file in src/ is dirty", async () => {
    await repository();
    await writeFile(join(root, "src", "new.ts"), "export {};\n");
    expect(readGitState(root).dirty).toBe(true);
  });

  test("package.json and pnpm-lock.yaml changes are dirty", async () => {
    await repository();
    await writeFile(join(root, "package.json"), '{ "version": "1.2.4" }\n');
    expect(readGitState(root).dirty).toBe(true);
    git(root, "checkout", "--", "package.json");
    expect(readGitState(root).dirty).toBe(false);
    await writeFile(join(root, "pnpm-lock.yaml"), "changed\n");
    expect(readGitState(root).dirty).toBe(true);
  });

  test("a change outside the watched paths is not dirty", async () => {
    await repository();
    await writeFile(join(root, "README.md"), "changed\n");
    await writeFile(join(root, "untracked.txt"), "x\n");
    expect(readGitState(root).dirty).toBe(false);
  });

  test("without git the commit is unknown and the tree is dirty", () => {
    expect(readGitState(root)).toEqual({ commit: "unknown", dirty: true });
  });

  test("a repository without commits has an unknown commit", () => {
    git(root, "init", "-q", "-b", "main");
    expect(readGitState(root).commit).toBe("unknown");
  });
});

describe("readPackageVersion", () => {
  test("reads the version", async () => {
    await writeFile(join(root, "package.json"), '{ "version": "1.2.3" }\n');
    expect(readPackageVersion(root)).toBe("1.2.3");
  });

  test("throws EvalError when it is missing or unreadable", async () => {
    expect(() => readPackageVersion(root)).toThrow(EvalError);
    await writeFile(join(root, "package.json"), "{}\n");
    expect(() => readPackageVersion(root)).toThrow(EvalError);
  });
});
