import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const CORE = fileURLToPath(new URL("../../src/core", import.meta.url));
const FORBIDDEN = /^(@\/(shared|node|browser)(\/|$)|node:)/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** Every module specifier in static imports, re-exports, dynamic imports, and `import type`. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1] ?? "");
  return found;
}

test("src/core imports nothing from @/shared, @/node, @/browser, or node:", () => {
  const files = sourceFiles(CORE);
  expect(files.length).toBeGreaterThan(10);
  for (const file of files) {
    for (const specifier of specifiers(readFileSync(file, "utf8"))) {
      expect(FORBIDDEN.test(specifier), `${file} imports "${specifier}"`).toBe(false);
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        expect(target.startsWith(CORE), `${file} reaches outside core with "${specifier}"`).toBe(
          true,
        );
      }
    }
  }
});

test("the specifier scan finds forbidden imports", () => {
  const sample = [
    'import { a } from "@/shared/abort.js";',
    'export * from "node:fs";',
    'const m = await import("@/node/sharp.js");',
    'import "@/browser/decode.js";',
  ].join("\n");
  expect(specifiers(sample).filter((s) => FORBIDDEN.test(s))).toHaveLength(4);
});
