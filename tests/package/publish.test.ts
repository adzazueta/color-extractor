import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');

interface PackageJson {
    name: string;
    version: string;
    license?: string;
    files?: string[];
}

const pkg: PackageJson = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
) as PackageJson;

describe('publish files configuration', () => {
    it('declares dist, README.md and LICENSE in files', () => {
        expect(pkg.files).toEqual(
            expect.arrayContaining(['dist', 'README.md', 'LICENSE']),
        );
    });

    it('LICENSE file exists at the package root', () => {
        expect(existsSync(resolve(rootDir, 'LICENSE'))).toBe(true);
    });

    it('README.md exists at the package root', () => {
        expect(existsSync(resolve(rootDir, 'README.md'))).toBe(true);
    });

    it('dist/ build output exists', () => {
        expect(existsSync(resolve(rootDir, 'dist'))).toBe(true);
    });

    it('dist contains the four public entrypoints', () => {
        const expected = [
            'index.js',
            'index.d.ts',
            'browser/index.js',
            'browser/index.d.ts',
            'node/index.js',
            'node/index.d.ts',
            'core/index.js',
            'core/index.d.ts',
        ];
        for (const rel of expected) {
            expect(
                existsSync(resolve(rootDir, 'dist', rel)),
                `dist/${rel} must exist`,
            ).toBe(true);
        }
    });
});

describe('npm pack --dry-run contents', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: rootDir,
        encoding: 'utf-8',
    });
    // npm pack --json can print [INFO] lifecycle messages before the JSON
    const lines = raw.split('\n');
    const jsonStart = lines.findIndex((l) => l.trim() === '[');
    const jsonBlock = jsonStart >= 0 ? lines.slice(jsonStart).join('\n') : '[]';
    const parsed = JSON.parse(jsonBlock) as Array<{
        files: Array<{ path: string }>;
    }>;
    const tarballFiles = parsed[0]?.files.map((f) => f.path) ?? [];

    it('tarball is non-empty', () => {
        expect(tarballFiles.length).toBeGreaterThan(0);
    });

    it('includes the four public entrypoint bundles with declarations', () => {
        const required = [
            'dist/index.js',
            'dist/index.d.ts',
            'dist/browser/index.js',
            'dist/browser/index.d.ts',
            'dist/node/index.js',
            'dist/node/index.d.ts',
            'dist/core/index.js',
            'dist/core/index.d.ts',
        ];
        for (const f of required) {
            expect(tarballFiles, `expected ${f} in tarball`).toContain(f);
        }
    });

    it('includes LICENSE and README.md', () => {
        expect(tarballFiles).toContain('LICENSE');
        expect(tarballFiles).toContain('README.md');
    });

    it('includes package.json', () => {
        expect(tarballFiles).toContain('package.json');
    });

    it('excludes source, tests, configs and tooling', () => {
        const bannedPrefixes = [
            'src/',
            'tests/',
            'tsconfig',
            'tsdown',
            'vitest',
            '.gitignore',
            '.npmrc',
            '.git/',
            'pnpm-lock',
        ];
        const bannedExact = [
            'src/index.ts',
            'src/browser/index.ts',
            'src/node/index.ts',
            'src/core/index.ts',
            'tests/smoke.test.ts',
            'tests/exports.test.ts',
            'tests/publish.test.ts',
            'node_modules',
        ];
        for (const p of [...bannedPrefixes, ...bannedExact]) {
            expect(tarballFiles, `must not include ${p}`).not.toContain(p);
        }
    });
});
