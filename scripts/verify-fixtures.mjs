import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(ROOT, 'fixtures');
const PACKAGE_JSON = JSON.parse(
    readFileSync(resolve(ROOT, 'package.json'), 'utf-8'),
);
const PKG_NAME = PACKAGE_JSON.name;
const PKG_VERSION = PACKAGE_JSON.version;
const PKG_SCOPE_SLUG = PKG_NAME.replace('/', '-').replace('@', '');
const TARBALL_NAME = `${PKG_SCOPE_SLUG}-${PKG_VERSION}.tgz`;
const TARBALL_PATH = resolve(ROOT, TARBALL_NAME);
const TS_VERSION = JSON.parse(
    readFileSync(
        resolve(ROOT, 'node_modules', 'typescript', 'package.json'),
        'utf-8',
    ),
).version;
const SHARP_VERSION = JSON.parse(
    readFileSync(
        resolve(ROOT, 'node_modules', 'sharp', 'package.json'),
        'utf-8',
    ),
).version;

function run(label, cmd, args, opts = {}) {
    process.stdout.write(`\n  • ${label}... `);
    try {
        execFileSync(cmd, args, { stdio: 'pipe', ...opts });
        process.stdout.write('OK\n');
        return true;
    } catch (e) {
        process.stdout.write('FAIL\n');
        if (e.stderr) process.stderr.write(e.stderr.toString());
        if (e.stdout) process.stdout.write(e.stdout.toString());
        return false;
    }
}

function sha256(filePath) {
    const h = createHash('sha256');
    h.update(readFileSync(filePath));
    return h.digest('hex');
}

