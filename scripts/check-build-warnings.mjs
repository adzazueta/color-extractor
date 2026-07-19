import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');

/** @typedef {'node'|'browser'|'core'|'root'} Entrypoint */

/**
 * Classify a dist/ file path into its logical entrypoint.
 * Shared chunks like core-XXXX.js are classified as shared.
 * @param {string} absPath
 * @returns {Entrypoint|'shared'|'unknown'}
 */
function classifyFile(absPath) {
    const rel = relative(DIST, absPath);
    if (rel.startsWith(`node${sep}`)) return 'node';
    if (rel.startsWith(`browser${sep}`)) return 'browser';
    if (rel.startsWith(`core${sep}`)) return 'core';
    if (rel === 'index.js' || rel === 'index.d.ts') return 'root';
    if (rel.endsWith('.d.ts')) return 'shared'; // type declarations
    if (rel.includes('-') && rel.endsWith('.js')) return 'shared'; // shared chunk
    return 'unknown';
}

/**
 * Find all .js and .d.ts files under dist/ recursively.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function findFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findFiles(full)));
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
            files.push(full);
        }
    }
    return files;
}

/**
 * Extract module specifiers from JavaScript source.
 * Captures static ESM imports and any function call whose
 * argument is a string literal matching a known module (sharp, node:*).
 * @param {string} code
 * @returns {string[]}
 */
function extractImports(code) {
    const imports = new Set();

    // Static ESM: import ... from "module"
    const staticRe = /import\s+(?:[\s\S]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g;
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
    while ((match = staticRe.exec(code)) !== null) {
        imports.add(match[1]);
    }

    // String literals that look like module specifiers for node:* or sharp
    // These appear in dynamic import() calls or wrapper functions
    const specifierRe = /["'`](sharp|node:[\w/-]+)["'`]/g;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
    while ((match = specifierRe.exec(code)) !== null) {
        imports.add(match[1]);
    }

    return [...imports];
}

/**
 * Check if a module specifier is a Node builtin or sharp.
 * @param {string} specifier
 * @returns {boolean}
 */
function isNodeOrSharp(specifier) {
    return specifier.startsWith('node:') || specifier === 'sharp';
}

/**
 * Format the module name for allowlist matching.
 * @param {string} specifier
 * @returns {string}
 */
function normalizeModule(specifier) {
    return specifier;
}

async function main() {
    const { ALLOWLIST } = await import(
        resolve(ROOT, 'scripts/build-warnings.allowlist.mjs')
    );

    const files = await findFiles(DIST);
    const errors = [];
    const reported = [];

    for (const file of files) {
        const entrypoint = classifyFile(file);
        if (entrypoint === 'unknown') continue;

        // Only inspect .js files for module references; .d.ts files
        // may contain these strings inside type unions (e.g. decoder types)
        // and are not bundled imports
        if (!file.endsWith('.js')) continue;

        if (entrypoint === 'shared') {
            // Shared chunks must not reference node: or sharp
            const code = await readFile(file, 'utf-8');
            const imports = extractImports(code);
            for (const specifier of imports) {
                if (isNodeOrSharp(specifier)) {
                    errors.push(
                        `shared chunk ${relative(DIST, file)} imports "${specifier}" which is not allowed outside the node entrypoint`,
                    );
                }
            }
            continue;
        }

        const code = await readFile(file, 'utf-8');
        const imports = extractImports(code);

        for (const specifier of imports) {
            if (!isNodeOrSharp(specifier)) continue;

            const module = normalizeModule(specifier);
            const allowed = ALLOWLIST.find(
                (a) =>
                    a.entrypoint === entrypoint &&
                    a.category === 'EXTERNAL' &&
                    a.module === module,
            );

            if (allowed) {
                reported.push(
                    `  [${entrypoint}] ${module} — ${allowed.rationale}`,
                );
            } else if (entrypoint === 'node') {
                errors.push(
                    `node entrypoint imports "${specifier}" but it is not in the build-warnings allowlist — add an entry to scripts/build-warnings.allowlist.mjs if this is intentional`,
                );
            } else {
                errors.push(
                    `${entrypoint} entrypoint imports "${specifier}" — Node/sharp dependencies are not allowed outside the node entrypoint`,
                );
            }
        }
    }

    // Verify every allowlisted node entry has a matching import in the bundle
    const nodeList = ALLOWLIST.filter((a) => a.entrypoint === 'node');
    const nodeFile = files.find(
        (f) => relative(DIST, f) === `node${sep}index.js`,
    );
    if (nodeFile) {
        const nodeCode = await readFile(nodeFile, 'utf-8');
        const nodeImports = extractImports(nodeCode);
        for (const allowance of nodeList) {
            if (
                !nodeImports.some(
                    (i) => normalizeModule(i) === allowance.module,
                )
            ) {
                errors.push(
                    `allowlisted module "${allowance.module}" is not actually imported by the node bundle — remove stale entry from scripts/build-warnings.allowlist.mjs`,
                );
            }
        }
    }

    process.stdout.write(`\nBuild warning policy (ADZ-102)\n\n`);
    if (reported.length > 0) {
        process.stdout.write(`Allowed externalizations:\n`);
        for (const r of reported) process.stdout.write(`${r}\n`);
        process.stdout.write(`\n`);
    }
    if (errors.length > 0) {
        for (const e of errors) process.stdout.write(`  ✗ ${e}\n`);
        process.stdout.write(`\n  ${errors.length} violation(s) found\n\n`);
        process.exit(1);
    }
    process.stdout.write(
        `  ✓ ${reported.length} allowed externalization(s), 0 violations\n\n`,
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
