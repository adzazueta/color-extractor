import {
  MAX_ACCEPTABLE_COLORS,
  MAX_SAMPLES_PER_COLOR,
  type ImageAnnotation,
} from "../../eval/lib/annotation-schema.js";
import type { Category } from "../../eval/lib/categories.js";
import type { AnnotationDraft } from "../api.js";
import { colorLetter } from "./format.js";

export interface DraftSample {
  readonly x: number;
  readonly y: number;
  readonly hex: string;
  readonly alpha: number;
}
export interface Draft {
  readonly category: Category | null;
  readonly colors: readonly (readonly DraftSample[])[];
  readonly active: number | null;
}

/** A new draft starts with one empty, active color. Stored samples are never alpha 0. */
export function draftFrom(annotation: ImageAnnotation | null): Draft {
  if (annotation === null) return { category: null, colors: [[]], active: 0 };
  return {
    category: annotation.category,
    colors: annotation.acceptable.map((color) =>
      color.samples.map((sample) => ({ x: sample.x, y: sample.y, hex: sample.hex, alpha: 255 })),
    ),
    active: null,
  };
}

export function setCategory(draft: Draft, category: Category): Draft {
  return { ...draft, category };
}

/** Appends an empty color and makes it active (ignored at the maximum). */
export function addColor(draft: Draft): Draft {
  if (draft.colors.length >= MAX_ACCEPTABLE_COLORS) return draft;
  return { ...draft, colors: [...draft.colors, []], active: draft.colors.length };
}

export function selectColor(draft: Draft, index: number): Draft {
  if (!Number.isInteger(index) || index < 0 || index >= draft.colors.length) return draft;
  return { ...draft, active: index };
}

function used(draft: Draft, x: number, y: number): boolean {
  return draft.colors.some((color) => color.some((sample) => sample.x === x && sample.y === y));
}

/**
 * Adds a sample to the active color. Returns the same draft when nothing changes: no active color,
 * a position already used, or the color is full.
 */
export function addSample(draft: Draft, sample: DraftSample): Draft {
  const active = draft.active;
  if (active === null) return draft;
  const color = draft.colors[active];
  if (color === undefined || color.length >= MAX_SAMPLES_PER_COLOR) return draft;
  if (used(draft, sample.x, sample.y)) return draft;
  return {
    ...draft,
    colors: draft.colors.map((existing, index) =>
      index === active ? [...existing, sample] : existing,
    ),
  };
}

export function removeSample(draft: Draft, color: number, index: number): Draft {
  const samples = draft.colors[color];
  if (samples === undefined || index < 0 || index >= samples.length) return draft;
  return {
    ...draft,
    colors: draft.colors.map((existing, i) =>
      i === color ? existing.filter((_, j) => j !== index) : existing,
    ),
  };
}

/** Removes a color; the active color stays the same one, or none when it was the removed one. */
export function removeColor(draft: Draft, color: number): Draft {
  if (color < 0 || color >= draft.colors.length) return draft;
  let active = draft.active;
  if (active === color) active = null;
  else if (active !== null && active > color) active -= 1;
  return { ...draft, colors: draft.colors.filter((_, i) => i !== color), active };
}

/** Empty when the draft can be saved. */
export function draftProblems(draft: Draft): string[] {
  const problems: string[] = [];
  if (draft.category === null) problems.push("Choose a category.");
  if (draft.colors.length === 0) problems.push("Add at least one acceptable color.");
  if (draft.colors.length > MAX_ACCEPTABLE_COLORS) {
    problems.push(`Use at most ${MAX_ACCEPTABLE_COLORS} acceptable colors.`);
  }
  const positions = new Set<string>();
  const repeated = new Set<string>();
  draft.colors.forEach((samples, index) => {
    const letter = colorLetter(index);
    if (samples.length === 0) problems.push(`Color ${letter} has no samples.`);
    if (samples.length > MAX_SAMPLES_PER_COLOR) {
      problems.push(`Color ${letter} has more than ${MAX_SAMPLES_PER_COLOR} samples.`);
    }
    for (const sample of samples) {
      if (sample.alpha === 0) {
        problems.push(`Sample at (${sample.x}, ${sample.y}) is fully transparent.`);
      }
      const key = `${sample.x},${sample.y}`;
      if (positions.has(key)) repeated.add(key);
      positions.add(key);
    }
  });
  for (const key of repeated) {
    problems.push(`Position (${key.replace(",", ", ")}) is used more than once.`);
  }
  return problems;
}

/** The body of the PUT request. @throws RangeError when the draft has problems. */
export function toRequestBody(draft: Draft): AnnotationDraft {
  const problems = draftProblems(draft);
  if (problems.length > 0 || draft.category === null) {
    throw new RangeError(`The draft cannot be saved: ${problems.join(" ")}`);
  }
  return {
    category: draft.category,
    acceptable: draft.colors.map((samples) => ({
      samples: samples.map((sample) => ({ x: sample.x, y: sample.y })),
    })),
  };
}

/**
 * True when the draft differs from what is stored. Empty colors are ignored: they cannot be saved
 * and an empty card is not a change worth asking about.
 */
export function isDirty(draft: Draft, saved: ImageAnnotation | null): boolean {
  const colors = draft.colors.filter((samples) => samples.length > 0);
  if (saved === null) return draft.category !== null || colors.length > 0;
  if (draft.category !== saved.category) return true;
  if (colors.length !== saved.acceptable.length) return true;
  return colors.some((samples, i) => {
    const stored = saved.acceptable[i]?.samples ?? [];
    return (
      samples.length !== stored.length ||
      samples.some((sample, j) => {
        const other = stored[j];
        return (
          other === undefined ||
          sample.x !== other.x ||
          sample.y !== other.y ||
          sample.hex !== other.hex
        );
      })
    );
  });
}
