import { describe, expect, test } from "vite-plus/test";
import { keyAction, type KeyInput } from "../../../../lab/ui/keys.js";

function input(key: string, extra: Partial<KeyInput> = {}): KeyInput {
  return { key, ctrlKey: false, metaKey: false, altKey: false, typing: false, ...extra };
}

describe("keyAction", () => {
  test("maps the shortcuts", () => {
    expect(keyAction(input("j"))).toBe("next");
    expect(keyAction(input("k"))).toBe("previous");
    expect(keyAction(input("p"))).toBe("next-pending");
    expect(keyAction(input("s"))).toBe("save");
    expect(keyAction(input("Escape"))).toBe("escape");
  });

  test("ignores other keys", () => {
    expect(keyAction(input("x"))).toBeNull();
    expect(keyAction(input("Enter"))).toBeNull();
  });

  test("leaves browser shortcuts alone", () => {
    expect(keyAction(input("s", { metaKey: true }))).toBeNull();
    expect(keyAction(input("s", { ctrlKey: true }))).toBeNull();
    expect(keyAction(input("j", { altKey: true }))).toBeNull();
  });

  test("while typing only Escape works", () => {
    expect(keyAction(input("j", { typing: true }))).toBeNull();
    expect(keyAction(input("s", { typing: true }))).toBeNull();
    expect(keyAction(input("Escape", { typing: true }))).toBe("escape");
  });
});
