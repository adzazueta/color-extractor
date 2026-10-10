import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import {
  loadAnnotations,
  saveAnnotations,
  sha256Hex,
  writeFileAtomic,
} from "../../../eval/lib/annotation-files.js";
import {
  AnnotationError,
  emptyAnnotationFile,
  upsertAnnotation,
} from "../../../eval/lib/annotation-schema.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "annotation-files-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const annotated = upsertAnnotation(emptyAnnotationFile("dev"), {
  id: "dev-001",
  sha256: "a".repeat(64),
  category: "dark",
  width: 10,
  height: 10,
  acceptable: [{ samples: [{ x: 1, y: 2, hex: "#101010" }] }],
});

test("a missing file gives an empty file and null", async () => {
  const loaded = await loadAnnotations(join(directory, "none.json"), "test");
  expect(loaded).toEqual({ file: emptyAnnotationFile("test"), sha256: null });
});

test("a saved file loads back equal, and the hash is that of the bytes", async () => {
  const path = join(directory, "nested", "dev.json");
  const written = await saveAnnotations(path, annotated);
  expect(written).toBe(sha256Hex(await readFile(path)));
  const loaded = await loadAnnotations(path, "dev");
  expect(loaded.file).toEqual(annotated);
  expect(loaded.sha256).toBe(written);
});

test("sha256Hex of a string and of its bytes agree", () => {
  expect(sha256Hex("abc")).toBe(sha256Hex(new TextEncoder().encode("abc")));
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("no temp file is left behind", async () => {
  await saveAnnotations(join(directory, "dev.json"), annotated);
  expect(await readdir(directory)).toEqual(["dev.json"]);
});

test("no temp file is left behind when the rename fails", async () => {
  const path = join(directory, "blocked.json");
  await mkdir(path);
  await writeFile(join(path, "inside"), "x");
  await expect(writeFileAtomic(path, "data")).rejects.toThrow();
  expect(await readdir(directory)).toEqual(["blocked.json"]);
});

test("an invalid file throws AnnotationError", async () => {
  const path = join(directory, "dev.json");
  await writeFile(path, '{"schemaVersion":1,"set":"dev","images":[],"title":"x"}');
  await expect(loadAnnotations(path, "dev")).rejects.toBeInstanceOf(AnnotationError);
  await expect(loadAnnotations(path, "test")).rejects.toBeInstanceOf(AnnotationError);
});

test("concurrent writes to different files do not collide", async () => {
  await Promise.all(
    [1, 2, 3, 4].map((n) => writeFileAtomic(join(directory, `f${n}.txt`), `data ${n}`)),
  );
  expect((await readdir(directory)).sort()).toEqual(["f1.txt", "f2.txt", "f3.txt", "f4.txt"]);
});
