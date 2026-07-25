import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

const LEGACY_REMOVED = [
    'extractColor',
    'extractColorFromPixels',
    'extractColorFromImageData',
    'extractPalette',
    'extractPaletteFromPixels',
    'extractPaletteFromImageData',
    'DEFAULT_OPTIONS',
    'resolveOptions',
    'ExtractedColor',
    'ExtractedSwatch',
    'SwatchId',
];

const WHITELIST = {
    root: [
        'VERSION',
        'COLOR_EXTRACTOR_ERROR_CODES',
        'ColorExtractorError',
        'ColorExtractorErrorCode',
        'DEFAULT_NEUTRAL_OPTIONS',
        'extractColors',
        'ColorPixelInput',
        'RootExtractColorInput',
        'ExtractColorResult',
        'ExtractColorOptions',
        'ExtractionAlgorithm',
        'ExtractionDecoder',
        'ExtractionMetadata',
        'ExtractionRuntime',
        'ColorId',
        'ObservedColor',
        'PaletteRankings',
        'RgbColor',
        'HslColor',
        'LabColor',
        'AdvancedExtractionOptions',
        'BaseExtractColorOptions',
        'BrowserDecodeOptions',
        'BrowserExtractColorOptions',
        'CoreExtractColorOptions',
        'LabKmeansOptions',
        'NodeDecodeOptions',
        'NodeExtractColorOptions',
        'NodeRemoteOptions',
        'PerceptualRankingOptions',
        'ResultOptions',
        'SamplingOptions',
    ],
    browser: [
        'VERSION',
        'COLOR_EXTRACTOR_ERROR_CODES',
        'ColorExtractorError',
        'ColorExtractorErrorCode',
        'DEFAULT_NEUTRAL_OPTIONS',
        'extractColors',
        'extractColorsFromImageData',
        'BrowserExtractColorInput',
        'ExtractColorResult',
        'ExtractionAlgorithm',
        'ExtractionDecoder',
        'ExtractionMetadata',
        'ExtractionRuntime',
        'ColorId',
        'ObservedColor',
        'PaletteRankings',
        'RgbColor',
        'HslColor',
        'LabColor',
        'AdvancedExtractionOptions',
        'BaseExtractColorOptions',
        'BrowserDecodeOptions',
        'BrowserExtractColorOptions',
        'ExtractColorOptions',
        'LabKmeansOptions',
        'PerceptualRankingOptions',
        'ResultOptions',
        'SamplingOptions',
    ],
    node: [
        'VERSION',
        'COLOR_EXTRACTOR_ERROR_CODES',
        'ColorExtractorError',
        'ColorExtractorErrorCode',
        'DEFAULT_NEUTRAL_OPTIONS',
        'extractColors',
        'NodeExtractColorInput',
        'ExtractColorResult',
        'ExtractionAlgorithm',
        'ExtractionDecoder',
        'ExtractionMetadata',
        'ExtractionRuntime',
        'ColorId',
        'ObservedColor',
        'PaletteRankings',
        'RgbColor',
        'HslColor',
        'LabColor',
        'AdvancedExtractionOptions',
        'BaseExtractColorOptions',
        'ExtractColorOptions',
        'LabKmeansOptions',
        'NodeDecodeOptions',
        'NodeExtractColorOptions',
        'NodeRemoteOptions',
        'PerceptualRankingOptions',
        'ResultOptions',
        'SamplingOptions',
    ],
    core: [
        'VERSION',
        'COLOR_EXTRACTOR_ERROR_CODES',
        'ColorExtractorError',
        'ColorExtractorErrorCode',
        'DEFAULT_NEUTRAL_OPTIONS',
        'extractColorsFromPixels',
        'ColorPixelInput',
        'ExtractColorResult',
        'ExtractionAlgorithm',
        'ExtractionDecoder',
        'ExtractionMetadata',
        'ExtractionRuntime',
        'ColorId',
        'ObservedColor',
        'PaletteRankings',
        'RgbColor',
        'HslColor',
        'LabColor',
        'AdvancedExtractionOptions',
        'BaseExtractColorOptions',
        'CoreExtractColorOptions',
        'LabKmeansOptions',
        'PerceptualRankingOptions',
        'ResultOptions',
        'SamplingOptions',
    ],
};

function getJsMapFiles(dirPath) {
    const results = [];
    if (!existsSync(dirPath)) return results;
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        const full = resolve(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...getJsMapFiles(full));
        } else if (entry.name.endsWith('.js.map')) {
            results.push(full);
        }
    }
    return results;
}

