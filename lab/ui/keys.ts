export type KeyAction = "next" | "previous" | "next-pending" | "save" | "escape";

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** The focus is in a field that takes typing (input, select, textarea). */
  readonly typing: boolean;
}

/** j/k next and previous image, p next pending, s save, Esc leave pick mode. */
export function keyAction(input: KeyInput): KeyAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.key === "Escape") return "escape";
  if (input.typing) return null;
  switch (input.key.toLowerCase()) {
    case "j":
      return "next";
    case "k":
      return "previous";
    case "p":
      return "next-pending";
    case "s":
      return "save";
    default:
      return null;
  }
}
