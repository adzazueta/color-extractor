import type { ExtractionResult } from "@/core/types.js";
import type { ImageAnnotation, SetName } from "../eval/lib/annotation-schema.js";
import type { Category } from "../eval/lib/categories.js";

export const LAB_PATH: string = "/lab/";
export const API_PREFIX: string = "/__lab/api";
export const MAX_BODY_BYTES: number = 65_536;
export const MIN_COUNT: number = 1;
export const MAX_COUNT: number = 16;

export interface LabImage {
  readonly set: SetName;
  readonly sha256: string;
  readonly relativePath: string;
  readonly bytes: number;
  readonly annotation: { readonly id: string; readonly category: Category } | null;
  /** A test image already in a stored test report. */
  readonly locked: boolean;
}
export interface LabOrphan {
  readonly set: SetName;
  readonly id: string;
  readonly sha256: string;
  readonly category: Category;
}
export interface LabInventory {
  readonly evalDir: string;
  readonly threshold: number | null;
  readonly calibrationThresholds: readonly number[];
  /** Dev, then test; each by relativePath. */
  readonly images: readonly LabImage[];
  readonly orphans: readonly LabOrphan[];
  readonly duplicates: number;
  readonly skipped: number;
  /** Blocking: missing folder, invalid file, conflicts. */
  readonly problems: readonly string[];
}
export interface LabPixel {
  readonly x: number;
  readonly y: number;
  readonly hex: string;
  readonly alpha: number;
}
export interface LabAnnotation {
  readonly set: SetName;
  readonly width: number;
  readonly height: number;
  readonly annotation: ImageAnnotation | null;
  readonly locked: boolean;
}
export interface AnnotationDraft {
  readonly category: Category;
  readonly acceptable: readonly {
    readonly samples: readonly { readonly x: number; readonly y: number }[];
  }[];
}
export interface LabAnalysis {
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly count: number;
  readonly algorithmVersion: string;
  readonly perceptual: ExtractionResult;
  readonly population: ExtractionResult;
  readonly milliseconds: {
    readonly decode: number;
    readonly perceptual: number;
    readonly population: number;
  };
}
export interface LabError {
  readonly error: string;
  readonly problems?: readonly string[];
}

/** GET */
export function inventoryUrl(): string {
  return `${API_PREFIX}/inventory`;
}
/** GET …/images/<sha256>.png */
export function imageUrl(sha256: string): string {
  return `${API_PREFIX}/images/${sha256}.png`;
}
/** GET …/images/<sha256>/pixel?x=&y= */
export function pixelUrl(sha256: string, x: number, y: number): string {
  return `${API_PREFIX}/images/${sha256}/pixel?x=${x}&y=${y}`;
}
/** GET, PUT, DELETE …/annotations/<sha256> */
export function annotationUrl(sha256: string): string {
  return `${API_PREFIX}/annotations/${sha256}`;
}
/** GET …/analysis/<sha256>?count= */
export function analysisUrl(sha256: string, count: number): string {
  return `${API_PREFIX}/analysis/${sha256}?count=${count}`;
}
