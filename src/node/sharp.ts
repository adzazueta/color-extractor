import { ColorExtractorError } from '../core/errors.js';

export interface SharpModule {
    // Structural subset of the sharp surface this package actually uses.
    // Kept narrow so we can stub it in tests without depending on the real package.
    readonly resize: (width: number) => unknown;
    readonly raw: (options?: {
        depth?: 'uchar' | 'ushort' | 'float';
    }) => unknown;
    readonly rotate: (angle?: number) => unknown;
}

type SharpCtor = new (
    input?: unknown,
    options?: { page?: number },
) => SharpModule;
type DynamicImport = (specifier: string) => Promise<unknown>;

const defaultImport: DynamicImport = (specifier) => import(specifier);

let cachedSharp: Promise<SharpCtor> | null = null;
let importFn: DynamicImport = defaultImport;

function isModuleNotFound(err: unknown): boolean {
    if (err === null || typeof err !== 'object') return false;
    const code = (err as { code?: unknown }).code;
    return code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
}

export function loadSharp(): Promise<SharpCtor> {
    if (cachedSharp) return cachedSharp;
    const importer = importFn;
    cachedSharp = (async () => {
        let mod: { default?: SharpCtor } & Record<string, unknown>;
        try {
            mod = (await importer('sharp')) as typeof mod;
        } catch (err) {
            if (isModuleNotFound(err)) {
                throw new ColorExtractorError(
                    'COLOR_EXTRACTOR_SHARP_MISSING',
                    'The optional peer dependency "sharp" is not installed. Install it to decode images in Node: `pnpm add sharp`.',
                    { cause: err },
                );
            }
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_DECODE_FAILED',
                'Failed to load the "sharp" peer dependency.',
                { cause: err },
            );
        }
        const ctor = (mod.default ??
            (mod as unknown as SharpCtor)) as SharpCtor;
        if (typeof ctor !== 'function') {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_SHARP_MISSING',
                'The loaded "sharp" module does not expose a callable constructor.',
                { cause: mod },
            );
        }
        return ctor;
    })();
    return cachedSharp;
}

export function _setSharpImporterForTests(fn: DynamicImport | null): void {
    importFn = fn ?? defaultImport;
}

export function _resetSharpCacheForTests(): void {
    cachedSharp = null;
}