function splitExportList(inner) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of inner) {
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current);
    return parts;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectDeclarationKind(content, name) {
    const escaped = escapeRegex(name);
    if (new RegExp(`\\btype\\s+${escaped}\\b`).test(content)) return 'type';
    if (new RegExp(`\\binterface\\s+${escaped}\\b`).test(content))
        return 'type';
    if (
        new RegExp(`\\b(?:declare\\s+)?function\\s+${escaped}\\b`).test(content)
    )
        return 'value';
    if (
        new RegExp(
            `\\b(?:declare\\s+)?(?:const|let|var)\\s+${escaped}\\b`,
        ).test(content)
    )
        return 'value';
    if (new RegExp(`\\b(?:declare\\s+)?class\\s+${escaped}\\b`).test(content))
        return 'value';
    if (new RegExp(`\\b(?:declare\\s+)?enum\\s+${escaped}\\b`).test(content))
        return 'value';
    if (
        new RegExp(`\\b(?:declare\\s+)?namespace\\s+${escaped}\\b`).test(
            content,
        )
    )
        return 'value';
    if (
        new RegExp(
            `\\b(?:declare\\s+)?abstract\\s+class\\s+${escaped}\\b`,
        ).test(content)
    )
        return 'value';
    return null;
}

function extractExports(filePath) {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, 'utf-8');
    const exportBlocks = content.match(/export\s+\{[^}]+\}/g);
    if (!exportBlocks) return [];

    const exports = [];
    const seen = new Set();

    for (const block of exportBlocks) {
        const inner = block
            .replace(/^export\s+\{\s*/, '')
            .replace(/\s*\};?$/, '');
        const parts = splitExportList(inner);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;

            const isType = trimmed.startsWith('type ');
            const name = trimmed
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)[0]
                .trim();

            if (!name || seen.has(name)) continue;
            seen.add(name);

            let kind = isType ? 'type' : 'value';
            if (kind === 'value') {
                const declKind = detectDeclarationKind(content, name);
                if (declKind) kind = declKind;
            }

            exports.push({ name, kind });
        }
    }

    return exports;
}

function main() {
    const entrypoints = [
        { path: 'index.d.ts', name: 'root' },
        { path: 'browser/index.d.ts', name: 'browser' },
        { path: 'node/index.d.ts', name: 'node' },
        { path: 'core/index.d.ts', name: 'core' },
    ];

    const surface = {};
    const whitelistViolations = [];
    for (const ep of entrypoints) {
        const fullPath = resolve(DIST, ep.path);
        const exports = extractExports(fullPath);
        const names = exports.map((e) => e.name);
        const allowed = WHITELIST[ep.name];
        for (const name of names) {
            if (allowed && !allowed.includes(name)) {
                whitelistViolations.push(
                    `${ep.name} exports unexpected symbol: ${name}`,
                );
            }
        }
        for (const name of allowed || []) {
            if (!names.includes(name)) {
                whitelistViolations.push(
                    `${ep.name} is missing expected symbol: ${name}`,
                );
            }
        }
        surface[ep.name] = {
            file: ep.path,
            exports,
            stableCount: names.length,
            legacyFound: LEGACY_REMOVED.filter((name) => names.includes(name)),
        };
    }

    const allExported = new Set(
        Object.values(surface).flatMap((ep) => ep.exports.map((e) => e.name)),
    );

    // Scan .js.map files for legacy names
    const mapFiles = getJsMapFiles(DIST);
    const mapLegacyHits = {};
    for (const mapFile of mapFiles) {
        const relMap = mapFile.slice(DIST.length + 1);
        const content = readFileSync(mapFile, 'utf-8');
        for (const legacy of LEGACY_REMOVED) {
            const escaped = legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\b${escaped}\\b`);
            if (re.test(content)) {
                if (!mapLegacyHits[legacy]) mapLegacyHits[legacy] = [];
                mapLegacyHits[legacy].push(relMap);
            }
        }
    }

    const report = {
        packageVersion: readFileSync(resolve(ROOT, 'package.json'), 'utf-8')
            ? JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
                  .version
            : 'unknown',
        generatedAt: new Date().toISOString(),
        legacyRemovedNames: LEGACY_REMOVED,
        legacyRemnantsFound: LEGACY_REMOVED.filter((name) =>
            allExported.has(name),
        ),
        whitelistViolations,
        mapLegacyHits,
        entrypoints: surface,
    };

    const outPath = resolve(ROOT, 'public-surface.json');
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(
        `  ✓ public-surface.json written (${Object.keys(surface).length} entrypoints, ${allExported.size} unique exports)`,
    );
    if (whitelistViolations.length > 0) {
        for (const v of whitelistViolations) {
            console.error(`  ⚠ whitelist violation: ${v}`);
        }
    }
    if (Object.keys(mapLegacyHits).length > 0) {
        console.error(
            `  ⚠ ${Object.keys(mapLegacyHits).length} legacy name(s) found in .js.map files`,
        );
    }
    return report;
}

export { extractExports, LEGACY_REMOVED, main, WHITELIST };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
