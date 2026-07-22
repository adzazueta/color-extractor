import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
    resolve(ROOT, '.github/workflows/release.yml'),
    'utf-8',
);

describe('release workflow', () => {
    it('uses workflow_dispatch trigger', () => {
        expect(workflow).toMatch(/workflow_dispatch/);
    });

    it('accepts release_branch and release_type inputs', () => {
        expect(workflow).toContain('release_branch');
        expect(workflow).toContain('release_type');
        expect(workflow).toContain('prerelease');
        expect(workflow).toContain('stable');
    });

    it('validates branch name matches release/X.Y', () => {
        expect(workflow).toContain("grep -qE '^release/[0-9]+\\.[0-9]+$'");
    });

    it('validates branch is based on main', () => {
        expect(workflow).toContain(
            'git merge-base --is-ancestor origin/main HEAD',
        );
    });

    it('prepares version then runs checks', () => {
        expect(workflow).toContain('pnpm release:prepare');
        expect(workflow).toContain('pnpm release:check');
    });

    it('validates version suffix matches release type', () => {
        expect(workflow).toContain("grep -qE '\\-next\\.'");
        expect(workflow).toContain(
            'stable version must not contain prerelease suffix',
        );
    });

    it('commits and pushes validated version before publishing', () => {
        expect(workflow).toContain(
            'git commit -m "chore(release): v$' + '{{ env.version }}"',
        );
        expect(workflow).toContain('git push');
    });

    it('uses changesets/action/publish@v2 for publish, tags and GitHub Release', () => {
        expect(workflow).toContain('changesets/action/publish@v2');
        expect(workflow).toContain('create-github-releases: true');
        expect(workflow).toContain('push-git-tags: true');
        expect(workflow).toContain('script: pnpm release');
    });

    it('creates a PR to main using RELEASE_TOKEN', () => {
        expect(workflow).toContain(
            'GH_TOKEN: $' + '{{ secrets.RELEASE_TOKEN }}',
        );
        expect(workflow).toContain('gh pr create');
    });
});
