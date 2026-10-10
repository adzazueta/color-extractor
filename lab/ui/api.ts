/// <reference lib="dom" />
import type { ImageAnnotation } from "../../eval/lib/annotation-schema.js";
import {
  analysisUrl,
  annotationUrl,
  imageUrl,
  inventoryUrl,
  pixelUrl,
  type AnnotationDraft,
  type LabAnalysis,
  type LabAnnotation,
  type LabImage,
  type LabInventory,
  type LabPixel,
} from "../api.js";

/** A non-2xx response (or, with status 0, a request that never reached the server). */
export class LabRequestError extends Error {
  readonly status: number;
  readonly error: string;
  readonly problems: readonly string[];

  constructor(status: number, error: string, problems: readonly string[] = []) {
    super(error);
    this.name = "LabRequestError";
    this.status = status;
    this.error = error;
    this.problems = problems;
  }
}

/** Thrown before any request when the UI asks for the results of a test image. */
export class BlindModeError extends Error {
  constructor() {
    super("Results are hidden for test images (blind annotation).");
    this.name = "BlindModeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function failure(response: Response): Promise<LabRequestError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: fall back to the status.
  }
  const error =
    isRecord(body) && typeof body["error"] === "string"
      ? body["error"]
      : `The lab server answered ${response.status}.`;
  const problems =
    isRecord(body) && Array.isArray(body["problems"])
      ? body["problems"].filter((problem): problem is string => typeof problem === "string")
      : [];
  return new LabRequestError(response.status, error, problems);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new LabRequestError(0, "Cannot reach the lab server.");
  }
  if (!response.ok) throw await failure(response);
  return response;
}

export async function fetchInventory(): Promise<LabInventory> {
  return (await (await request(inventoryUrl())).json()) as LabInventory;
}

export async function fetchImageBlob(sha256: string): Promise<Blob> {
  return (await request(imageUrl(sha256))).blob();
}

/** The exact decoded pixel: the source of every eyedropper sample. */
export async function fetchPixel(sha256: string, x: number, y: number): Promise<LabPixel> {
  return (await (await request(pixelUrl(sha256, x, y))).json()) as LabPixel;
}

export async function fetchAnnotation(sha256: string): Promise<LabAnnotation> {
  return (await (await request(annotationUrl(sha256))).json()) as LabAnnotation;
}

export async function saveAnnotation(
  sha256: string,
  draft: AnnotationDraft,
): Promise<ImageAnnotation> {
  const response = await request(annotationUrl(sha256), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });
  return ((await response.json()) as { readonly annotation: ImageAnnotation }).annotation;
}

export async function removeAnnotation(sha256: string): Promise<void> {
  const response = await request(annotationUrl(sha256), { method: "DELETE" });
  // Reading the empty body keeps Chromium from reporting the 204 as an aborted request.
  await response.arrayBuffer();
}

/**
 * Dev images only. Blind mode (decisions 30 and 37): for a test image this throws before any
 * request, so the UI never even asks the server for results.
 */
export async function fetchAnalysis(
  image: Pick<LabImage, "set" | "sha256">,
  count: number,
): Promise<LabAnalysis> {
  if (image.set !== "dev") throw new BlindModeError();
  return (await (await request(analysisUrl(image.sha256, count))).json()) as LabAnalysis;
}
