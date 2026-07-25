import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(ROOT, 'fixtures');
const PKG_NAME = '@adzazueta/color-extractor';
const ROOT_PKG = JSON.parse(
    readFileSync(resolve(ROOT, 'package.json'), 'utf-8'),
);

function run(label, cmd, args, opts = {}) {
    process.stdout.write(`  • ${label}... `);
    try {
        execFileSync(cmd, args, { stdio: 'pipe', timeout: 120_000, ...opts });
        process.stdout.write('OK\n');
        return true;
    } catch (e) {
        process.stdout.write('FAIL\n');
        if (e.stderr) process.stderr.write(e.stderr.toString());
        if (e.stdout) process.stdout.write(e.stdout.toString());
        return false;
    }
}

function usage() {
    console.error(
        'Usage:\n' +
            '  node scripts/verify-published.mjs <version>          (install from npm registry)\n' +
            '  node scripts/verify-published.mjs --local <tarball>  (verify from local tarball)\n' +
            '  or set PUBLISHED_VERSION env var\n',
    );
    process.exit(1);
}

function main() {
    const isLocal = process.argv[2] === '--local';
    if (isLocal && !process.argv[3]) {
        console.error('error: --local requires a tarball path\n');
        usage();
    }

    const version = isLocal
        ? process.argv[3]
        : process.env.PUBLISHED_VERSION || process.argv[2];
    if (!version) usage();

    const errors = [];
    let hasFatal = false;

    process.stdout.write(`\n═══════════════════════════════════════════════`);
    process.stdout.write(`\n  Post-Publish Consumer Verification`);
    process.stdout.write(
        `\n  Package: ${PKG_NAME}@${isLocal ? 'local' : version}`,
    );
    process.stdout.write(`\n═══════════════════════════════════════════════\n`);

    const tmpDir = mkdtempSync(resolve(tmpdir(), 'ce-verify-published-'));

    try {
        writeFileSync(
            resolve(tmpDir, 'package.json'),
            JSON.stringify({
                name: 'verify-published',
                private: true,
                type: 'module',
            }),
        );

        // Install from npm or via local tarball
        process.stdout.write(
            `\n── ${isLocal ? 'Install from local tarball' : 'Install from npm'} ──\n`,
        );
        const installSpec = isLocal
            ? `file:${resolve(process.cwd(), process.argv[3])}`
            : `${PKG_NAME}@${version}`;
        const installLabel = isLocal
            ? 'from tarball'
            : `npm install ${PKG_NAME}@${version}`;
        const installOk = run(
            installLabel,
            'npm',
            ['install', '--no-audit', '--no-fund', installSpec],
            { cwd: tmpDir },
        );

        if (!installOk) {
            errors.push('npm install failed');
            hasFatal = true;
            return;
        }

        const installedVersion = JSON.parse(
            readFileSync(
                resolve(tmpDir, 'node_modules', PKG_NAME, 'package.json'),
                'utf-8',
            ),
        ).version;
        process.stdout.write(`  ✓ installed version ${installedVersion}\n`);

        if (!isLocal && installedVersion !== version) {
            errors.push(
                `installed version ${installedVersion} != expected ${version}`,
            );
            hasFatal = true;
            return;
        }

        // Use a require scoped to the consumer so exports map is respected
        const consumerRequire = createRequire(resolve(tmpDir, 'package.json'));

        // 1. Root entrypoint
        process.stdout.write(`\n── Entrypoint resolution ──\n`);
        const rootEntry = consumerRequire(PKG_NAME);
        const checks = [
            [
                'root exports extractColors',
                typeof rootEntry.extractColors === 'function',
            ],
            ['root exports VERSION', typeof rootEntry.VERSION === 'string'],
            [
                'root exports ColorExtractorError',
                typeof rootEntry.ColorExtractorError === 'function',
            ],
            [
                'root exports COLOR_EXTRACTOR_ERROR_CODES',
                Array.isArray(rootEntry.COLOR_EXTRACTOR_ERROR_CODES),
            ],
            [
                'root exports DEFAULT_NEUTRAL_OPTIONS',
                typeof rootEntry.DEFAULT_NEUTRAL_OPTIONS === 'object',
            ],
            [
                'root does not export DEFAULT_OPTIONS',
                typeof rootEntry.DEFAULT_OPTIONS === 'undefined',
            ],
            [
                'root does not export resolveOptions',
                typeof rootEntry.resolveOptions === 'undefined',
            ],
        ];
        for (const [label, ok] of checks) {
            process.stdout.write(`  ${ok ? '✓' : '✘'} ${label}\n`);
            if (!ok) errors.push(label);
        }

        // 2. Node entrypoint
        const nodeEntry = consumerRequire(`${PKG_NAME}/node`);
        const nodeChecks = [
            [
                'node exports extractColors',
                typeof nodeEntry.extractColors === 'function',
            ],
            ['node exports VERSION', typeof nodeEntry.VERSION === 'string'],
            [
                'node exports DEFAULT_NEUTRAL_OPTIONS',
                typeof nodeEntry.DEFAULT_NEUTRAL_OPTIONS === 'object',
            ],
        ];
        for (const [label, ok] of nodeChecks) {
            process.stdout.write(`  ${ok ? '✓' : '✘'} ${label}\n`);
            if (!ok) errors.push(label);
        }

        // 3. Browser entrypoint
        const browserEntry = consumerRequire(`${PKG_NAME}/browser`);
        const browserChecks = [
            [
                'browser exports extractColors',
                typeof browserEntry.extractColors === 'function',
            ],
            [
                'browser exports VERSION',
                typeof browserEntry.VERSION === 'string',
            ],
            [
                'browser exports DEFAULT_NEUTRAL_OPTIONS',
                typeof browserEntry.DEFAULT_NEUTRAL_OPTIONS === 'object',
            ],
        ];
        for (const [label, ok] of browserChecks) {
            process.stdout.write(`  ${ok ? '✓' : '✘'} ${label}\n`);
            if (!ok) errors.push(label);
        }

        // 4. Core entrypoint
        const coreEntry = consumerRequire(`${PKG_NAME}/core`);
        const coreChecks = [
            [
                'core exports extractColorsFromPixels',
                typeof coreEntry.extractColorsFromPixels === 'function',
            ],
            ['core exports VERSION', typeof coreEntry.VERSION === 'string'],
        ];
        for (const [label, ok] of coreChecks) {
            process.stdout.write(`  ${ok ? '✓' : '✘'} ${label}\n`);
            if (!ok) errors.push(label);
        }

        // 5. Legacy names are absent
        process.stdout.write(`\n── Legacy name absence ──\n`);
        const banned = [
            'extractColor',
            'extractColorFromPixels',
            'extractColorFromImageData',
            'extractPalette',
        ];
        for (const name of banned) {
            const absent = rootEntry[name] === undefined;
            process.stdout.write(
                `  ${absent ? '✓' : '✘'} root does not export ${name}\n`,
            );
            if (!absent) errors.push(`root exports banned name: ${name}`);
        }

        // 6. Run consumer fixtures
        process.stdout.write(`\n── Fixture runs ──\n`);
        const TS_VERSION = JSON.parse(
            readFileSync(
                resolve(ROOT, 'node_modules', 'typescript', 'package.json'),
                'utf-8',
            ),
        ).version;

        const SHARP_VERSION =
            ROOT_PKG.peerDependencies?.sharp?.replace(/^\^/, '') || 'latest';

        const fixtures = [
            { name: 'browser', extraDeps: {} },
            { name: 'core', extraDeps: {} },
            { name: 'node', extraDeps: { sharp: SHARP_VERSION } },
            {
                name: 'typescript',
                typecheck: true,
                extraDeps: { typescript: TS_VERSION },
            },
        ];

        for (const fix of fixtures) {
            process.stdout.write(`\n  ◆ ${fix.name} fixture\n`);
            const fixtureDir = mkdtempSync(
                resolve(tmpdir(), `ce-pub-${fix.name}-`),
            );
            try {
                writeFileSync(
                    resolve(fixtureDir, 'package.json'),
                    JSON.stringify({
                        name: `pub-fixture-${fix.name}`,
                        private: true,
                        type: 'module',
                        dependencies: {
                            [PKG_NAME]: installSpec,
                            ...fix.extraDeps,
                        },
                    }),
                );

                const isTypecheck = Boolean(fix.typecheck);

                if (isTypecheck) {
                    mkdirSync(resolve(fixtureDir, 'src'), { recursive: true });
                    copyFileSync(
                        resolve(FIXTURES_DIR, fix.name, 'src', 'verify.ts'),
                        resolve(fixtureDir, 'src', 'verify.ts'),
                    );
                    copyFileSync(
                        resolve(FIXTURES_DIR, fix.name, 'tsconfig.json'),
                        resolve(fixtureDir, 'tsconfig.json'),
                    );
                } else {
                    copyFileSync(
                        resolve(FIXTURES_DIR, fix.name, 'src', 'verify.mjs'),
                        resolve(fixtureDir, 'verify.mjs'),
                    );
                }

                const installLabel = (() => {
                    if (isTypecheck) return 'with typescript';
                    if (fix.extraDeps?.sharp) return 'with sharp';
                    return 'no extra deps';
                })();
                const fixInstallOk = run(
                    `npm install (${installLabel})`,
                    'npm',
                    [
                        'install',
                        '--no-audit',
                        '--no-fund',
                        '--install-strategy',
                        'nested',
                    ],
                    { cwd: fixtureDir, timeout: 120_000 },
                );
                if (!fixInstallOk) {
                    errors.push(`${fix.name}: npm install failed`);
                    continue;
                }

                if (isTypecheck) {
                    const tcOk = run(
                        'npx tsc --noEmit',
                        'npx',
                        ['tsc', '--noEmit'],
                        {
                            cwd: fixtureDir,
                            timeout: 30_000,
                        },
                    );
                    if (!tcOk) {
                        errors.push(
                            `${fix.name}: TypeScript compilation failed`,
                        );
                        continue;
                    }
                } else {
                    const runOk = run(
                        'node verify.mjs',
                        'node',
                        [resolve(fixtureDir, 'verify.mjs')],
                        {
                            cwd: fixtureDir,
                            timeout: 30_000,
                        },
                    );
                    if (!runOk) {
                        errors.push(`${fix.name}: verify script failed`);
                        continue;
                    }
                }

                process.stdout.write(`  ✓ ${fix.name} fixture passed\n`);
            } finally {
                rmSync(fixtureDir, { recursive: true, force: true });
            }
        }
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }

    if (hasFatal) {
        process.stdout.write(
            `\n  ✘ Fatal — ${errors[errors.length - 1] ?? 'unknown error'}\n\n`,
        );
        process.exit(1);
    }

    if (errors.length === 0) {
        process.stdout.write(`\n  ✔ All post-publish checks passed\n\n`);
        process.exit(0);
    } else {
        process.stdout.write(`\n  ✘ ${errors.length} failure(s):\n`);
        for (const e of errors) {
            process.stdout.write(`    • ${e}\n`);
        }
        process.stdout.write('\n');
        process.exit(1);
    }
}

main();
