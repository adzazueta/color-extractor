import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const DOCS_DIR = resolve(ROOT, 'docs');
const LINEAR_APP_RE = /linear\.app/g;

const PUBLIC_FILES = [
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'package.json',
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

    it('README links to CONTRIBUTING.md', () => {
        const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');
        expect(readme).toMatch(/\[CONTRIBUTING\.md\]\(CONTRIBUTING\.md\)/);
    });

    it('README links to SECURITY.md', () => {
        const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');
        expect(readme).toMatch(/\[SECURITY\.md\]\(SECURITY\.md\)/);
    });
});

describe('contributing guide (ADZ-138)', () => {
    const REQUIRED_HEADINGS = [
        'Current contribution model',
        'Reporting bugs',
        'Requesting features',
        'Documentation feedback',
        'Security vulnerabilities',
        'Development conventions',
        'Pull request policy',
        'Branch and release governance',
        'Code of conduct',
        'License',
        'Policy evolution',
    ];

    const contributingPath = resolve(ROOT, 'CONTRIBUTING.md');
    const contributing = readFileSync(contributingPath, 'utf-8');

    it('exists at the repository root', () => {
        expect(existsSync(contributingPath)).toBe(true);
    });

    it('contains all required headings', () => {
        for (const heading of REQUIRED_HEADINGS) {
            expect(
                contributing,
                `CONTRIBUTING.md must contain heading "${heading}"`,
            ).toMatch(new RegExp(`^## ${heading}`, 'm'));
        }
    });

    it('states that unsolicited external PRs are not accepted', () => {
        expect(contributing).toMatch(
            /does\s+not\s+currently\s+accept\s+unsolicited\s+external\s+pull\s+requests/i,
        );
    });

    it('does not claim external PRs are accepted', () => {
        expect(contributing).not.toMatch(
            /(?:pull\s+requests?\s+are\s+welcomed?|we\s+accept\s+pull\s+requests?)/i,
        );
    });

    it('does not contain a placeholder contact', () => {
        expect(contributing).not.toMatch(
            /(?:todo|placeholder|\[email\s+protected\])/i,
        );
    });

    it('does not contain a linear.app URL', () => {
        expect(contributing).not.toMatch(LINEAR_APP_RE);
    });
});

describe('documentation policy (cont.)', () => {
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
        expect(tarballPaths).toContain('CHANGELOG.md');
        expect(tarballPaths).toContain('SECURITY.md');
    });
});
