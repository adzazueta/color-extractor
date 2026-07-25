import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const INTEGRATION_TIMEOUT = 300_000;

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');
const pkgJson = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
);
const scopeSlug = pkgJson.name.replace('/', '-').replace('@', '');
const version = pkgJson.version;
const tarballName = `${scopeSlug}-${version}.tgz`;
const tarballPath = resolve(rootDir, tarballName);

describe('verify-published script', () => {
    beforeAll(() => {
        // Remove any stale tarball
        if (existsSync(tarballPath)) {
            unlinkSync(tarballPath);
        }
        // Pack fresh tarball
        execFileSync('pnpm', ['pack'], { cwd: rootDir, stdio: 'pipe' });
        if (!existsSync(tarballPath)) {
            throw new Error(`tarball not created: ${tarballPath}`);
        }
    });

    afterAll(() => {
        if (existsSync(tarballPath)) {
            rmSync(tarballPath);
        }
    });

    it('passes all checks when run with --local against the packed tarball', {
        timeout: INTEGRATION_TIMEOUT,
    }, () => {
        const result = execFileSync(
            'node',
            ['scripts/verify-published.mjs', '--local', tarballPath],
            {
                cwd: rootDir,
                stdio: 'pipe',
                timeout: 300_000,
                encoding: 'utf-8',
            },
        );
        expect(result).toMatch(/✔ All post-publish checks passed/);
    });

    it('fails when executed with --local but missing tarball path', () => {
        expect(() =>
            execFileSync('node', ['scripts/verify-published.mjs', '--local'], {
                cwd: rootDir,
                stdio: 'pipe',
                timeout: 10_000,
            }),
        ).toThrow();
    });

    it('fails when no version or --local is provided', () => {
        expect(() =>
            execFileSync('node', ['scripts/verify-published.mjs'], {
                cwd: rootDir,
                stdio: 'pipe',
                timeout: 10_000,
            }),
        ).toThrow();
    });
});
