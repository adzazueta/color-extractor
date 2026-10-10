import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  emptyAnnotationFile,
  parseAnnotationFile,
  serializeAnnotationFile,
  type AnnotationFile,
  type SetName,
} from "./annotation-schema.js";

export interface LoadedAnnotations {
  readonly file: AnnotationFile;
  readonly sha256: string | null;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** A missing file gives an empty file and sha256 null; an invalid one throws AnnotationError. */
export async function loadAnnotations(path: string, set: SetName): Promise<LoadedAnnotations> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { file: emptyAnnotationFile(set), sha256: null };
    }
    throw error;
  }
  const file = parseAnnotationFile(new TextDecoder().decode(bytes), set, path);
  return { file, sha256: sha256Hex(bytes) };
}

let counter = 0;

/**
 * Writes to "<path>.<pid>.<counter>.tmp" in the same folder (flag "wx"), then renames over `path`.
 * Creates the parent folder. On failure the temp file is removed and the error rethrown.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  counter += 1;
  const temporary = `${path}.${process.pid}.${counter}.tmp`;
  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Writes the canonical text atomically; returns the SHA-256 of the bytes written. */
export async function saveAnnotations(path: string, file: AnnotationFile): Promise<string> {
  const text = serializeAnnotationFile(file);
  await writeFileAtomic(path, text);
  return sha256Hex(text);
}
