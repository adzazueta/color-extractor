import { ColorExtractorError } from './errors.js';
import type {
    AnimatedHandling,
    ExtractColorsOptions,
    PrimaryPreset,
    SecondaryFallbackMode,
    SvgHandling,
} from './options.js';

export type ResolvedOptions = {
    readonly [K in keyof ExtractColorsOptions]-?: ExtractColorsOptions[K];
};

const VALID_PRIMARY_PRESETS: readonly PrimaryPreset[] = [
    'strict',
    'balanced',
    'vibrant',
    'dominant',
] as const;
const VALID_SECONDARY_FALLBACKS: readonly SecondaryFallbackMode[] = [
    'harmony',
    'null',
    'nearest',
] as const;
const VALID_ANIMATED: readonly AnimatedHandling[] = [
    'first-frame',
    'all-frames',
    'disabled',
] as const;
const VALID_SVG: readonly SvgHandling[] = [
    'disabled-in-node',
    'enabled-in-node',
    'disabled',
    'enabled',
] as const;

function isIn<T extends string>(
    value: string,
    allowed: readonly T[],
): value is T {
    return allowed.includes(value as T);
}

function assertInteger(
    name: string,
    value: number,
    min: number,
    max?: number,
): void {
    if (
        !Number.isInteger(value) ||
        value < min ||
        (max !== undefined && value > max)
    ) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `${name} must be an integer in [${min}, ${max ?? '∞'}], got ${value}`,
        );
    }
}

function assertNumber(
    name: string,
    value: number,
    min: number,
    max?: number,
): void {
    if (
        !Number.isFinite(value) ||
        value < min ||
        (max !== undefined && value > max)
    ) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `${name} must be a finite number in [${min}, ${max ?? '∞'}], got ${value}`,
        );
    }
}

function assertEnum<T extends string>(
    name: string,
    value: string,
    allowed: readonly T[],
): void {
    if (!isIn(value, allowed)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `${name} must be one of [${allowed.join(', ')}], got ${value}`,
        );
    }
}

function assertBoolean(name: string, value: unknown): void {
    if (typeof value !== 'boolean') {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `${name} must be a boolean, got ${typeof value === 'string' ? `"${value}"` : value}`,
        );
    }
}

function assertStringArray(name: string, value: unknown): void {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `${name} must be an array of strings, got ${JSON.stringify(value)}`,
        );
    }
}

export function validateResolvedOptions(opts: ResolvedOptions): void {
    assertInteger('sampleSize', opts.sampleSize, 1);
    assertInteger('paletteSize', opts.paletteSize, 0);
    assertInteger('accents', opts.accents, 0);

    const km = opts.kmeans;
    assertInteger('kmeans.clusters', km.clusters!, 1);
    assertInteger('kmeans.iterations', km.iterations!, 1);

    assertEnum('primary.preset', opts.primary.preset!, VALID_PRIMARY_PRESETS);
    assertEnum(
        'secondary.fallback',
        opts.secondary.fallback!,
        VALID_SECONDARY_FALLBACKS,
    );
    assertNumber('secondary.contrastMinDE', opts.secondary.contrastMinDE!, 0);
    assertNumber(
        'secondary.harmonyFallbackDeg',
        opts.secondary.harmonyFallbackDeg!,
        0,
        360,
    );

    const filter = opts.filtering;
    assertInteger('filtering.alphaThreshold', filter.alphaThreshold!, 0, 255);
    assertInteger('filtering.minBrightness', filter.minBrightness!, 0, 255);
    assertInteger('filtering.maxBrightness', filter.maxBrightness!, 0, 255);
    assertInteger('filtering.minSaturation', filter.minSaturation!, 0, 100);
    if (filter.minBrightness! > filter.maxBrightness!) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `filtering.minBrightness (${filter.minBrightness}) must not exceed filtering.maxBrightness (${filter.maxBrightness})`,
        );
    }

    assertNumber('scoring.chromaFloor', opts.scoring.chromaFloor!, 0);
    assertNumber('scoring.grayPenalty', opts.scoring.grayPenalty!, 0, 1);

    const light = opts.lightness;
    assertBoolean('lightness.enforceGap', light.enforceGap!);
    assertNumber('lightness.minGap', light.minGap!, 0, 100);

    const out = opts.output;
    assertBoolean('output.includePalette', out.includePalette!);
    assertBoolean('output.includeAccents', out.includeAccents!);
    assertBoolean('output.includeMetadata', out.includeMetadata!);
    assertBoolean('output.includeLab', out.includeLab!);
    assertBoolean('output.includeHsl', out.includeHsl!);
    assertBoolean('output.includeScores', out.includeScores!);

    const remote = opts.remote;
    assertBoolean('remote.allowPrivateNetworks', remote.allowPrivateNetworks!);
    assertBoolean('remote.validateContentType', remote.validateContentType!);
    assertNumber('remote.timeoutMs', remote.timeoutMs!, 1);
    assertNumber('remote.maxBytes', remote.maxBytes!, 1);
    assertInteger('remote.maxRedirects', remote.maxRedirects!, 0);
    assertStringArray('remote.allowedProtocols', remote.allowedProtocols!);

    const dec = opts.decode;
    assertNumber('decode.maxPixels', dec.maxPixels!, 1);
    assertEnum('decode.animated', dec.animated!, VALID_ANIMATED);
    assertEnum('decode.svg', dec.svg!, VALID_SVG);
    assertBoolean('decode.respectOrientation', dec.respectOrientation!);
    assertBoolean('decode.normalizeColorProfile', dec.normalizeColorProfile!);
}

