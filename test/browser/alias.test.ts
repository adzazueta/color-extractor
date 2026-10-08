import { expect, test } from "vite-plus/test";
import * as browser from "@/browser/index.js";

test("the @/ alias resolves to src/", () => {
  expect(typeof browser).toBe("object");
});
