// Packed-package smoke test (specification 9.1).
//
// Usage: node scripts/smoke.mjs <path to the .tgz>
//
// Installs the tarball with npm in an empty project outside the repository, checks the entry
// points without sharp (decoding must fail with DECODER_MISSING), then installs sharp and checks
// that the same image decodes. Set SMOKE_EXPECTED_NODE (for example 22.12.0) to require an exact
// Node.js version. Only node: built-ins are used, because Node.js 22.12.0 cannot run TypeScript.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let step = 0;
const announce = (message) => console.log(`\n[smoke ${++step}] ${message}`);

/** Paths in node_modules/@adzazueta/color-extractor/dist of every declaration file. */
function declarationFiles(directory) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.d\.[cm]?ts$/.test(name))
    .map((name) => join(directory, name));
}

let project;
try {
  const argument = process.argv[2];
  if (argument === undefined) {
    throw new Error("Usage: node scripts/smoke.mjs <path to the .tgz>");
  }
  const tarball = resolve(argument);
  if (!existsSync(tarball)) {
    throw new Error(`The tarball does not exist: ${tarball}`);
  }

  announce("Check the Node.js version");
  const expectedNode = process.env.SMOKE_EXPECTED_NODE;
  if (expectedNode !== undefined && expectedNode !== "") {
    if (process.version !== `v${expectedNode}`) {
      throw new Error(`Expected Node.js v${expectedNode}, but running ${process.version}.`);
    }
    console.log(`Node.js ${process.version} is the expected version.`);
  } else {
    console.log(`Node.js ${process.version} (SMOKE_EXPECTED_NODE is not set).`);
  }

  const repository = fileURLToPath(new URL("..", import.meta.url));
  const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  const sharpVersion = manifest.devDependencies?.sharp;
  if (typeof sharpVersion !== "string") {
    throw new Error("package.json has no devDependencies.sharp version to install.");
  }

  announce("Create the empty project outside the repository");
  // npm refuses to run inside the repository (devEngines), so the project lives in a temp folder.
  project = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "color-extractor-smoke-"));
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "smoke", private: true, type: "module" }),
  );
  copyFileSync(
    fileURLToPath(new URL("./smoke-check.mjs", import.meta.url)),
    join(project, "check.mjs"),
  );
  console.log(project);

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const run = (command, args) =>
    execFileSync(command, args, { cwd: project, stdio: "inherit", shell: false });
  console.log(`npm ${execFileSync(npm, ["--version"], { cwd: project, encoding: "utf8" }).trim()}`);

  announce(`Install ${tarball} with npm`);
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball]);

  announce("Check that sharp is absent and not referenced by the declarations");
  if (existsSync(join(project, "node_modules", "sharp"))) {
    throw new Error(
      "npm installed the optional peer sharp; the DECODER_MISSING check would be meaningless.",
    );
  }
  const packageDirectory = join(project, "node_modules", "@adzazueta", "color-extractor");
  const declarations = declarationFiles(join(packageDirectory, "dist"));
  if (declarations.length === 0) {
    throw new Error("The installed package has no .d.ts files in dist/.");
  }
  for (const file of declarations) {
    // The quoted specifier is a type reference to the module. Prose in the TSDoc is fine.
    if (/["']sharp["']/.test(readFileSync(file, "utf8"))) {
      throw new Error(`${file} references the module "sharp"; the types must not depend on it.`);
    }
  }
  console.log(`${declarations.length} declaration files do not reference "sharp".`);

  announce("Without sharp: entry points, pixels, and DECODER_MISSING");
  run(process.execPath, ["check.mjs", "without-sharp"]);

  announce(`Install sharp@${sharpVersion}`);
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", `sharp@${sharpVersion}`]);

  announce("With sharp: the file decodes");
  run(process.execPath, ["check.mjs", "with-sharp"]);

  console.log("\nSmoke test passed.");
} catch (error) {
  console.error(
    `\nSmoke test FAILED at step ${step}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  if (project !== undefined) {
    rmSync(project, { recursive: true, force: true });
  }
}
