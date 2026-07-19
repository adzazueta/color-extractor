import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

interface BuildWarningAllowance {
    entrypoint: 'node' | 'browser' | 'core' | 'root';
    category: string;
    module: string;
    rationale: string;
}

async function loadAllowlist(): Promise<BuildWarningAllowance[]> {
    const mod = (await import(
        '../../scripts/build-warnings.allowlist.mjs'
    )) as unknown as { ALLOWLIST: BuildWarningAllowance[] };
    return mod.ALLOWLIST;
}

describe('build-warnings allowlist', () => {
    let ALLOWLIST!: BuildWarningAllowance[];

    beforeAll(async () => {
        ALLOWLIST = await loadAllowlist();
    });

    it('has only node entrypoint entries', () => {
        const entrypoints = new Set(ALLOWLIST.map((a) => a.entrypoint));
        expect([...entrypoints]).toEqual(['node']);
    });

    it('all entries have valid entrypoint, category, module and rationale', () => {
        for (const entry of ALLOWLIST) {
            expect(entry.entrypoint).toBe('node');
            expect(entry.category).toBe('EXTERNAL');
            expect(typeof entry.module).toBe('string');
            expect(entry.module.length).toBeGreaterThan(0);
            expect(typeof entry.rationale).toBe('string');
            expect(entry.rationale.length).toBeGreaterThan(0);
        }
    });

    it('sharp is allowlisted for node', () => {
        expect(
            ALLOWLIST.some(
                (a) => a.entrypoint === 'node' && a.module === 'sharp',
            ),
        ).toBe(true);
    });

    it('each allowlisted module is unique per entrypoint', () => {
        const seen = new Set<string>();
        for (const entry of ALLOWLIST) {
            const key = `${entry.entrypoint}:${entry.module}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
    });
});

describe('build-warnings checker', () => {
    const checker = resolve(ROOT, 'scripts/check-build-warnings.mjs');
    const nodeBundle = resolve(ROOT, 'dist/node/index.js');
    let originalNodeCode: string;

    beforeAll(() => {
        originalNodeCode = readFileSync(nodeBundle, 'utf-8');
    });

    afterAll(() => {
        writeFileSync(nodeBundle, originalNodeCode);
    });

    it('passes with zero violations on current build', () => {
        execFileSync('node', [checker], { cwd: ROOT, stdio: 'pipe' });
    });

    it('fails when a node: import appears in the browser bundle', () => {
        const browserPath = resolve(ROOT, 'dist/browser/index.js');
        const original = readFileSync(browserPath, 'utf-8');
        try {
            writeFileSync(
                browserPath,
                `${original}\nimport { readFile } from 'node:fs/promises';\n`,
            );
            expect(() =>
                execFileSync('node', [checker], {
                    cwd: ROOT,
                    stdio: 'pipe',
                }),
            ).toThrow();
        } finally {
            writeFileSync(browserPath, original);
        }
    });

    it('fails when sharp appears in the core bundle', () => {
        const corePath = resolve(ROOT, 'dist/core/index.js');
        const original = readFileSync(corePath, 'utf-8');
        try {
            writeFileSync(
                corePath,
                `${original}\nimport sharp from 'sharp';\n`,
            );
            expect(() =>
                execFileSync('node', [checker], {
                    cwd: ROOT,
                    stdio: 'pipe',
                }),
            ).toThrow();
        } finally {
            writeFileSync(corePath, original);
        }
    });

    it('fails when a non-allowlisted module appears in node bundle', () => {
        try {
            writeFileSync(
                nodeBundle,
                `${originalNodeCode}\nimport { exec } from 'node:child_process';\n`,
            );
            expect(() =>
                execFileSync('node', [checker], {
                    cwd: ROOT,
                    stdio: 'pipe',
                }),
            ).toThrow();
        } finally {
            writeFileSync(nodeBundle, originalNodeCode);
        }
    });

    it('fails when a stale allowlist entry has no matching import', async () => {
        // Temporarily add a phantom entry to the allowlist
        const spyPath = resolve(ROOT, 'scripts/build-warnings.allowlist.mjs');
        const spyContent = readFileSync(spyPath, 'utf-8');
        const phantomEntry = `    {
        entrypoint: 'node',
        category: 'EXTERNAL',
        module: 'node:phantom-dep',
        rationale: 'test fixture — never installed',
    },
    // PHANTOM_END_MARKER`;

        try {
            const patched = spyContent.replace(
                '// PHANTOM_END_MARKER',
                phantomEntry,
            );
            writeFileSync(spyPath, patched);
            expect(() =>
                execFileSync('node', [checker], {
                    cwd: ROOT,
                    stdio: 'pipe',
                }),
            ).toThrow();
        } finally {
            writeFileSync(spyPath, spyContent);
        }
    });
});
