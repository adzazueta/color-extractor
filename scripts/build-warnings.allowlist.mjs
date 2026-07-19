/**
 * @typedef {object} BuildWarningAllowance
 * @property {'node'|'browser'|'core'|'root'} entrypoint
 * @property {string} category  Warning category (e.g. 'EXTERNAL')
 * @property {string} module    External module specifier (e.g. 'node:fs', 'sharp')
 * @property {string} rationale Why this externalization is acceptable
 */

/** @type {BuildWarningAllowance[]} */
export const ALLOWLIST = [
    {
        entrypoint: 'node',
        category: 'EXTERNAL',
        module: 'sharp',
        rationale:
            'Optional peer dependency — dynamic import in src/node/sharp.ts',
    },
    {
        entrypoint: 'node',
        category: 'EXTERNAL',
        module: 'node:http',
        rationale:
            'HTTP client for remote image fetching — src/node/http-client.ts',
    },
    {
        entrypoint: 'node',
        category: 'EXTERNAL',
        module: 'node:https',
        rationale:
            'HTTPS client for remote image fetching — src/node/http-client.ts',
    },
    {
        entrypoint: 'node',
        category: 'EXTERNAL',
        module: 'node:dns/promises',
        rationale:
            'Custom DNS lookup for HTTP client — src/node/http-client.ts',
    },
    {
        entrypoint: 'node',
        category: 'EXTERNAL',
        module: 'node:fs/promises',
        rationale: 'Local file loading from disk — src/node/load.ts',
    },
    // PHANTOM_END_MARKER — used by build-warnings.test.ts to inject phantom entries
];
