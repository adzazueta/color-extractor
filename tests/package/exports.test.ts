import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');

interface ConditionalExport {
    [condition: string]: string;
}

interface PackageJson {
    name: string;
    type: string;
    exports: Record<string, string | ConditionalExport>;
}

const pkg: PackageJson = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
) as PackageJson;

function expectCondition(entry: ConditionalExport, condition: string): string {
    const value = entry[condition];
    expect(typeof value, `condition "${condition}" must be a string`).toBe(
        'string',
    );
    return value as string;
}

function readExport(subpath: string): ConditionalExport {
    const entry = pkg.exports[subpath];
    expect(entry, `subpath "${subpath}" must be defined`).toBeDefined();
    expect(
        typeof entry,
        `subpath "${subpath}" must be an object with conditions`,
    ).toBe('object');
    return entry as ConditionalExport;
}

describe('public exports contract', () => {
    it('declares the package as ESM-only', () => {
        expect(pkg.type).toBe('module');
    });

    it('does not expose the source tree', () => {
        expect(pkg.exports['./src']).toBeUndefined();
        expect(pkg.exports['./src/index.ts']).toBeUndefined();
    });

    describe('root . entrypoint', () => {
        it('declares types, browser, node and default conditions', () => {
            const root = readExport('.');
            expect(Object.keys(root).sort()).toEqual([
                'browser',
                'default',
                'node',
                'types',
            ]);
        });

        it('types declaration points to an existing file', () => {
            const types = expectCondition(readExport('.'), 'types');
            expect(existsSync(resolve(rootDir, types))).toBe(true);
        });

        it('browser bundle exists', () => {
            const browser = expectCondition(readExport('.'), 'browser');
            expect(existsSync(resolve(rootDir, browser))).toBe(true);
        });

        it('node bundle exists', () => {
            const node = expectCondition(readExport('.'), 'node');
            expect(existsSync(resolve(rootDir, node))).toBe(true);
        });

        it('default condition points to an existing file', () => {
            const def = expectCondition(readExport('.'), 'default');
            expect(existsSync(resolve(rootDir, def))).toBe(true);
        });
    });

    describe('runtime subpaths', () => {
        it.each(['./browser', './node', './core'])(
            '%s is defined',
            (subpath) => {
                expect(pkg.exports[subpath]).toBeDefined();
            },
        );

        it.each(['./browser', './node', './core'])(
            '%s points to an existing types declaration',
            (subpath) => {
                const types = expectCondition(readExport(subpath), 'types');
                expect(types).toMatch(/\.d\.ts$/);
                expect(existsSync(resolve(rootDir, types))).toBe(true);
            },
        );

        it.each(['./browser', './node', './core'])(
            '%s points to an existing import bundle',
            (subpath) => {
                const importPath = expectCondition(
                    readExport(subpath),
                    'import',
                );
                expect(importPath).toMatch(/\.js$/);
                expect(existsSync(resolve(rootDir, importPath))).toBe(true);
            },
        );
    });

    it('exposes ./package.json for tooling', () => {
        expect(pkg.exports['./package.json']).toBe('./package.json');
    });
});

describe('built entrypoints can be imported from Node', () => {
    it.each([
        ['./dist/index.js'],
        ['./dist/browser/index.js'],
        ['./dist/node/index.js'],
        ['./dist/core/index.js'],
    ])('%s loads and exposes the runtime marker', async (relPath) => {
        const url = pathToFileURL(resolve(rootDir, relPath)).href;
        const mod = (await import(url)) as { VERSION: string };
        expect(typeof mod.VERSION).toBe('string');
        expect(mod.VERSION).toBe('0.1.0');
    });
});
