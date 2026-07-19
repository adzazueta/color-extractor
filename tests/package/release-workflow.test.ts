import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
    resolve(ROOT, '.github/workflows/release.yml'),
    'utf-8',
);

describe('release workflow', () => {
    it('runs on pushes to main', () => {
        expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\n\s+- main/);
    });

    it('uses published Changesets action inputs', () => {
        expect(workflow).toContain('uses: changesets/action@v1');
        expect(workflow).toContain(
            `github-token: \${{ secrets.GITHUB_TOKEN }}`,
        );
        expect(workflow).toContain('version: pnpm release:version');
        expect(workflow).toContain('publish: pnpm release');
    });

    it('builds only after the version script updates generated metadata', () => {
        expect(workflow).not.toMatch(/- run: pnpm build/);
    });

    it('creates a GitHub Release and its package tag', () => {
        expect(workflow).toContain('createGithubReleases: true');
    });
});
