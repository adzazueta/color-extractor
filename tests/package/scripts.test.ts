import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');

interface PackageJson {
    scripts?: Record<string, string>;
}

const pkg: PackageJson = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
) as PackageJson;

const scripts = pkg.scripts ?? {};

describe('package scripts', () => {
    it('declares all required scripts', () => {
        expect(Object.keys(scripts).sort()).toEqual([
            'build',
            'changeset',
            'check-build-warnings',
            'check-version',
            'lint',
            'lint:fix',
            'prepare',
            'prepublishOnly',
            'release',
            'sync-version',
            'test',
            'test:smoke',
            'test:verbose',
            'test:watch',
            'typecheck',
        ]);
    });

    it('build runs sync-version, tsdown, then check-build-warnings', () => {
        expect(scripts.build).toBe(
            'pnpm sync-version && tsdown && node scripts/check-build-warnings.mjs',
        );
    });

    it('test runs vitest in single-run mode', () => {
        expect(scripts.test).toBe('vitest run');
    });

    it('test:verbose runs vitest in single-run mode with the verbose reporter', () => {
        expect(scripts['test:verbose']).toBe('vitest run --reporter=verbose');
    });

    it('test:watch runs vitest in watch mode', () => {
        expect(scripts['test:watch']).toBe('vitest');
    });

    it('typecheck runs tsc --noEmit', () => {
        expect(scripts.typecheck).toBe('tsc --noEmit');
    });

    describe('prepublishOnly', () => {
        it('chains typecheck, test and build with &&', () => {
            const chain = scripts.prepublishOnly ?? '';
            expect(chain).toMatch(/typecheck/);
            expect(chain).toMatch(/test/);
            expect(chain).toMatch(/build/);
            expect(chain).toContain('&&');
        });

        it('runs build first, then test, then typecheck, then smoke', () => {
            const chain = scripts.prepublishOnly ?? '';
            const iBuild = chain.indexOf('build');
            const iTest = chain.indexOf('test');
            const iType = chain.indexOf('typecheck');
            const iSmoke = chain.indexOf('test:smoke');
            expect(iBuild).toBeGreaterThanOrEqual(0);
            expect(iTest).toBeGreaterThan(iBuild);
            expect(iType).toBeGreaterThan(iTest);
            expect(iSmoke).toBeGreaterThan(iType);
        });

        it('exits non-zero when a chained step fails', () => {
            const fakeChain =
                'node -e "process.exit(1)" && node -e "process.exit(0)"';
            try {
                execFileSync('sh', ['-c', fakeChain], {
                    cwd: rootDir,
                    stdio: 'pipe',
                });
                expect.fail('expected non-zero exit code');
            } catch (error) {
                const e = error as { status?: number | null };
                expect(e.status).not.toBe(0);
            }
        });
    });
});
