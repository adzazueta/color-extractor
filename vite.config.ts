import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  pack: {
    entry: {
      core: "src/core/index.ts",
      node: "src/node/index.ts",
      browser: "src/browser/index.ts",
    },
    format: "esm",
    platform: "neutral",
    fixedExtension: false,
    dts: true,
    publint: { level: "warning", strict: true },
    attw: { profile: "esm-only", level: "error" },
  },
  test: {
    coverage: {
      provider: "v8",
      enabled: false,
      include: ["src/**"],
      reporter: ["text-summary", "json-summary"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["test/node/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
  lint: {
    ignorePatterns: ["dist/**", "coverage/**"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: ["dist/**", "coverage/**", "pnpm-lock.yaml"],
  },
  staged: {
    "*": "vp check --no-error-on-unmatched-pattern",
  },
});
