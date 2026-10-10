import type { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import type { ExtractionResult, Mode } from "@/core/types.js";
import { CALIBRATION_THRESHOLDS, MATCH_THRESHOLD } from "../../eval/config.js";
import type { DecodedImage } from "../../eval/lib/analyze.js";
import { saveAnnotations } from "../../eval/lib/annotation-files.js";
import {
  AnnotationError,
  annotationProblems,
  crossSetDuplicates,
  findAnnotation,
  MAX_ACCEPTABLE_COLORS,
  MAX_SAMPLES_PER_COLOR,
  nextImageId,
  removeAnnotation,
  SET_NAMES,
  upsertAnnotation,
  type AcceptableColor,
  type AnnotationFile,
  type ImageAnnotation,
  type SetName,
} from "../../eval/lib/annotation-schema.js";
import { CATEGORIES, isCategory } from "../../eval/lib/categories.js";
import { annotationsPath } from "../../eval/lib/locate.js";
import {
  API_PREFIX,
  LAB_PATH,
  MAX_BODY_BYTES,
  MAX_COUNT,
  MIN_COUNT,
  type AnnotationDraft,
  type LabAnalysis,
  type LabAnnotation,
  type LabImage,
  type LabInventory,
  type LabOrphan,
  type LabPixel,
} from "../api.js";
import {
  discardBody,
  HttpError,
  readJsonBody,
  sendBytes,
  sendError,
  sendJson,
  sendStatus,
} from "./http.js";
import { createLimiter } from "./limit.js";
import { rejectReason } from "./security.js";
import { createLabState, type FoundImage, type LabState, type TestLocks } from "./state.js";

/** The functions of `eval/lib/analyze.ts` the lab uses, loaded through Vite's SSR module runner. */
export interface Analyzer {
  decodeEvalImage(bytes: Uint8Array): Promise<DecodedImage>;
  extractEvalColors(image: DecodedImage, mode: Mode, count: number): ExtractionResult;
  pixelAt(
    image: DecodedImage,
    x: number,
    y: number,
  ): { readonly hex: string; readonly alpha: number };
  encodeDisplayPng(image: DecodedImage): Promise<Uint8Array>;
}

export interface LabContext {
  /** The repository: annotations and reports live under `<root>/eval`. */
  readonly root: string;
  readonly evalDir: string;
  readonly loadAnalyzer: () => Promise<Analyzer>;
}

export interface LabHandler {
  (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void): void;
  /** Clears the decoded-image and PNG caches. */
  invalidate(): void;
  /** Clears the caches and refuses every later API request. */
  close(): void;
}

/** Decode, encode, and extract jobs that run at once. */
export const MAX_JOBS: number = 2;
/** Jobs that may wait for a slot; one more gives a 503. */
export const MAX_QUEUED_JOBS: number = 16;

const SHA256 = /^[0-9a-f]{64}$/;
const COORDINATE = /^[0-9]{1,6}$/;
const COUNT = /^[0-9]{1,2}$/;
/** Problems listed per invalid annotation file. */
const MAX_LISTED_PROBLEMS = 10;

const BLIND_MESSAGE = "Results are hidden for test images (blind annotation).";
const LOCKED_MESSAGE =
  "This test image is already in a test report; its annotation cannot change (specification 7.2).";
const CONFLICT_MESSAGE =
  "This image is in both dev/ and test/. Keep it in one set only before annotating it.";
const INVALID_ANNOTATION = "The annotation is not valid.";

type RouteKind = "inventory" | "image" | "pixel" | "annotation" | "analysis";

interface Route {
  readonly kind: RouteKind;
  /** Unvalidated until checked against SHA256; empty for the inventory. */
  readonly sha256: string;
}

const ALLOWED_METHODS: Readonly<Record<RouteKind, readonly string[]>> = {
  inventory: ["GET"],
  image: ["GET"],
  pixel: ["GET"],
  annotation: ["GET", "PUT", "DELETE"],
  analysis: ["GET"],
};

/** The route of a path below API_PREFIX, or null. Nothing is decoded or normalized. */
function matchRoute(path: string): Route | null {
  const parts = path.split("/");
  if (parts[0] !== "") return null;
  const [, first, second, third, ...rest] = parts;
  if (rest.length > 0) return null;
  if (first === "inventory" && second === undefined) return { kind: "inventory", sha256: "" };
  if (first === "images" && second !== undefined) {
    if (third === undefined && second.endsWith(".png")) {
      return { kind: "image", sha256: second.slice(0, -".png".length) };
    }
    if (third === "pixel") return { kind: "pixel", sha256: second };
    return null;
  }
  if (third !== undefined || second === undefined) return null;
  if (first === "annotations") return { kind: "annotation", sha256: second };
  if (first === "analysis") return { kind: "analysis", sha256: second };
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColorExtractorError(error: unknown): error is Error & { readonly code: string } {
  return (
    error instanceof Error &&
    error.name === "ColorExtractorError" &&
    typeof (error as { readonly code?: unknown }).code === "string"
  );
}

/** One integer query parameter matching `pattern`, or null (missing, repeated, or malformed). */
function integerParameter(query: URLSearchParams, name: string, pattern: RegExp): number | null {
  const values = query.getAll(name);
  const [value] = values;
  if (values.length !== 1 || value === undefined || !pattern.test(value)) return null;
  return Number(value);
}

function rounded(milliseconds: number): number {
  return Math.round(milliseconds * 100) / 100;
}

function otherSet(set: SetName): SetName {
  return set === "dev" ? "test" : "dev";
}

function annotationFileProblems(path: string, error: unknown): string[] {
  if (!(error instanceof AnnotationError)) {
    return [`${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`];
  }
  const problems = error.problems
    .slice(0, MAX_LISTED_PROBLEMS)
    .map((problem) => `${path} is not a valid annotation file: ${problem}`);
  const more = error.problems.length - MAX_LISTED_PROBLEMS;
  if (more > 0) problems.push(`${path} has ${more} more problems.`);
  return problems;
}

function lockedFor(locks: TestLocks, sha256: string): boolean {
  return locks.problems.length > 0 || locks.hashes.has(sha256);
}

/** Throws 409 when test annotations cannot change: the image was measured, or a report is unreadable. */
function assertUnlocked(locks: TestLocks, sha256: string): void {
  if (locks.problems.length > 0) {
    throw new HttpError(
      409,
      `Test annotations are locked because a stored test report cannot be read. Fix or remove it first: ${locks.problems.join("; ")}`,
      locks.problems,
    );
  }
  if (locks.hashes.has(sha256)) throw new HttpError(409, LOCKED_MESSAGE);
}

function checkKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
  problems: string[],
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    problems.push(`${where}: unknown key (allowed: ${allowed.join(", ")}).`);
  }
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Strict AnnotationDraft: known keys only, a valid category, 1–8 colors of 1–16 integer samples. */
function parseDraft(value: unknown): AnnotationDraft {
  if (!isRecord(value)) throw new HttpError(400, INVALID_ANNOTATION, ["body: must be an object."]);
  const problems: string[] = [];
  checkKeys(value, ["category", "acceptable"], "body", problems);
  if (!isCategory(value["category"])) {
    problems.push(`category: must be one of ${CATEGORIES.join(", ")}.`);
  }
  const acceptable = value["acceptable"];
  if (
    !Array.isArray(acceptable) ||
    acceptable.length < 1 ||
    acceptable.length > MAX_ACCEPTABLE_COLORS
  ) {
    problems.push(`acceptable: must be an array of 1 to ${MAX_ACCEPTABLE_COLORS} colors.`);
  } else {
    acceptable.forEach((color: unknown, colorIndex) => {
      const colorPath = `acceptable[${colorIndex}]`;
      if (!isRecord(color)) {
        problems.push(`${colorPath}: must be an object.`);
        return;
      }
      checkKeys(color, ["samples"], colorPath, problems);
      const samples = color["samples"];
      if (!Array.isArray(samples) || samples.length < 1 || samples.length > MAX_SAMPLES_PER_COLOR) {
        problems.push(
          `${colorPath}.samples: must be an array of 1 to ${MAX_SAMPLES_PER_COLOR} samples.`,
        );
        return;
      }
      samples.forEach((sample: unknown, sampleIndex) => {
        const samplePath = `${colorPath}.samples[${sampleIndex}]`;
        if (!isRecord(sample)) {
          problems.push(`${samplePath}: must be an object.`);
          return;
        }
        checkKeys(sample, ["x", "y"], samplePath, problems);
        for (const axis of ["x", "y"]) {
          if (!isCoordinate(sample[axis])) {
            problems.push(`${samplePath}.${axis}: must be a non-negative integer.`);
          }
        }
      });
    });
  }
  if (problems.length > 0) throw new HttpError(400, INVALID_ANNOTATION, problems);
  return value as unknown as AnnotationDraft;
}

/** Fills every sample with the exact decoded pixel; refuses positions outside, repeated, or transparent. */
function sampledColors(
  draft: AnnotationDraft,
  image: DecodedImage,
  analyzer: Analyzer,
): AcceptableColor[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const acceptable = draft.acceptable.map((color, colorIndex) => ({
    samples: color.samples.map(({ x, y }, sampleIndex) => {
      const where = `acceptable[${colorIndex}].samples[${sampleIndex}]: Sample at (${x}, ${y})`;
      if (x >= image.width || y >= image.height) {
        problems.push(`${where} is outside the ${image.width}×${image.height} image.`);
        return { x, y, hex: "" };
      }
      const key = `${x},${y}`;
      if (seen.has(key)) problems.push(`${where} is already used in this image.`);
      seen.add(key);
      const pixel = analyzer.pixelAt(image, x, y);
      if (pixel.alpha === 0) {
        problems.push(`${where} is fully transparent; transparent pixels are not analyzed.`);
      }
      return { x, y, hex: pixel.hex };
    }),
  }));
  if (problems.length > 0) throw new HttpError(400, INVALID_ANNOTATION, problems);
  return acceptable;
}

function sendFailure(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (error instanceof HttpError) {
    sendError(response, error.status, error.message, error.problems);
  } else if (isColorExtractorError(error)) {
    sendError(response, 422, `${error.code}: ${error.message}`);
  } else {
    console.error("[color-extractor-lab]", error);
    sendError(response, 500, "Internal error. See the dev server console.");
  }
}

/**
 * The lab's middleware: `GET /` redirects to the lab, `/__lab/api/*` is the API of `lab/api.ts`,
 * and everything else goes to `next`.
 */
export function createLabHandler(context: LabContext): LabHandler {
  const { root, loadAnalyzer } = context;
  const limiter = createLimiter(MAX_JOBS, MAX_QUEUED_JOBS);
  const state: LabState = createLabState({ ...context, limiter });
  let closed = false;

  async function requireImage(sha256: string): Promise<FoundImage> {
    const found = await state.find(sha256);
    if (found === undefined) throw new HttpError(404, "No image with this hash.");
    return found;
  }

  async function loadOrFail(set: SetName): Promise<AnnotationFile> {
    try {
      return await state.loadAnnotations(set);
    } catch (error) {
      const path = annotationsPath(root, set);
      throw new HttpError(
        500,
        `${path} cannot be used. Fix it or restore it with git.`,
        annotationFileProblems(path, error),
      );
    }
  }

  async function inventory(): Promise<LabInventory> {
    const [scan, locks, ...files] = await Promise.all([
      state.scan(),
      state.testLocks(),
      ...SET_NAMES.map(async (set) => {
        try {
          return { set, file: await state.loadAnnotations(set), problems: [] };
        } catch (error) {
          const problems = annotationFileProblems(annotationsPath(root, set), error);
          return { set, file: null, problems };
        }
      }),
    ]);
    const problems: string[] = [];
    if (scan.error !== null) problems.push(scan.error);
    for (const { problems: fileProblems } of files) problems.push(...fileProblems);
    const loaded = new Map(files.map(({ set, file }) => [set, file]));
    const dev = loaded.get("dev") ?? null;
    const test = loaded.get("test") ?? null;
    if (dev !== null && test !== null) {
      for (const sha256 of crossSetDuplicates(dev, test)) {
        const devId = findAnnotation(dev, sha256)?.id ?? "";
        const testId = findAnnotation(test, sha256)?.id ?? "";
        problems.push(
          `One image is annotated in both sets (${devId} and ${testId}). Remove one annotation.`,
        );
      }
    }
    for (const conflict of scan.inventory?.conflicts ?? []) {
      problems.push(
        `The same image is dev/${conflict.dev} and test/${conflict.test}. Keep it in one set only.`,
      );
    }
    for (const problem of locks.problems) {
      problems.push(`Every test annotation is locked until this report can be read: ${problem}`);
    }

    const images: LabImage[] = [];
    const orphans: LabOrphan[] = [];
    for (const set of SET_NAMES) {
      const file = loaded.get(set) ?? null;
      const annotations = new Map((file?.images ?? []).map((image) => [image.sha256, image]));
      const discovered = scan.inventory?.images[set] ?? [];
      for (const image of discovered) {
        const annotation = annotations.get(image.sha256);
        images.push({
          set,
          sha256: image.sha256,
          relativePath: image.relativePath,
          bytes: image.bytes,
          annotation:
            annotation === undefined ? null : { id: annotation.id, category: annotation.category },
          locked: set === "test" && lockedFor(locks, image.sha256),
        });
      }
      if (scan.inventory === null) continue;
      const present = new Set(discovered.map((image) => image.sha256));
      for (const annotation of file?.images ?? []) {
        if (present.has(annotation.sha256)) continue;
        const { id, sha256, category } = annotation;
        orphans.push({ set, id, sha256, category });
      }
    }

    return {
      evalDir: context.evalDir,
      threshold: MATCH_THRESHOLD,
      calibrationThresholds: CALIBRATION_THRESHOLDS,
      images,
      orphans,
      duplicates: scan.inventory?.duplicates.length ?? 0,
      skipped: scan.inventory?.skipped.length ?? 0,
      problems,
    };
  }

  async function getPixel(sha256: string, query: URLSearchParams): Promise<LabPixel> {
    const x = integerParameter(query, "x", COORDINATE);
    const y = integerParameter(query, "y", COORDINATE);
    if (x === null || y === null) {
      throw new HttpError(400, "x and y must be integers from 0 to 999999.");
    }
    const { image } = await requireImage(sha256);
    const decoded = (await state.decoded(image)).image;
    if (x >= decoded.width || y >= decoded.height) {
      throw new HttpError(400, "The position is outside the image.");
    }
    const analyzer = await loadAnalyzer();
    return { x, y, ...analyzer.pixelAt(decoded, x, y) };
  }

  async function getAnnotation(sha256: string): Promise<LabAnnotation> {
    const { image } = await requireImage(sha256);
    const { width, height } = (await state.decoded(image)).image;
    const file = await loadOrFail(image.set);
    const locked = image.set === "test" && lockedFor(await state.testLocks(), sha256);
    const annotation = findAnnotation(file, sha256) ?? null;
    return { set: image.set, width, height, annotation, locked };
  }

  async function putAnnotation(
    sha256: string,
    request: IncomingMessage,
  ): Promise<{ readonly annotation: ImageAnnotation }> {
    const body = await readJsonBody(request, MAX_BODY_BYTES);
    const { image, conflict } = await requireImage(sha256);
    const { set } = image;
    if (conflict) throw new HttpError(409, CONFLICT_MESSAGE);
    if (set === "test") assertUnlocked(await state.testLocks(), sha256);
    const draft = parseDraft(body);
    const decoded = (await state.decoded(image)).image;
    const acceptable = sampledColors(draft, decoded, await loadAnalyzer());

    const annotation = await state.withFileLock(set, async () => {
      const file = await loadOrFail(set);
      if (set === "test") assertUnlocked(await state.testLocks(), sha256);
      const other = await loadOrFail(otherSet(set));
      if (findAnnotation(other, sha256) !== undefined) {
        throw new HttpError(
          409,
          `This image is annotated in the ${otherSet(set)} set. An image belongs to one set only.`,
        );
      }
      const stored: ImageAnnotation = {
        id: findAnnotation(file, sha256)?.id ?? nextImageId(file),
        sha256,
        category: draft.category,
        width: decoded.width,
        height: decoded.height,
        acceptable,
      };
      const problems = annotationProblems(stored, set, "annotation");
      if (problems.length > 0) throw new HttpError(400, INVALID_ANNOTATION, problems);
      await saveAnnotations(annotationsPath(root, set), upsertAnnotation(file, stored));
      return stored;
    });
    return { annotation };
  }

  async function deleteAnnotation(sha256: string): Promise<void> {
    const { image, conflict } = await requireImage(sha256);
    const { set } = image;
    if (conflict) throw new HttpError(409, CONFLICT_MESSAGE);
    if (set === "test") assertUnlocked(await state.testLocks(), sha256);
    await state.withFileLock(set, async () => {
      const file = await loadOrFail(set);
      if (findAnnotation(file, sha256) === undefined) {
        throw new HttpError(404, "This image has no annotation.");
      }
      if (set === "test") assertUnlocked(await state.testLocks(), sha256);
      await saveAnnotations(annotationsPath(root, set), removeAnnotation(file, sha256));
    });
  }

  async function getAnalysis(sha256: string, query: URLSearchParams): Promise<LabAnalysis> {
    const { image, conflict } = await requireImage(sha256);
    // Blind annotation: refuse before the analyzer is loaded or anything is decoded.
    if (image.set === "test" || conflict) throw new HttpError(403, BLIND_MESSAGE);
    const count = integerParameter(query, "count", COUNT);
    if (count === null || count < MIN_COUNT || count > MAX_COUNT) {
      throw new HttpError(400, `count must be an integer from ${MIN_COUNT} to ${MAX_COUNT}.`);
    }
    const entry = await state.decoded(image);
    const analyzer = await loadAnalyzer();
    const { perceptual, population, milliseconds } = await limiter.run(() => {
      const start = performance.now();
      const perceptual = analyzer.extractEvalColors(entry.image, "perceptual", count);
      const middle = performance.now();
      const population = analyzer.extractEvalColors(entry.image, "population", count);
      const end = performance.now();
      return {
        perceptual,
        population,
        milliseconds: { perceptual: middle - start, population: end - middle },
      };
    });
    return {
      sha256,
      width: entry.image.width,
      height: entry.image.height,
      count,
      algorithmVersion: perceptual.meta.algorithmVersion,
      perceptual,
      population,
      milliseconds: {
        decode: rounded(entry.milliseconds),
        perceptual: rounded(milliseconds.perceptual),
        population: rounded(milliseconds.population),
      },
    };
  }

  async function serve(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    query: URLSearchParams,
  ): Promise<void> {
    // Only an annotation PUT reads its body; any other body is discarded before the response.
    if (request.method !== "PUT") await discardBody(request);
    if (closed) throw new HttpError(503, "The lab is shutting down.");
    if (rejectReason(request) !== null) throw new HttpError(403, "Forbidden.");
    const route = matchRoute(path);
    if (route === null) throw new HttpError(404, "Not found.");
    const allowed = ALLOWED_METHODS[route.kind];
    const method = request.method ?? "";
    if (!allowed.includes(method)) {
      response.setHeader("allow", allowed.join(", "));
      throw new HttpError(405, "Method not allowed.");
    }
    if (route.kind === "inventory") {
      sendJson(response, 200, await inventory());
      return;
    }
    const { sha256 } = route;
    if (!SHA256.test(sha256)) {
      throw new HttpError(400, "The image hash must be 64 lowercase hex characters.");
    }
    switch (route.kind) {
      case "image": {
        const { image } = await requireImage(sha256);
        sendBytes(response, "image/png", await state.png(image));
        return;
      }
      case "pixel":
        sendJson(response, 200, await getPixel(sha256, query));
        return;
      case "analysis":
        sendJson(response, 200, await getAnalysis(sha256, query));
        return;
      case "annotation":
        if (method === "PUT") sendJson(response, 200, await putAnnotation(sha256, request));
        else if (method === "DELETE") {
          await deleteAnnotation(sha256);
          sendStatus(response, 204);
        } else sendJson(response, 200, await getAnnotation(sha256));
        return;
    }
  }

  const handle = (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): void => {
    const url = request.url ?? "";
    const queryStart = url.indexOf("?");
    const pathname = queryStart === -1 ? url : url.slice(0, queryStart);
    if (pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
      response.statusCode = 302;
      response.setHeader("location", LAB_PATH);
      response.end();
      return;
    }
    if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) {
      next();
      return;
    }
    const query = new URLSearchParams(queryStart === -1 ? "" : url.slice(queryStart + 1));
    void serve(request, response, pathname.slice(API_PREFIX.length), query).catch(
      async (error: unknown) => {
        await discardBody(request);
        sendFailure(response, error);
      },
    );
  };

  return Object.assign(handle, {
    invalidate(): void {
      state.invalidate();
    },
    close(): void {
      closed = true;
      state.close();
    },
  });
}
