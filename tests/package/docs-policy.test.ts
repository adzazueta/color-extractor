import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const DOCS_DIR = resolve(ROOT, 'docs');
const LINEAR_APP_RE = /linear\.app/g;

const PUBLIC_FILES = ['README.md', 'LICENSE', 'CHANGELOG.md', 'package.json'];

const PUBLIC_SOURCE_PATTERNS = [
    'src/**/*.ts',
    'tests/**/*.ts',
    'scripts/**/*.mjs',
];

describe('documentation policy (ADZ-139)', () => {
    it('docs/ directory has been removed', () => {
        expect(existsSync(DOCS_DIR)).toBe(false);
    });

    it.each(PUBLIC_FILES)('%s contains no linear.app URL', (rel) => {
        const content = readFileSync(resolve(ROOT, rel), 'utf-8');
        expect(content).not.toMatch(LINEAR_APP_RE);
    });

    it('required public files exist at repository root', () => {
        for (const rel of PUBLIC_FILES) {
            expect(existsSync(resolve(ROOT, rel)), `${rel} must exist`).toBe(
                true,
            );
        }
    });

    it('npm pack tarball does not include docs/', () => {
        const raw = execFileSync(
            'npm',
            ['pack', '--dry-run', '--json', '--ignore-scripts'],
            { cwd: ROOT, encoding: 'utf-8' },
        );
        const lines = raw.split('\n');
        const jsonStart = lines.findIndex((l) => l.trim() === '[');
        const jsonBlock =
            jsonStart >= 0 ? lines.slice(jsonStart).join('\n') : '[]';
        const tarballPaths: string[] =
            (
                JSON.parse(jsonBlock) as Array<{
                    files: Array<{ path: string }>;
                }>
            )[0]?.files.map((f) => f.path) ?? [];

        expect(tarballPaths).not.toContain('docs/');
        expect(tarballPaths.some((p) => p.startsWith('docs/'))).toBe(false);
        expect(tarballPaths).toContain('package.json');
        expect(tarballPaths).toContain('README.md');
        expect(tarballPaths).toContain('LICENSE');
    });
});
