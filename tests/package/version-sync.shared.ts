import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PackageJson {
    name: string;
    version: string;
}

export function loadPackageJson(packageRoot: string): PackageJson {
    return JSON.parse(
        readFileSync(resolve(packageRoot, 'package.json'), 'utf-8'),
    );
}

export async function checkVersionExport(
    modulePath: string,
    expectedVersion: string,
): Promise<string> {
    const mod = (await import(modulePath)) as { VERSION: string };
    if (mod.VERSION !== expectedVersion) {
        throw new Error(
            `VERSION mismatch: expected ${expectedVersion}, got ${mod.VERSION}`,
        );
    }
    return mod.VERSION;
}

export interface MetadataCheckResult {
    packageVersion: string;
    runtime: string;
}

export function checkCoreMetadata(
    result: { metadata?: { packageVersion: string; runtime: string } },
    expectedVersion: string,
): MetadataCheckResult {
    if (!result.metadata) {
        throw new Error('metadata is undefined');
    }
    if (result.metadata.packageVersion !== expectedVersion) {
        throw new Error(
            `metadata.packageVersion mismatch: expected ${expectedVersion}, got ${result.metadata.packageVersion}`,
        );
    }
    return {
        packageVersion: result.metadata.packageVersion,
        runtime: result.metadata.runtime,
    };
}

export const ENTRYPOINT_DISTS = [
    'dist/index.js',
    'dist/browser/index.js',
    'dist/node/index.js',
    'dist/core/index.js',
] as const;
