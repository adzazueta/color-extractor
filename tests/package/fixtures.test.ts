import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const PKG = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const PKG_SCOPE_SLUG = PKG.name.replace('/', '-').replace('@', '');
const TARBALL_NAME = `${PKG_SCOPE_SLUG}-${PKG.version}.tgz`;

function pnpmPackTgz(): string {
    const result = spawnSync('pnpm', ['pack'], { cwd: ROOT, stdio: 'pipe' });
    const lines = (result.stdout?.toString().trim() ?? '').split('\n');
    return lines[lines.length - 1] ?? '';
}

function listTarball(tarball: string): string[] {
    const result = spawnSync('tar', ['-tzf', tarball], { stdio: 'pipe' });
    return (result.stdout?.toString().trim() ?? '')
        .split('\n')
        .filter(Boolean)
        .map((f) => f.replace(/^package\//, ''));
}

function tarballPath(): string {
    return resolve(ROOT, TARBALL_NAME);
}

describe('package tarball — manifest', () => {
    const EXPECTED_FILES = [
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
    ];

    it('pnpm pack creates a tarball', () => {
        const name = pnpmPackTgz();
        expect(name).toBe(TARBALL_NAME);
        expect(existsSync(tarballPath())).toBe(true);
    });

    it('contains every dist entrypoint', () => {
        const contents = listTarball(tarballPath());
        for (const file of EXPECTED_FILES) {
            expect(contents).toContain(file);
        }
    });

    it('contains no unexpected top-level entries', () => {
        const contents = listTarball(tarballPath());
        const topLevel = new Set(
            contents.map((f) => f.split('/')[0]).filter(Boolean) as string[],
        );
        const allowed = new Set([
            'dist',
            'package.json',
            'README.md',
            'LICENSE',
        ]);
        for (const entry of topLevel) {
            expect(allowed.has(entry)).toBe(true);
        }
    });

    it('contains dist/core entry', () => {
        const contents = listTarball(tarballPath());
        expect(contents).toContain('dist/core/index.js');
        expect(contents).toContain('dist/core/index.d.ts');
    });

    it('contains dist/browser entry', () => {
        const contents = listTarball(tarballPath());
        expect(contents).toContain('dist/browser/index.js');
        expect(contents).toContain('dist/browser/index.d.ts');
    });

    it('contains dist/node entry', () => {
        const contents = listTarball(tarballPath());
        expect(contents).toContain('dist/node/index.js');
        expect(contents).toContain('dist/node/index.d.ts');
    });
});

describe('verify-fixtures script', () => {
    it('verify-fixtures.mjs exists and is parseable', () => {
        const scriptPath = resolve(ROOT, 'scripts/verify-fixtures.mjs');
        expect(existsSync(scriptPath)).toBe(true);
        expect(() =>
            execFileSync('node', ['--check', scriptPath], { stdio: 'pipe' }),
        ).not.toThrow();
    });

    it('fixture verify.mjs files exist and are parseable', () => {
        for (const name of ['browser', 'node', 'core']) {
            const fp = resolve(ROOT, 'fixtures', name, 'src', 'verify.mjs');
            expect(existsSync(fp)).toBe(true);
            expect(() =>
                execFileSync('node', ['--check', fp], { stdio: 'pipe' }),
            ).not.toThrow();
        }
    });
});
