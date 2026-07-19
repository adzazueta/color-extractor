import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    copyFileSync,
    existsSync,
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
            extraDeps: { sharp: PACKAGE_JSON.peerDependencies.sharp },
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

            // Copy verify script
            const verifySrc = resolve(
                FIXTURES_DIR,
                fix.name,
                'src',
                'verify.mjs',
            );
            const verifyDst = resolve(tmpDir, 'verify.mjs');
            copyFileSync(verifySrc, verifyDst);

            // Install from tarball
            const installOk = run(
                `npm install (${fix.extraDeps.sharp ? 'with sharp' : 'no extra deps'})`,
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

            // Run the fixture verify script
            const runOk = run(`node verify.mjs`, 'node', [verifyDst], {
                cwd: tmpDir,
                timeout: 30_000,
            });
            if (!runOk) {
                errors.push(`${fix.name}: verify script failed`);
                continue;
            }

            process.stdout.write(`  ✓ ${fix.name} fixture passed\n`);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
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
