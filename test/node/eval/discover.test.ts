import { mkdir, mkdtemp, rm, symlink, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  hashFile,
  isSupportedImageName,
  MAX_DEPTH,
  MAX_IMAGE_BYTES,
  scanEvalDir,
  type HashCache,
} from "../../../eval/lib/discover.js";
import { sha256Hex } from "../../../eval/lib/annotation-files.js";
import { EvalError } from "../../../eval/lib/locate.js";
import { createEvalFixture, type EvalFixture } from "../../support/eval-fixture.js";

let fixture: EvalFixture;

beforeEach(async () => {
  fixture = await createEvalFixture();
});
afterEach(async () => {
  await fixture.cleanup();
});

describe("the fixture folder", () => {
  test("finds the images of both sets, sorted and hashed", async () => {
    const inventory = await scanEvalDir(fixture.evalDir);
    expect(inventory.images.dev.map((i) => i.relativePath)).toEqual([
      "alpha.png",
      "orange.png",
      "photo.jpg",
      "sub/dark.jpg",
    ]);
    expect(inventory.images.test.map((i) => i.relativePath)).toEqual(["a.webp", "b.png"]);
    for (const [name, expected] of Object.entries(fixture.images)) {
      const found = inventory.images[expected.set].find(
        (i) => i.relativePath === expected.relativePath,
      );
      expect(found?.sha256, name).toBe(expected.sha256);
      expect(found?.set).toBe(expected.set);
      expect(found?.path).toBe(join(fixture.evalDir, expected.set, expected.relativePath));
      expect(found?.bytes).toBeGreaterThan(0);
    }
    expect(inventory.duplicates).toEqual([]);
    expect(inventory.conflicts).toEqual([]);
    expect(inventory.evalDir).toBe(fixture.evalDir);
  });

  test("dotfiles are ignored and unsupported files are skipped", async () => {
    const inventory = await scanEvalDir(fixture.evalDir);
    expect(inventory.skipped).toEqual([
      { set: "dev", relativePath: "anim.gif", reason: "unsupported-extension" },
      { set: "dev", relativePath: "notes.txt", reason: "unsupported-extension" },
    ]);
  });

  test("the order is deterministic", async () => {
    const first = await scanEvalDir(fixture.evalDir);
    const second = await scanEvalDir(fixture.evalDir);
    expect(second).toEqual(first);
  });

  test("hashFile matches sha256Hex of the bytes", async () => {
    const orange = fixture.images.orange;
    expect(await hashFile(join(fixture.evalDir, "dev", orange.relativePath))).toBe(orange.sha256);
    expect(sha256Hex("abc")).toHaveLength(64);
  });
});

