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
            'release:check',
            'release:prepare',
            'sync-version',
            'test',
            'test:smoke',
            'test:verbose',
            'test:watch',
            'typecheck',
            'verify-fixtures',
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
        it('delegates to release:check', () => {
            expect(scripts.prepublishOnly).toBe('pnpm release:check');
        });
    });

    describe('release:check', () => {
        const chain = scripts['release:check'] ?? '';

        it('chains all validation steps with &&', () => {
            expect(chain).toContain('lint');
            expect(chain).toContain('typecheck');
            expect(chain).toContain('test');
            expect(chain).toContain('build');
            expect(chain).toContain('test:smoke');
            expect(chain).toContain('verify-fixtures');
            expect(chain).toContain('&&');
        });

        it('runs lint first', () => {
            const iLint = chain.indexOf('lint');
            const iBuild = chain.indexOf('build');
            expect(iLint).toBeGreaterThanOrEqual(0);
            expect(iBuild).toBeGreaterThan(iLint);
        });

        it('runs build before smoke tests', () => {
            const iBuild = chain.indexOf('build');
            const iSmoke = chain.indexOf('test:smoke');
            expect(iBuild).toBeGreaterThanOrEqual(0);
            expect(iSmoke).toBeGreaterThan(iBuild);
        });

        it('runs packed-consumer verification after smoke tests', () => {
            expect(chain.indexOf('verify-fixtures')).toBeGreaterThan(
                chain.indexOf('test:smoke'),
            );
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

    describe('release:prepare', () => {
        it('versions packages before synchronizing generated runtime metadata', () => {
            expect(scripts['release:prepare']).toBe(
                'pnpm changeset version && pnpm sync-version',
            );
        });
    });
});
