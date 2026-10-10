import { isCategory, type Category } from "./categories.js";

export type SetName = "dev" | "test";
export const SET_NAMES: readonly SetName[] = ["dev", "test"];
export const ANNOTATION_SCHEMA_VERSION = 1 as const;
export const MAX_ACCEPTABLE_COLORS: number = 8;
export const MAX_SAMPLES_PER_COLOR: number = 16;
/** The package's default pixel limit. Not imported from `src/`, so this module stays config-safe. */
export const MAX_IMAGE_PIXELS: number = 16_777_216;

export interface Sample {
  readonly x: number;
  readonly y: number;
  readonly hex: string;
}

/** One acceptable color: the samples are eyedropper picks that all count as the same color. */
export interface AcceptableColor {
  readonly samples: readonly Sample[];
}

export interface ImageAnnotation {
  readonly id: string;
  readonly sha256: string;
  readonly category: Category;
  readonly width: number;
  readonly height: number;
  readonly acceptable: readonly AcceptableColor[];
}

export interface AnnotationFile {
  readonly schemaVersion: 1;
  readonly set: SetName;
  readonly images: readonly ImageAnnotation[];
}

/** Every problem found, each prefixed with its JSON path. */
export class AnnotationError extends Error {
  readonly problems: readonly string[];

