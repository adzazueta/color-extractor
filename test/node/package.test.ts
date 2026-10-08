import { expect, test } from "vite-plus/test";
import pkg from "../../package.json" with { type: "json" };

test("package.json declares no runtime dependencies", () => {
  const manifest: Record<string, unknown> = pkg;
  expect(manifest.dependencies ?? {}).toEqual({});
});
