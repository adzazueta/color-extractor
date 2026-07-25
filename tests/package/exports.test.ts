import { execFileSync } from 'node:child_process';
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');

interface ConditionalExport {
    [condition: string]: string | ConditionalExport;
}

interface PackageJson {
    name: string;
    type: string;
    exports: Record<string, string | ConditionalExport>;
}

const pkg: PackageJson = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
) as PackageJson;

function expectCondition(entry: ConditionalExport, condition: string): string {
    const value = entry[condition];
    expect(typeof value, `condition "${condition}" must be a string`).toBe(
        'string',
    );
    return value as string;
}

function expectNestedCondition(
    entry: ConditionalExport,
    condition: string,
): ConditionalExport {
    const value = entry[condition];
    expect(typeof value, `condition "${condition}" must be an object`).toBe(
        'object',
    );
    return value as ConditionalExport;
}

function readExport(subpath: string): ConditionalExport {
    const entry = pkg.exports[subpath];
    expect(entry, `subpath "${subpath}" must be defined`).toBeDefined();
    expect(
        typeof entry,
        `subpath "${subpath}" must be an object with conditions`,
    ).toBe('object');
    return entry as ConditionalExport;
}

describe('public exports contract', () => {
    it('declares the package as ESM-only', () => {
        expect(pkg.type).toBe('module');
    });

    it('does not expose the source tree', () => {
        expect(pkg.exports['./src']).toBeUndefined();
        expect(pkg.exports['./src/index.ts']).toBeUndefined();
    });

    describe('root . entrypoint', () => {
        it('declares browser, node and default conditions', () => {
            const root = readExport('.');
            expect(Object.keys(root).sort()).toEqual([
                'browser',
                'default',
                'node',
            ]);
        });

        it.each(['browser', 'node', 'default'])(
            '%s has matching runtime and type declarations',
            (condition) => {
                const entry = expectNestedCondition(readExport('.'), condition);
                const types = expectCondition(entry, 'types');
                const runtime = expectCondition(entry, 'default');
                expect(existsSync(resolve(rootDir, types))).toBe(true);
                expect(existsSync(resolve(rootDir, runtime))).toBe(true);
            },
        );
    });

    describe('runtime subpaths', () => {
        it.each(['./browser', './node', './core'])(
            '%s is defined',
            (subpath) => {
                expect(pkg.exports[subpath]).toBeDefined();
            },
        );

        it.each(['./browser', './node', './core'])(
            '%s points to an existing types declaration',
            (subpath) => {
                const types = expectCondition(readExport(subpath), 'types');
                expect(types).toMatch(/\.d\.ts$/);
                expect(existsSync(resolve(rootDir, types))).toBe(true);
            },
        );

        it.each(['./browser', './node', './core'])(
            '%s points to an existing import bundle',
            (subpath) => {
                const importPath = expectCondition(
                    readExport(subpath),
                    'import',
                );
                expect(importPath).toMatch(/\.js$/);
                expect(existsSync(resolve(rootDir, importPath))).toBe(true);
            },
        );
    });

    it('exposes ./package.json for tooling', () => {
        expect(pkg.exports['./package.json']).toBe('./package.json');
    });
});

describe('built entrypoints can be imported from Node', () => {
    const expectedVersion: string = JSON.parse(
        readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
    ).version;

    it.each([
        ['./dist/index.js'],
        ['./dist/browser/index.js'],
        ['./dist/node/index.js'],
        ['./dist/core/index.js'],
    ])('%s loads and exposes the runtime marker', async (relPath) => {
        const url = pathToFileURL(resolve(rootDir, relPath)).href;
        const mod = (await import(url)) as { VERSION: string };
        expect(typeof mod.VERSION).toBe('string');
        expect(mod.VERSION).toBe(expectedVersion);
    });
});

describe('legacy API names are absent from all entrypoints', () => {
    const legacyNames = [
        'extractColor',
        'extractColorFromPixels',
        'extractColorFromImageData',
        'extractPalette',
        'extractPaletteFromPixels',
        'extractPaletteFromImageData',
        'DEFAULT_OPTIONS',
        'resolveOptions',
    ];

    it.each([
        ['./dist/index.js', 'root'],
        ['./dist/browser/index.js', 'browser'],
        ['./dist/node/index.js', 'node'],
        ['./dist/core/index.js', 'core'],
    ])('%s does not export legacy names (%s)', async (relPath, label) => {
        const url = pathToFileURL(resolve(rootDir, relPath)).href;
        const mod = (await import(url)) as Record<string, unknown>;
        for (const name of legacyNames) {
            expect(mod[name], `${label} should not export ${name}`).toBe(
                undefined,
            );
        }
    });
});

describe('tarball lexical scan — no legacy terminology', () => {
    const forbiddenTerms = [
        'extractColor',
        'extractColorFromPixels',
        'extractColorFromImageData',
        'extractPalette',
        'extractPaletteFromPixels',
        'extractPaletteFromImageData',
        'DEFAULT_OPTIONS',
        'resolveOptions',
        'ExtractedColor',
        'ExtractedSwatch',
        'SwatchId',
        'swatchIdFromHex',
        'role',
        'FilterCriteria',
    ];

    function collectDtsAndJsFiles(dir: string): string[] {
        const results: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...collectDtsAndJsFiles(full));
            } else if (
                entry.name.endsWith('.js') ||
                entry.name.endsWith('.d.ts')
            ) {
                results.push(full);
            }
        }
        return results;
    }

    it('dist files contain no forbidden legacy terms', () => {
        const distDir = resolve(rootDir, 'dist');
        expect(existsSync(distDir)).toBe(true);
        const files = collectDtsAndJsFiles(distDir);
        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const content = readFileSync(file, 'utf-8');
            for (const term of forbiddenTerms) {
                const re = new RegExp(`\\b${term}\\b`);
                expect(content).not.toMatch(re);
            }
        }
    });

    it('tarball JS/TS files contain no forbidden legacy terms', () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'ce-tarball-scan-'));
        try {
            execFileSync('pnpm', ['pack', '--pack-destination', tmpDir], {
                cwd: rootDir,
                stdio: 'pipe',
            });

            const tgzFiles = readdirSync(tmpDir).filter((f) =>
                f.endsWith('.tgz'),
            );
            expect(tgzFiles.length).toBe(1);

            const tgzPath = join(tmpDir, tgzFiles[0]!);
            execFileSync('tar', ['xzf', tgzPath, '-C', tmpDir], {
                stdio: 'pipe',
            });

            const extractedDir = join(tmpDir, 'package');
            expect(existsSync(extractedDir)).toBe(true);

            const files = collectDtsAndJsFiles(extractedDir);
            expect(files.length).toBeGreaterThan(0);

            for (const file of files) {
                const content = readFileSync(file, 'utf-8');
                const relPath = file.slice(extractedDir.length + 1);
                for (const term of forbiddenTerms) {
                    const re = new RegExp(`\\b${term}\\b`);
                    expect(
                        content,
                        `tarball ${relPath} should not contain "${term}"`,
                    ).not.toMatch(re);
                }
            }
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