  constructor(label: string, problems: readonly string[]) {
    super(`${label} is not a valid annotation file:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "AnnotationError";
    this.problems = problems;
  }
}

const ID_PATTERN = /^(dev|test)-([0-9]{3,})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/;

const FILE_KEYS: readonly string[] = ["schemaVersion", "set", "images"];
const IMAGE_KEYS: readonly string[] = ["id", "sha256", "category", "width", "height", "acceptable"];
const COLOR_KEYS: readonly string[] = ["samples"];
const SAMPLE_KEYS: readonly string[] = ["x", "y", "hex"];

export function emptyAnnotationFile(set: SetName): AnnotationFile {
  return { schemaVersion: ANNOTATION_SCHEMA_VERSION, set, images: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function at(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function shown(key: string): string {
  return JSON.stringify(key.length > 40 ? `${key.slice(0, 40)}...` : key);
}

function checkKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  problems: string[],
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) problems.push(`${at(path, key)}: unknown key ${shown(key)}.`);
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function sampleProblems(
  value: unknown,
  width: number | null,
  height: number | null,
  path: string,
  problems: string[],
): { readonly x: number; readonly y: number } | null {
  if (!isRecord(value)) {
    problems.push(`${path}: must be an object.`);
    return null;
  }
  checkKeys(value, SAMPLE_KEYS, path, problems);
  let position: { readonly x: number; readonly y: number } | null = null;
  const { x, y, hex } = value;
  const xOk =
    typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && (width === null || x < width);
  const yOk =
    typeof y === "number" && Number.isSafeInteger(y) && y >= 0 && (height === null || y < height);
  if (!xOk) problems.push(`${at(path, "x")}: must be an integer inside the image width.`);
  if (!yOk) problems.push(`${at(path, "y")}: must be an integer inside the image height.`);
  if (xOk && yOk) position = { x, y };
  if (typeof hex !== "string" || !HEX_PATTERN.test(hex)) {
    problems.push(`${at(path, "hex")}: must be a lowercase "#rrggbb" color.`);
  }
  return position;
}

/** Validates one annotation object (used by parse and by the lab before saving). Returns problems. */
export function annotationProblems(value: unknown, set: SetName, path: string): string[] {
  const problems: string[] = [];
  if (!isRecord(value)) return [`${path}: must be an object.`];
  checkKeys(value, IMAGE_KEYS, path, problems);

  const { id, sha256, category, width, height, acceptable } = value;
  const idMatch = typeof id === "string" ? ID_PATTERN.exec(id) : null;
  if (idMatch === null) {
    problems.push(`${at(path, "id")}: must look like "${set}-001" (at least 3 digits).`);
  } else if (idMatch[1] !== set) {
    problems.push(`${at(path, "id")}: must start with "${set}-".`);
  } else if (!Number.isSafeInteger(Number(idMatch[2])) || Number(idMatch[2]) < 1) {
    problems.push(`${at(path, "id")}: the number must be 1 or more.`);
  }
  if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)) {
    problems.push(`${at(path, "sha256")}: must be 64 lowercase hex characters.`);
  }
  if (!isCategory(category)) problems.push(`${at(path, "category")}: unknown category.`);

  const widthOk = isPositiveInteger(width);
  const heightOk = isPositiveInteger(height);
  if (!widthOk) problems.push(`${at(path, "width")}: must be a positive integer.`);
  if (!heightOk) problems.push(`${at(path, "height")}: must be a positive integer.`);
  if (widthOk && heightOk && width * height > MAX_IMAGE_PIXELS) {
    problems.push(`${path}: width × height must not exceed ${MAX_IMAGE_PIXELS} pixels.`);
  }

  const acceptablePath = at(path, "acceptable");
  if (
    !Array.isArray(acceptable) ||
    acceptable.length < 1 ||
    acceptable.length > MAX_ACCEPTABLE_COLORS
  ) {
    problems.push(`${acceptablePath}: must be an array of 1 to ${MAX_ACCEPTABLE_COLORS} colors.`);
  } else {
    const seen = new Set<string>();
    acceptable.forEach((color: unknown, colorIndex) => {
      const colorPath = `${acceptablePath}[${colorIndex}]`;
      if (!isRecord(color)) {
        problems.push(`${colorPath}: must be an object.`);
        return;
      }
      checkKeys(color, COLOR_KEYS, colorPath, problems);
      const samples = color["samples"];
      const samplesPath = at(colorPath, "samples");
      if (!Array.isArray(samples) || samples.length < 1 || samples.length > MAX_SAMPLES_PER_COLOR) {
        problems.push(`${samplesPath}: must be an array of 1 to ${MAX_SAMPLES_PER_COLOR} samples.`);
        return;
      }
      samples.forEach((sample: unknown, sampleIndex) => {
        const samplePath = `${samplesPath}[${sampleIndex}]`;
        const position = sampleProblems(
          sample,
          widthOk ? width : null,
          heightOk ? height : null,
          samplePath,
          problems,
        );
        if (position === null) return;
        const key = `${position.x},${position.y}`;
        if (seen.has(key))
          problems.push(`${samplePath}: the position is already used in this image.`);
        seen.add(key);
      });
    });
  }
  return problems;
}

/** Parses and fully validates (section 3.1). Throws AnnotationError with all problems. */
export function parseAnnotationFile(text: string, set: SetName, label: string): AnnotationFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AnnotationError(label, ["The text is not valid JSON."]);
  }
  if (!isRecord(value)) throw new AnnotationError(label, ["The top level must be an object."]);

  const problems: string[] = [];
  checkKeys(value, FILE_KEYS, "", problems);
  if (value["schemaVersion"] !== ANNOTATION_SCHEMA_VERSION) {
    problems.push(`schemaVersion: must be ${ANNOTATION_SCHEMA_VERSION}.`);
  }
  if (value["set"] !== set) problems.push(`set: must be "${set}".`);
  const images = value["images"];
  if (!Array.isArray(images)) {
    problems.push("images: must be an array.");
  } else {
    const ids = new Map<number, number>();
    const hashes = new Map<string, number>();
    images.forEach((image: unknown, index) => {
      const path = `images[${index}]`;
      problems.push(...annotationProblems(image, set, path));
      if (!isRecord(image)) return;
      const { id, sha256 } = image;
      const idMatch = typeof id === "string" ? ID_PATTERN.exec(id) : null;
      if (idMatch !== null) {
        const number = Number(idMatch[2]);
        const first = ids.get(number);
        if (first === undefined) ids.set(number, index);
        else problems.push(`${path}.id: duplicate of images[${first}].id.`);
      }
      if (typeof sha256 === "string" && SHA256_PATTERN.test(sha256)) {
        const first = hashes.get(sha256);
        if (first === undefined) hashes.set(sha256, index);
        else problems.push(`${path}.sha256: duplicate of images[${first}].sha256.`);
      }
    });
  }
  if (problems.length > 0) throw new AnnotationError(label, problems);
  return value as unknown as AnnotationFile;
}

/** The number of an id such as "dev-012". Throws RangeError for anything else. */
export function idNumber(id: string): number {
  const match = ID_PATTERN.exec(id);
  if (match === null) throw new RangeError("Not an annotation id.");
  return Number(match[2]);
}

function byIdNumber(a: ImageAnnotation, b: ImageAnnotation): number {
  const difference = idNumber(a.id) - idNumber(b.id);
  if (difference !== 0) return difference;
  return a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0;
}

/** Canonical text (section 3.1). */
export function serializeAnnotationFile(file: AnnotationFile): string {
  const ordered = {
    schemaVersion: file.schemaVersion,
    set: file.set,
    images: [...file.images].sort(byIdNumber).map((image) => ({
      id: image.id,
      sha256: image.sha256,
      category: image.category,
      width: image.width,
      height: image.height,
      acceptable: image.acceptable.map((color) => ({
        samples: color.samples.map((sample) => ({ x: sample.x, y: sample.y, hex: sample.hex })),
      })),
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** "<set>-NNN" with NNN = 1 + the largest number in use, zero-padded to 3 digits. */
export function nextImageId(file: AnnotationFile): string {
  let largest = 0;
  for (const image of file.images) largest = Math.max(largest, idNumber(image.id));
  return `${file.set}-${String(largest + 1).padStart(3, "0")}`;
}

/** Replaces the annotation with the same sha256, or appends; the result is sorted by id number. */
export function upsertAnnotation(
  file: AnnotationFile,
  annotation: ImageAnnotation,
): AnnotationFile {
  const images = file.images.filter((image) => image.sha256 !== annotation.sha256);
  images.push(annotation);
  images.sort(byIdNumber);
  return { ...file, images };
}

export function removeAnnotation(file: AnnotationFile, sha256: string): AnnotationFile {
  return { ...file, images: file.images.filter((image) => image.sha256 !== sha256) };
}

export function findAnnotation(file: AnnotationFile, sha256: string): ImageAnnotation | undefined {
  return file.images.find((image) => image.sha256 === sha256);
}

/** sha256 values annotated in both files (each must be in exactly one set). */
export function crossSetDuplicates(dev: AnnotationFile, test: AnnotationFile): string[] {
  const inTest = new Set(test.images.map((image) => image.sha256));
  return dev.images
    .map((image) => image.sha256)
    .filter((sha256) => inTest.has(sha256))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
