// Evaluation report check (specification 9.1).
//
// Usage: node scripts/check-report.mjs [repository root]
//
// The version pull request of a stable version (0.4.0 and later) cannot be merged without the
// evaluation report for the current algorithmVersion. Prereleases are exempt. The algorithmVersion
// is read from the built package (dist/core.js), so run `vp pack` first. Only node: built-ins are
// used.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Files that `vp run eval` and `vp run bench` write for one algorithmVersion. */
export const REQUIRED_REPORT_FILES = ["dev.md", "dev.json", "test.md", "test.json", "bench.md"];

/**
 * Checks the reports of one algorithmVersion.
 *
 * @param {{ version: string, algorithmVersion: string, root: string }} input
 * @returns {{ exempt: boolean, problems: string[], checked: string[] }}
 */
export function checkReport({ version, algorithmVersion, root }) {
  if (version.includes("-")) return { exempt: true, problems: [], checked: [] };

  const directory = join(root, "eval", "reports", algorithmVersion);
  const relative = `eval/reports/${algorithmVersion}/`;
  const problems = [];
  const checked = [];

  if (!existsSync(directory)) {
    problems.push(`The folder ${relative} does not exist.`);
  } else {
    for (const name of REQUIRED_REPORT_FILES) {
      if (existsSync(join(directory, name))) checked.push(`${relative}${name}`);
      else problems.push(`The file ${relative}${name} is missing.`);
    }
    if (existsSync(join(directory, "test.json"))) {
      let header;
      let parsed = true;
      try {
        header = JSON.parse(readFileSync(join(directory, "test.json"), "utf8"))?.header;
      } catch {
        parsed = false;
        problems.push(`${relative}test.json is not valid JSON.`);
      }
      if (parsed && header?.algorithmVersion !== algorithmVersion) {
        problems.push(
          `${relative}test.json names algorithmVersion ${JSON.stringify(header?.algorithmVersion)}, ` +
            `but the package is at ${JSON.stringify(algorithmVersion)}.`,
        );
      }
    }
  }
  return { exempt: false, problems, checked };
}

/** The algorithmVersion of the built package: extracts a 1x1 opaque pixel through dist/core.js. */
async function builtAlgorithmVersion(root) {
  const core = join(root, "dist", "core.js");
  if (!existsSync(core)) {
    throw new Error(`${core} does not exist. Build the package first with "vp pack".`);
  }
  const { extractColorsFromPixels } = await import(pathToFileURL(core).href);
  const result = extractColorsFromPixels({
    data: new Uint8Array([255, 0, 0, 255]),
    width: 1,
    height: 1,
  });
  return result.meta.algorithmVersion;
}

async function main() {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url)));
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (version.includes("-")) {
    console.log(`Version ${version} is a prerelease: the evaluation report is not required.`);
    return;
  }
  const algorithmVersion = await builtAlgorithmVersion(root);
  const { problems, checked } = checkReport({ version, algorithmVersion, root });
  if (problems.length > 0) {
    console.error(
      `Version ${version} (algorithmVersion ${algorithmVersion}) cannot be released without its evaluation report:`,
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      "To fix it, run `vp run eval` and `vp run bench` on the maintainer's machine and commit " +
        `the reports in eval/reports/${algorithmVersion}/.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Version ${version} (algorithmVersion ${algorithmVersion}): the evaluation report is complete.`,
  );
  for (const file of checked) console.log(`  ok ${file}`);
  console.log(`  ok test.json names algorithmVersion ${algorithmVersion}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
