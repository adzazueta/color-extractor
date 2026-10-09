/// <reference lib="dom" />
import { expect } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import type { ExtractedColor } from "@/core/types.js";
import type { TestImageName } from "../../support/images.js";

export const BASE = "/__test-images__/";

export const ENGINE: "chromium" | "firefox" | "webkit" = navigator.userAgent.includes("Firefox")
  ? "firefox"
  : navigator.userAgent.includes("Chrome")
    ? "chromium"
    : "webkit";

/** The fixture bytes, encoded by sharp and served by the test image plugin. */
export async function fixture(name: TestImageName): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(`${BASE}${name}`);
  if (!response.ok) {
    throw new Error(`The test image server answered ${response.status} for ${name}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function crossOriginBase(): Promise<string> {
  const response = await fetch(`${BASE}cross-origin`);
  return `${((await response.json()) as { origin: string }).origin}${BASE}`;
}

export async function rejection(promise: Promise<unknown>): Promise<ColorExtractorError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ColorExtractorError);
  return error as ColorExtractorError;
}

export function isRedDominant(color: ExtractedColor | undefined): boolean {
  const [r, g, b] = color?.rgba ?? [0, 0, 0];
  return r > 150 && r > g + 60 && r > b + 60;
}
