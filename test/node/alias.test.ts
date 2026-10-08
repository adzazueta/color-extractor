import { expect, test } from "vite-plus/test";
import * as core from "@/core/index.js";

test("the @/ alias resolves to src/", () => {
  expect(typeof core).toBe("object");
});
