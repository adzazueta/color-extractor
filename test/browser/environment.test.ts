/// <reference lib="dom" />
import { expect, test } from "vite-plus/test";

test("runs in a real browser", () => {
  expect(typeof window).toBe("object");
  expect(typeof document).toBe("object");
  expect(navigator.userAgent).not.toBe("");
});
