import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
    resolve(ROOT, '.github/workflows/release.yml'),
    'utf-8',
);

describe('release workflow', () => {
    it('triggers on PR merge to release/*', () => {
        expect(workflow).toMatch(/pull_request:\s*\n\s+types:\s*\[closed\]/);
        expect(workflow).toMatch(/branches:\s*\n\s+-\s+'release\/\*\*'/);
    });

    it('only runs when merged from develop', () => {
        expect(workflow).toContain(
            "github.event.pull_request.merged == true && github.event.pull_request.head.ref == 'develop'",
        );
    });

    it('prepares version then runs checks', () => {
        expect(workflow).toContain('pnpm release:prepare');
        expect(workflow).toContain('pnpm release:check');
    });

    it('commits and publishes after validation', () => {
        expect(workflow).toContain(
            'git commit -m "chore: release v${VERSION} [skip ci]"',
        );
        expect(workflow).toContain('pnpm release');
    });

    it('creates a GitHub Release via gh', () => {
        expect(workflow).toContain('gh release create');
    });

    it('creates a PR to main using RELEASE_TOKEN', () => {
        expect(workflow).toContain('GH_TOKEN: ${{ secrets.RELEASE_TOKEN }}');
        expect(workflow).toContain('gh pr create');
    });
});
