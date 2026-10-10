import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import { lab } from "./lab/server/plugin.js";
import { testImageServer } from "./test/support/image-server.js";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [lab()],
  pack: {
    entry: {
      core: "src/core/index.ts",
      node: "src/node/index.ts",
      browser: "src/browser/index.ts",
    },
    format: "esm",
    platform: "neutral",
    // Node built-ins stay external imports (the platform is neutral); otherwise vp pack warns UNRESOLVED_IMPORT.
    deps: { neverBundle: [/^node:/] },
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
        plugins: [testImageServer()],
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
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "pnpm-lock.yaml",
      "eval/annotations/**",
      "eval/reports/**",
    ],
  },
  staged: {
    "*": "vp check --no-error-on-unmatched-pattern",
  },
  run: {
    tasks: {
      // The evaluation reads files outside the repository, so it is never cached.
      eval: { command: "node eval/run.mjs", cache: false },
    },
  },
});
