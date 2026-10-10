import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Import {
  readonly specifier: string;
  /** `import type` and `export type` are erased; every other form stays in the output. */
  readonly typeOnly: boolean;
}

/** Static imports and re-exports (telling the type-only ones apart), side-effect and dynamic imports. */
function imports(source: string): Import[] {
  const found: Import[] = [];
  const statement = /\b(?:import|export)\s+(type\s+)?[\w*${}\s,]*?\bfrom\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(statement)) {
    found.push({ specifier: match[2] ?? "", typeOnly: match[1] !== undefined });
  }
  const others = /(?:\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(others)) {
    found.push({ specifier: match[1] ?? "", typeOnly: false });
  }
  return found;
}

function files(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const path = (...parts: string[]): string => join(ROOT, ...parts);

// The three module classes of the design (section 2).
const CONFIG_SAFE_AND_BROWSER_SAFE = [
  path("eval/config.ts"),
  path("eval/lib/categories.ts"),
  path("eval/lib/annotation-schema.ts"),
  path("lab/api.ts"),
];
const CONFIG_SAFE_ONLY = [
  ...["annotation-files", "discover", "locate", "report-schema"].map((name) =>
    path(`eval/lib/${name}.ts`),
  ),
  ...files(path("lab/server")),
];
const BROWSER_SAFE_ONLY = [
  path("eval/lib/color.ts"),
  path("eval/lib/match.ts"),
  path("lab/main.ts"),
  ...files(path("lab/ui")),
].filter((file) => files(dirname(file)).includes(file));

const CONFIG_SAFE = new Set([...CONFIG_SAFE_AND_BROWSER_SAFE, ...CONFIG_SAFE_ONLY]);
const BROWSER_SAFE = new Set([...CONFIG_SAFE_AND_BROWSER_SAFE, ...BROWSER_SAFE_ONLY]);
const NODE_ONLY = ["analyze", "discover", "locate", "annotation-files"];

function resolved(file: string, specifier: string): string {
  return resolve(dirname(file), specifier).replace(/\.js$/, ".ts");
}

function describeFile(file: string): string {
  return relative(ROOT, file);
}

describe("config-safe modules", () => {
  test("the lists are not empty", () => {
    expect(CONFIG_SAFE.size).toBeGreaterThanOrEqual(8);
  });

  test("import no @/ value, and only config-safe modules by value", () => {
    for (const file of CONFIG_SAFE) {
      for (const { specifier, typeOnly } of imports(readFileSync(file, "utf8"))) {
        if (typeOnly) continue;
        expect(specifier.startsWith("@/"), `${describeFile(file)} imports "${specifier}"`).toBe(
          false,
        );
        if (specifier.startsWith(".")) {
          expect(
            CONFIG_SAFE.has(resolved(file, specifier)),
            `${describeFile(file)} imports "${specifier}", which is not config-safe`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("browser-safe modules", () => {
  test("the lists are not empty", () => {
    expect(BROWSER_SAFE.size).toBeGreaterThanOrEqual(6);
  });

  test("import no node:, sharp, or Node-only module, and only browser-safe modules by value", () => {
    for (const file of BROWSER_SAFE) {
      for (const { specifier, typeOnly } of imports(readFileSync(file, "utf8"))) {
        if (typeOnly) continue;
        const where = `${describeFile(file)} imports "${specifier}"`;
        expect(specifier.startsWith("node:"), where).toBe(false);
        expect(specifier === "sharp" || specifier.startsWith("sharp/"), where).toBe(false);
        expect(specifier.startsWith("@/node/"), where).toBe(false);
        if (specifier.startsWith(".")) {
          const target = resolved(file, specifier);
          expect(
            NODE_ONLY.some((name) => target.endsWith(`/${name}.ts`)),
            where,
          ).toBe(false);
          expect(BROWSER_SAFE.has(target), `${where}, which is not browser-safe`).toBe(true);
        }
      }
    }
  });
});

describe("src", () => {
  test("imports nothing from eval/ or lab/", () => {
    const sources = files(path("src"));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      for (const { specifier } of imports(readFileSync(file, "utf8"))) {
        expect(
          /(^|\/)(eval|lab)\//.test(specifier),
          `${describeFile(file)} imports "${specifier}"`,
        ).toBe(false);
      }
    }
  });
});

test("the scan tells type imports from value imports", () => {
  const sample = [
    'import type { A } from "@/core/types.js";',
    'import { type B } from "@/core/defaults.js";',
    'import { c } from "node:fs";',
    'export type { D } from "./d.js";',
    'export * from "./e.js";',
    'import "./f.js";',
    'const g = await import("sharp");',
    "import {",
    "  h,",
    '} from "../h.js";',
  ].join("\n");
  expect(imports(sample)).toEqual([
    { specifier: "@/core/types.js", typeOnly: true },
    { specifier: "@/core/defaults.js", typeOnly: false },
    { specifier: "node:fs", typeOnly: false },
    { specifier: "./d.js", typeOnly: true },
    { specifier: "./e.js", typeOnly: false },
    { specifier: "../h.js", typeOnly: false },
    { specifier: "./f.js", typeOnly: false },
    { specifier: "sharp", typeOnly: false },
  ]);
});