export const DEFAULT_OPTIONS: ResolvedOptions = deepFreeze({
    sampleSize: 150,
    paletteSize: 5,
    accents: 0,
    kmeans: { clusters: 5, iterations: 7 },
    filtering: {
        alphaThreshold: 128,
        minBrightness: 10,
        maxBrightness: 245,
        minSaturation: 8,
    },
    primary: { preset: 'strict' },
    secondary: {
        fallback: 'harmony',
        contrastMinDE: 20,
        harmonyFallbackDeg: 150,
    },
    scoring: { chromaFloor: 12, grayPenalty: 0.1 },
    output: {
        includePalette: false,
        includeAccents: false,
        includeMetadata: false,
        includeLab: false,
        includeHsl: true,
        includeScores: false,
    },
    lightness: { enforceGap: false, minGap: 18 },
    remote: {
        timeoutMs: 10_000,
        maxBytes: 10_000_000,
        maxRedirects: 3,
        allowedProtocols: ['http:', 'https:'],
        allowPrivateNetworks: false,
        validateContentType: true,
    },
    decode: {
        maxPixels: 25_000_000,
        animated: 'first-frame',
        svg: 'disabled-in-node',
        respectOrientation: true,
        normalizeColorProfile: true,
    },
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
    if (!isPlainObject(value)) {
        return value;
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
        const v = (value as Record<string, unknown>)[key];
        result[key] = Array.isArray(v) ? v.slice() : deepClone(v);
    }
    return result as T;
}

function deepFreeze<T>(value: T): T {
    if (Array.isArray(value)) {
        for (const item of value) {
            deepFreeze(item);
        }
        Object.freeze(value);
        return value;
    }
    if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
            deepFreeze((value as Record<string, unknown>)[key]);
        }
        Object.freeze(value);
        return value;
    }
    return value;
}

function deepMerge<T>(defaults: T, user: Partial<T>): T {
    const defaultsRecord = defaults as unknown as Record<string, unknown>;
    const userRecord = user as unknown as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(defaultsRecord)) {
        result[key] = deepClone(defaultsRecord[key]);
    }
    for (const key of Object.keys(userRecord)) {
        const userValue = userRecord[key];
        if (userValue === undefined) {
            continue;
        }
        if (isPlainObject(userValue) && isPlainObject(result[key])) {
            result[key] = deepMerge(result[key], userValue);
        } else {
            result[key] = userValue;
        }
    }
    return result as T;
}

export function resolveOptions(user?: ExtractColorsOptions): ResolvedOptions {
    const resolved =
        user === undefined
            ? deepClone(DEFAULT_OPTIONS)
            : deepMerge(DEFAULT_OPTIONS, user);
    validateResolvedOptions(resolved);
    return resolved;
}