function listTarball(filePath) {
    const result = spawnSync('tar', ['-tzf', filePath], { stdio: 'pipe' });
    const lines = (result.stdout?.toString().trim() ?? '')
        .split('\n')
        .filter(Boolean);
    return lines.map((f) => f.replace(/^package\//, ''));
}

async function main() {
    const errors = [];
    let artifacts = {};

    process.stdout.write(`\n═══════════════════════════════════════════════`);
    process.stdout.write(`\n  Consumer Fixture Verification`);
    process.stdout.write(`\n  Package: ${PKG_NAME}@${PKG_VERSION}`);
    process.stdout.write(`\n═══════════════════════════════════════════════\n`);

    // 1. Gate: check build exists
    process.stdout.write(`\n── Gate checks ──\n`);
    if (!existsSync(resolve(ROOT, 'dist', 'index.js'))) {
        process.stdout.write('\n  dist/ not found — running build...\n');
        run('build', 'pnpm', ['build'], { cwd: ROOT });
    } else {
        process.stdout.write('  ✓ dist/ exists\n');
    }

    // 2. Pack the tarball
    process.stdout.write(`\n── Package artifact ──\n`);
    // Remove stale tarball
    if (existsSync(TARBALL_PATH)) {
        const oldDigest = sha256(TARBALL_PATH);
        rmSync(TARBALL_PATH);
        process.stdout.write(
            `  ✓ removed stale tarball (was ${oldDigest.slice(0, 12)}...)\n`,
        );
    }
    run('pack', 'pnpm', ['pack'], { cwd: ROOT });
    if (!existsSync(TARBALL_PATH)) {
        errors.push('tarball not created after pack');
        report(errors);
        return;
    }

    const digest = sha256(TARBALL_PATH);
    const contents = listTarball(TARBALL_PATH);
    const size = readFileSync(TARBALL_PATH).length;
    artifacts = { filename: TARBALL_NAME, size, sha256: digest, contents };
    process.stdout.write(
        `  ✓ ${TARBALL_NAME} (${(size / 1024).toFixed(1)} KB, sha256: ${digest.slice(0, 16)}...)\n`,
    );
    process.stdout.write(`  ✓ ${contents.length} entries in tarball\n`);

    // 3. Tarball manifest check
    process.stdout.write(`\n── Manifest check ──\n`);
    const expected = [
        'dist/index.js',
        'dist/index.d.ts',
        'dist/browser/index.js',
        'dist/browser/index.d.ts',
        'dist/node/index.js',
        'dist/node/index.d.ts',
        'dist/core/index.js',
        'dist/core/index.d.ts',
        'package.json',
        'README.md',
        'MIGRATION.md',
        'CONTRIBUTING.md',
        'LICENSE',
        'CHANGELOG.md',
        'SECURITY.md',
    ];
    for (const file of expected) {
        if (!contents.includes(file)) {
            const msg = `missing from tarball: ${file}`;
            errors.push(msg);
            process.stdout.write(`  ✗ ${msg}\n`);
        } else {
            process.stdout.write(`  ✓ ${file}\n`);
        }
    }

    // Reject unexpected top-level entries
    const allowedTopLevel = new Set([
        'dist',
        'package.json',
        'README.md',
        'MIGRATION.md',
        'CONTRIBUTING.md',
        'LICENSE',
        'CHANGELOG.md',
        'SECURITY.md',
    ]);
    const topLevel = new Set(contents.map((f) => f.split('/')[0]));
    for (const entry of topLevel) {
        if (!allowedTopLevel.has(entry)) {
            process.stdout.write(`  ? unexpected top-level: ${entry}/\n`);
        }
    }

    // 4. Run each consumer fixture
    process.stdout.write(`\n── Fixture runs ──\n`);

    const fixtures = [
        { name: 'browser', extraDeps: {} },
        { name: 'core', extraDeps: {} },
        {
            name: 'node',
            extraDeps: { sharp: SHARP_VERSION },
        },
        {
            name: 'typescript',
            typecheck: true,
            extraDeps: { typescript: TS_VERSION },
        },
    ];

    for (const fix of fixtures) {
        process.stdout.write(`\n  ◆ ${fix.name} fixture\n`);
        const tmpDir = mkdtempSync(
            resolve(tmpdir(), `ce-fixture-${fix.name}-`),
        );

        try {
            // Write package.json with absolute path to tarball
            writeFileSync(
                resolve(tmpDir, 'package.json'),
                JSON.stringify({
                    name: `fixture-${fix.name}`,
                    private: true,
                    type: 'module',
                    dependencies: {
                        [PKG_NAME]: `file:${TARBALL_PATH}`,
                        ...fix.extraDeps,
                    },
                }),
            );

            const hasSharp = Boolean(fix.extraDeps?.sharp);
            const isTypecheck = Boolean(fix.typecheck);

            if (isTypecheck) {
                // Copy TypeScript source file
                const verifySrc = resolve(
                    FIXTURES_DIR,
                    fix.name,
                    'src',
                    'verify.ts',
                );
                const srcDir = resolve(tmpDir, 'src');
                mkdirSync(srcDir, { recursive: true });
                const verifyDst = resolve(srcDir, 'verify.ts');
                copyFileSync(verifySrc, verifyDst);

                // Copy tsconfig.json
                const tsconfigSrc = resolve(
                    FIXTURES_DIR,
                    fix.name,
                    'tsconfig.json',
                );
                const tsconfigDst = resolve(tmpDir, 'tsconfig.json');
                copyFileSync(tsconfigSrc, tsconfigDst);
            } else {
                // Copy verify script
                const verifySrc = resolve(
                    FIXTURES_DIR,
                    fix.name,
                    'src',
                    'verify.mjs',
                );
                const verifyDst = resolve(tmpDir, 'verify.mjs');
                copyFileSync(verifySrc, verifyDst);
            }

            // Install from tarball
            const installLabel = hasSharp
                ? 'with sharp'
                : isTypecheck
                  ? 'with typescript'
                  : 'no extra deps';
            const installOk = run(
                `npm install (${installLabel})`,
                'npm',
                [
                    'install',
                    '--no-audit',
                    '--no-fund',
                    '--install-strategy',
                    'nested',
                ],
                { cwd: tmpDir, timeout: 120_000 },
            );
            if (!installOk) {
                errors.push(`${fix.name}: npm install failed`);
                continue;
            }

            if (isTypecheck) {
                // TypeScript typecheck: compile with tsc --noEmit
                const typecheckOk = run(
                    'npx tsc --noEmit',
                    'npx',
                    ['tsc', '--noEmit'],
                    { cwd: tmpDir, timeout: 30_000 },
                );
                if (!typecheckOk) {
                    errors.push(`${fix.name}: TypeScript compilation failed`);
                    continue;
                }
            } else {
                // Run the fixture verify script
                const verifyDst = resolve(tmpDir, 'verify.mjs');
                const runOk = run(`node verify.mjs`, 'node', [verifyDst], {
                    cwd: tmpDir,
                    timeout: 30_000,
                });
                if (!runOk) {
                    errors.push(`${fix.name}: verify script failed`);
                    continue;
                }
            }

            process.stdout.write(`  ✓ ${fix.name} fixture passed\n`);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    }

    // 5. Validate declaration map references (no dangling .d.ts.map URLs)
    process.stdout.write(`\n── Declaration map validation ──\n`);
    let danglingCount = 0;
    for (const file of contents) {
        if (!file.endsWith('.d.ts')) continue;
        const distPath = resolve(ROOT, file);
        if (!existsSync(distPath)) continue;
        const content = readFileSync(distPath, 'utf-8');
        const mapRefs = content.match(
            /\/\/# sourceMappingURL=(.*\.d\.ts\.map)/g,
        );
        if (mapRefs) {
            for (const ref of mapRefs) {
                const mapFile = ref.replace('//# sourceMappingURL=', '');
                const mapPath = resolve(
                    ROOT,
                    file.replace(/[^/]*$/, ''),
                    mapFile,
                );
                if (!existsSync(mapPath)) {
                    process.stdout.write(
                        `  ✗ dangling map ref: ${file} -> ${mapFile}\n`,
                    );
                    danglingCount++;
                }
            }
        }
    }
    if (danglingCount === 0) {
        process.stdout.write('  ✓ no dangling declaration map references\n');
    } else {
        const msg = `${danglingCount} dangling declaration map reference(s)`;
        errors.push(msg);
        process.stdout.write(`  ✘ ${msg}\n`);
    }

    // 6. Generate public-surface audit artifact
    process.stdout.write(`\n── Public surface audit ──\n`);
    const { main: generateSurface } = await import(
        './generate-public-surface.mjs'
    );
    try {
        const surface = generateSurface();
        if (surface.legacyRemnantsFound.length > 0) {
            const msg = `legacy remnants found: ${surface.legacyRemnantsFound.join(', ')}`;
            errors.push(msg);
            process.stdout.write(`  ✘ ${msg}\n`);
        } else {
            process.stdout.write('  ✓ no legacy remnants in public surface\n');
        }
    } catch (e) {
        const msg = `public-surface generation failed: ${e.message}`;
        errors.push(msg);
        process.stdout.write(`  ✘ ${msg}\n`);
    }

    report(errors, artifacts);
}

function report(errors, artifacts) {
    if (errors.length === 0) {
        process.stdout.write(`\n  ✔ All fixtures passed\n\n`);
    } else {
        process.stdout.write(`\n  ✘ ${errors.length} failure(s):\n`);
        for (const e of errors) {
            process.stdout.write(`    • ${e}\n`);
        }
        process.stdout.write('\n');
    }

    if (artifacts.contents) {
        process.stdout.write(`  Artifact: ${artifacts.filename}\n`);
        process.stdout.write(
            `  Size:     ${(artifacts.size / 1024).toFixed(1)} KB\n`,
        );
        process.stdout.write(`  SHA-256:  ${artifacts.sha256}\n`);

        process.stdout.write(`\n── Tarball contents ──\n`);
        for (const f of artifacts.contents) {
            process.stdout.write(`  ${f}\n`);
        }
        process.stdout.write('\n');
    }

    process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
