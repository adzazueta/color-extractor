import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

function stripDeclarationMaps(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            stripDeclarationMaps(full);
        } else if (entry.name.endsWith('.d.ts')) {
            const content = readFileSync(full, 'utf-8');
            const cleaned = content.replace(
                /^\/\/# sourceMappingURL=.*\.d\.ts\.map\n?/gm,
                '',
            );
            if (cleaned !== content) {
                writeFileSync(full, cleaned);
                console.error(
                    `  ✓ stripped dangling map ref: ${full.replace(distDir, 'dist')}`,
                );
            }
        }
    }
}

stripDeclarationMaps(distDir);
