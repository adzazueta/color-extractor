/** The main category of an evaluation image, chosen in the lab. */
export type Category =
  | "reference"
  | "black-and-white"
  | "saturated-logo"
  | "character-art"
  | "white-background"
  | "dark"
  | "general";

/** Enum order: also the order of report rows and of the lab's select. */
export const CATEGORIES: readonly Category[] = [
  "reference",
  "black-and-white",
  "saturated-logo",
  "character-art",
  "white-background",
  "dark",
  "general",
];

/** Display names, in the words of the decision. */
export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  reference: "Reference",
  "black-and-white": "Black and white",
  "saturated-logo": "Saturated logo",
  "character-art": "Character art",
  "white-background": "White background",
  dark: "Dark",
  general: "General",
};

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
