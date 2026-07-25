import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const versionTs = readFileSync(
    resolve(ROOT, 'src/generated/version.ts'),
    'utf-8',
);

const match = versionTs.match(/export const VERSION = '([^']+)'/);
const tsVersion = match?.[1];

if (!tsVersion || tsVersion !== pkg.version) {
    process.stderr.write(
        `error: src/generated/version.ts version ${tsVersion ?? '(missing)'} does not match package.json version ${pkg.version}\n`,
    );
    process.exit(1);
}