describe("walk rules", () => {
  async function copy(from: string, to: string): Promise<void> {
    const { readFile } = await import("node:fs/promises");
    await mkdir(join(to, ".."), { recursive: true });
    await writeFile(to, await readFile(from));
  }

  test("nested folders work and extensions match in any case", async () => {
    const orange = join(fixture.evalDir, "dev", "orange.png");
    await copy(orange, join(fixture.evalDir, "dev", "zz", "er", "A.PNG"));
    await writeFile(
      join(fixture.evalDir, "dev", "zz", "er", "B.JpEg"),
      "not an image but named like one",
    );
    const inventory = await scanEvalDir(fixture.evalDir);
    const names = inventory.images.dev.map((i) => i.relativePath);
    expect(names).toContain("zz/er/B.JpEg");
    // A.PNG has the content of orange.png, so it is a duplicate of it.
    expect(inventory.duplicates).toEqual([
      {
        set: "dev",
        relativePath: "zz/er/A.PNG",
        sha256: fixture.images.orange.sha256,
        duplicateOf: "orange.png",
      },
    ]);
  });

  test("dotfiles and dot folders are skipped silently", async () => {
    await mkdir(join(fixture.evalDir, "dev", ".git"));
    await writeFile(join(fixture.evalDir, "dev", ".git", "x.png"), "x");
    await writeFile(join(fixture.evalDir, "dev", "._orange.png"), "x");
    await writeFile(join(fixture.evalDir, "dev", ".DS_Store"), "x");
    const inventory = await scanEvalDir(fixture.evalDir);
    expect(inventory.images.dev).toHaveLength(4);
    expect(inventory.skipped.map((s) => s.relativePath)).toEqual(["anim.gif", "notes.txt"]);
  });

  test("symbolic links to files and folders are skipped and never followed", async () => {
    const outside = await mkdtemp(join(tmpdir(), "outside-"));
    try {
      await writeFile(join(outside, "secret.png"), "outside");
      await mkdir(join(outside, "folder"));
      await writeFile(join(outside, "folder", "inner.png"), "outside");
      await symlink(join(outside, "secret.png"), join(fixture.evalDir, "dev", "link.png"));
      await symlink(join(outside, "folder"), join(fixture.evalDir, "dev", "linked-folder"));
      const inventory = await scanEvalDir(fixture.evalDir);
      expect(inventory.skipped).toContainEqual({
        set: "dev",
        relativePath: "link.png",
        reason: "symlink",
      });
      expect(inventory.skipped).toContainEqual({
        set: "dev",
        relativePath: "linked-folder",
        reason: "symlink",
      });
      expect(inventory.images.dev).toHaveLength(4);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("a file above the byte limit is too-large and is never hashed", async () => {
    const huge = join(fixture.evalDir, "test", "huge.png");
    await writeFile(huge, "");
    await truncate(huge, MAX_IMAGE_BYTES + 1);
    const exact = join(fixture.evalDir, "test", "exact.png");
    await writeFile(exact, "");
    await truncate(exact, MAX_IMAGE_BYTES);
    const hashCache: HashCache = new Map();
    const inventory = await scanEvalDir(fixture.evalDir, { hashCache });
    expect(inventory.skipped).toContainEqual({
      set: "test",
      relativePath: "huge.png",
      reason: "too-large",
    });
    expect([...hashCache.keys()].some((key) => key.startsWith(huge))).toBe(false);
    // Exactly at the limit is hashed.
    expect([...hashCache.keys()].some((key) => key.startsWith(exact))).toBe(true);
  });

  test("folders deeper than MAX_DEPTH are skipped", async () => {
    let deep = join(fixture.evalDir, "dev");
    const parts: string[] = [];
    for (let level = 1; level <= MAX_DEPTH + 1; level++) {
      parts.push(`d${level}`);
      deep = join(deep, `d${level}`);
    }
    await mkdir(deep, { recursive: true });
    await writeFile(join(deep, "x.png"), "x");
    const inventory = await scanEvalDir(fixture.evalDir);
    expect(inventory.skipped).toContainEqual({
      set: "dev",
      relativePath: parts.join("/"),
      reason: "too-deep",
    });
    expect(inventory.images.dev.some((i) => i.relativePath.endsWith("x.png"))).toBe(false);
  });

  test("the first duplicate in path order wins", async () => {
    const content = "same bytes";
    await writeFile(join(fixture.evalDir, "dev", "zz.png"), content);
    await mkdir(join(fixture.evalDir, "dev", "a"));
    await writeFile(join(fixture.evalDir, "dev", "a", "copy.png"), content);
    await writeFile(join(fixture.evalDir, "dev", "a.png"), content);
    const inventory = await scanEvalDir(fixture.evalDir);
    // "a.png" sorts before "a/copy.png" by code unit ("." is before "/").
    const kept = inventory.images.dev.find((i) => i.sha256 === sha256Hex(content));
    expect(kept?.relativePath).toBe("a.png");
    expect(inventory.duplicates.map((d) => [d.relativePath, d.duplicateOf])).toEqual([
      ["a/copy.png", "a.png"],
      ["zz.png", "a.png"],
    ]);
  });

  test("the same file in dev/ and test/ is a conflict", async () => {
    const { readFile } = await import("node:fs/promises");
    await writeFile(
      join(fixture.evalDir, "test", "dev-copy.png"),
      await readFile(join(fixture.evalDir, "dev", "orange.png")),
    );
    const inventory = await scanEvalDir(fixture.evalDir);
    expect(inventory.conflicts).toEqual([
      { sha256: fixture.images.orange.sha256, dev: "orange.png", test: "dev-copy.png" },
    ]);
  });

  test("a missing evaluation folder, dev/, or test/ throws EvalError", async () => {
    await expect(scanEvalDir(join(fixture.evalDir, "nowhere"))).rejects.toThrow(EvalError);
    await expect(scanEvalDir(join(fixture.evalDir, "nowhere"))).rejects.toThrow(
      /COLOR_EXTRACTOR_EVAL_DIR/,
    );
    await rm(join(fixture.evalDir, "test"), { recursive: true });
    await expect(scanEvalDir(fixture.evalDir)).rejects.toThrow(EvalError);
    await writeFile(join(fixture.evalDir, "test"), "a file, not a folder");
    await expect(scanEvalDir(fixture.evalDir)).rejects.toThrow(EvalError);
  });
});

describe("hashCache", () => {
  test("avoids rehashing an unchanged file and rehashes after the file changes", async () => {
    const path = join(fixture.evalDir, "test", "swap.png");
    await writeFile(path, "AAAA");
    const old = new Date("2020-01-01T00:00:00Z");
    await utimes(path, old, old);
    const hashCache: HashCache = new Map();
    const first = await scanEvalDir(fixture.evalDir, { hashCache });
    const hashA = sha256Hex("AAAA");
    expect(first.images.test.find((i) => i.relativePath === "swap.png")?.sha256).toBe(hashA);

    // Same size and same modification time: the cached hash is reused, which proves no rehash.
    await writeFile(path, "BBBB");
    await utimes(path, old, old);
    const cached = await scanEvalDir(fixture.evalDir, { hashCache });
    expect(cached.images.test.find((i) => i.relativePath === "swap.png")?.sha256).toBe(hashA);

    // A new modification time rehashes.
    const later = new Date("2021-01-01T00:00:00Z");
    await utimes(path, later, later);
    const fresh = await scanEvalDir(fixture.evalDir, { hashCache });
    expect(fresh.images.test.find((i) => i.relativePath === "swap.png")?.sha256).toBe(
      sha256Hex("BBBB"),
    );
  });
});

test("isSupportedImageName", () => {
  for (const name of ["a.jpg", "a.JPEG", "a.png", "a.WebP", "a.avif", "dir.name/a.PNG"]) {
    expect(isSupportedImageName(name), name).toBe(true);
  }
  for (const name of ["a.gif", "a.txt", "a", "png", ".png.bak", "a.tiff"]) {
    expect(isSupportedImageName(name), name).toBe(false);
  }
});
