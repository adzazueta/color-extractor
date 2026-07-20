import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const SMOKE_SCRIPT = resolve(ROOT, 'scripts/smoke.mjs');
const PKG_JSON = resolve(ROOT, 'package.json');

describe('build smoke setup', () => {
    it('scripts/smoke.mjs exists', () => {
        expect(existsSync(SMOKE_SCRIPT)).toBe(true);
    });

    it('scripts/smoke.mjs references all expected entrypoints', () => {
        const content = readFileSync(SMOKE_SCRIPT, 'utf-8');
        expect(content).toContain('dist/node/index.js');
        expect(content).toContain('dist/browser/index.js');
        expect(content).toContain('dist/core/index.js');
        expect(content).toContain('dist/index.js');
        expect(content).toContain('dist/index.d.ts');
        expect(content).toContain('sharp');
    });

    it('package.json declares test:smoke script', () => {
        const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf-8'));
        expect(pkg.scripts).toHaveProperty('test:smoke');
        expect(pkg.scripts['test:smoke']).toBe('node scripts/smoke.mjs');
    });

    it('prepublishOnly delegates to release:check which includes smoke', () => {
        const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf-8'));
        const prep = pkg.scripts.prepublishOnly;
        expect(prep).toBe('pnpm release:check');
        const check = pkg.scripts['release:check'];
        expect(check).toContain('pnpm build');
        expect(check).toContain('pnpm test:smoke');
        expect(check.indexOf('pnpm build')).toBeLessThan(
            check.indexOf('pnpm test:smoke'),
        );
    });
});
