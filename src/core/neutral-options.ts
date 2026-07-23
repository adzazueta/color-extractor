import { isAlgorithmRegistered } from './algorithms/registry.js';
import { ColorExtractorError } from './errors.js';
import type { ExtractionAlgorithm } from './palette-types.js';

export type SamplingOptions = {
    maxDimension?: number;
};

export type FilteringOptions = {
    alphaThreshold?: number;
    minBrightness?: number;
    maxBrightness?: number;
    minSaturation?: number;
};

export type PaletteResultOptions = {
    maxColors?: number;
    includeHsl?: boolean;
};

export type LabKmeansOptions = {
    clusters?: number;
    iterations?: number;
};

export type MmcqOptions = {
    boxes?: number;
};

export type PerceptualRankingOptions = {
    chromaFloor?: number;
    lowChromaPenalty?: number;
};

export type AdvancedExtractionOptions = {
    labKmeans?: LabKmeansOptions;
    mmcq?: MmcqOptions;
    perceptualRanking?: PerceptualRankingOptions;
};

export type BaseExtractPaletteOptions = {
    algorithm?: ExtractionAlgorithm;
    sampling?: SamplingOptions;
    filtering?: FilteringOptions;
    result?: PaletteResultOptions;
    advanced?: AdvancedExtractionOptions;
    signal?: AbortSignal;
};

export type BrowserDecodeOptions = {
    maxPixels?: number;
};

export type BrowserExtractPaletteOptions = BaseExtractPaletteOptions & {
    decode?: BrowserDecodeOptions;
};

export type NodeRemoteOptions = {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    allowedProtocols?: readonly ('http:' | 'https:')[];
    allowPrivateNetworks?: boolean;
    validateContentType?: boolean;
};

export type NodeDecodeOptions = {
    maxPixels?: number;
    animated?: 'first-frame';
    svg?: 'disabled' | 'enabled';
    respectOrientation?: boolean;
    normalizeColorProfile?: boolean;
};

export type NodeExtractPaletteOptions = BaseExtractPaletteOptions & {
    remote?: NodeRemoteOptions;
    decode?: NodeDecodeOptions;
};

export type CoreExtractPaletteOptions = BaseExtractPaletteOptions;

export type ExtractPaletteOptions =
    | BrowserExtractPaletteOptions
    | NodeExtractPaletteOptions;

export type ResolvedSamplingOptions = {
    maxDimension: number;
};

export type ResolvedFilteringOptions = {
    alphaThreshold: number;
    minBrightness: number;
    maxBrightness: number;
    minSaturation: number;
};

export type ResolvedPaletteResultOptions = {
    maxColors: number;
    includeHsl: boolean;
};

export type ResolvedLabKmeansOptions = {
    clusters: number;
    iterations: number;
};

export type ResolvedMmcqOptions = {
    boxes: number;
};

export type ResolvedPerceptualRankingOptions = {
    chromaFloor: number;
    lowChromaPenalty: number;
};

export type ResolvedAdvancedExtractionOptions = {
    labKmeans: ResolvedLabKmeansOptions;
    mmcq: ResolvedMmcqOptions;
    perceptualRanking: ResolvedPerceptualRankingOptions;
};

export type ResolvedBrowserDecodeOptions = {
    maxPixels: number;
};

export type ResolvedNodeRemoteOptions = {
    timeoutMs: number;
    maxBytes: number;
    maxRedirects: number;
    allowedProtocols: readonly ('http:' | 'https:')[];
    allowPrivateNetworks: boolean;
    validateContentType: boolean;
};

export type ResolvedNodeDecodeOptions = {
    maxPixels: number;
    animated: 'first-frame';
    svg: 'disabled' | 'enabled';
    respectOrientation: boolean;
    normalizeColorProfile: boolean;
};

type ResolvedBaseOptions = {
    algorithm: ExtractionAlgorithm;
    sampling: ResolvedSamplingOptions;
    filtering: ResolvedFilteringOptions;
    result: ResolvedPaletteResultOptions;
    advanced: ResolvedAdvancedExtractionOptions;
};

export type ResolvedBrowserExtractPaletteOptions = ResolvedBaseOptions & {
    decode: ResolvedBrowserDecodeOptions;
};

export type ResolvedNodeExtractPaletteOptions = ResolvedBaseOptions & {
    remote: ResolvedNodeRemoteOptions;
    decode: ResolvedNodeDecodeOptions;
};

export type ResolvedCoreExtractPaletteOptions = ResolvedBaseOptions;

type CommonDefaults = {
    algorithm: ExtractionAlgorithm;
    sampling: ResolvedSamplingOptions;
    filtering: ResolvedFilteringOptions;
    result: ResolvedPaletteResultOptions;
    advanced: ResolvedAdvancedExtractionOptions;
};

const COMMON_DEFAULTS: CommonDefaults = {
    algorithm: 'lab-kmeans',
    sampling: { maxDimension: 150 },
    filtering: {
        alphaThreshold: 128,
        minBrightness: 10,
        maxBrightness: 245,
        minSaturation: 8,
    },
    result: { maxColors: 5, includeHsl: false },
    advanced: {
        labKmeans: { clusters: 8, iterations: 7 },
        mmcq: { boxes: 8 },
        perceptualRanking: { chromaFloor: 12, lowChromaPenalty: 0.1 },
    },
};

const BROWSER_DECODE_DEFAULTS: ResolvedBrowserDecodeOptions = {
    maxPixels: 25_000_000,
};

const NODE_REMOTE_DEFAULTS: ResolvedNodeRemoteOptions = {
    timeoutMs: 10_000,
    maxBytes: 10_000_000,
    maxRedirects: 3,
    allowedProtocols: ['http:', 'https:'],
    allowPrivateNetworks: false,
    validateContentType: true,
};

const NODE_DECODE_DEFAULTS: ResolvedNodeDecodeOptions = {
    maxPixels: 25_000_000,
    animated: 'first-frame',
    svg: 'disabled',
    respectOrientation: true,
    normalizeColorProfile: true,
};

const LEGACY_KEYS = new Set([
    'sampleSize',
    'paletteSize',
    'accents',
    'kmeans',
    'primary',
    'secondary',
    'scoring',
    'output',
    'lightness',
]);

const COMMON_GROUP_KEYS = new Set([
    'algorithm',
    'sampling',
    'filtering',
    'result',
    'advanced',
    'signal',
]);

const COMMON_NESTED_KEYS = {
    sampling: new Set(['maxDimension']),
    filtering: new Set([
        'alphaThreshold',
        'minBrightness',
        'maxBrightness',
        'minSaturation',
    ]),
    result: new Set(['maxColors', 'includeHsl']),
    advanced: new Set(['labKmeans', 'mmcq', 'perceptualRanking']),
};

const ADVANCED_NESTED_KEYS = {
    labKmeans: new Set(['clusters', 'iterations']),
    mmcq: new Set(['boxes']),
    perceptualRanking: new Set(['chromaFloor', 'lowChromaPenalty']),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null)
    );
}

function invalidOpt(path: string, detail: string): never {
    throw new ColorExtractorError(
        'COLOR_EXTRACTOR_INVALID_OPTIONS',
        `${path}: ${detail}`,
    );
}

function checkValidGroupKeys(
    obj: Record<string, unknown>,
    allowed: Set<string>,
    prefix: string,
): void {
    for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
            invalidOpt(`${prefix}.${key}`, `unknown option group or key`);
        }
    }
}

function assertFinite(path: string, value: unknown): asserts value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        invalidOpt(path, `must be a finite number, got ${String(value)}`);
    }
}

function assertInteger(
    path: string,
    value: unknown,
    min: number,
    max: number,
): number {
    assertFinite(path, value);
    if (!Number.isInteger(value) || value < min || value > max) {
        invalidOpt(
            path,
            `must be an integer in [${min}, ${max}], got ${String(value)}`,
        );
    }
    return value;
}

function assertNumber(
    path: string,
    value: unknown,
    min: number,
    max: number,
): number {
    assertFinite(path, value);
    if (value < min || value > max) {
        invalidOpt(path, `must be in [${min}, ${max}], got ${String(value)}`);
    }
    return value;
}

function resolveNumber(
    userValue: unknown,
    defaultValue: number,
    path: string,
    min: number,
    max: number,
): number {
    if (userValue === undefined || userValue === null) {
        return defaultValue;
    }
    return assertNumber(path, userValue, min, max);
}

function resolveInteger(
    userValue: unknown,
    defaultValue: number,
    path: string,
    min: number,
    max: number,
): number {
    if (userValue === undefined || userValue === null) {
        return defaultValue;
    }
    return assertInteger(path, userValue, min, max);
}

function resolveBoolean(
    userValue: unknown,
    defaultValue: boolean,
    path: string,
): boolean {
    if (userValue === undefined || userValue === null) {
        return defaultValue;
    }
    if (typeof userValue !== 'boolean') {
        invalidOpt(path, `must be a boolean, got ${String(userValue)}`);
    }
    return userValue;
}

function resolveEnum<T extends string>(
    userValue: unknown,
    allowed: readonly T[],
    path: string,
): T {
    if (allowed.includes(userValue as T)) {
        return userValue as T;
    }
    invalidOpt(
        path,
        `must be one of [${allowed.map((v) => JSON.stringify(v)).join(', ')}], got ${JSON.stringify(userValue)}`,
    );
}

function resolveAllowedProtocols(
    userValue: unknown,
    path: string,
): readonly ('http:' | 'https:')[] {
    if (userValue === undefined || userValue === null) {
        return ['http:', 'https:'];
    }
    if (
        !Array.isArray(userValue) ||
        userValue.length === 0 ||
        !userValue.every((v) => v === 'http:' || v === 'https:')
    ) {
        invalidOpt(
            path,
            `must be a non-empty array of "http:" or "https:", got ${JSON.stringify(userValue)}`,
        );
    }
    return [...(userValue as ('http:' | 'https:')[])];
}

function checkSignal(signal: unknown, path: string): AbortSignal | undefined {
    if (signal === undefined || signal === null) {
        return undefined;
    }
    if (
        typeof signal !== 'object' ||
        signal === null ||
        typeof (signal as Record<string, unknown>).aborted !== 'boolean' ||
        typeof (signal as Record<string, unknown>).addEventListener !==
            'function' ||
        typeof (signal as Record<string, unknown>).removeEventListener !==
            'function'
    ) {
        invalidOpt(path, `must be an AbortSignal, got ${String(signal)}`);
    }
    return signal as AbortSignal;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'Operation was aborted before it could start.',
        );
    }
}

function assertPlainObject(
    value: unknown,
    path: string,
): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        invalidOpt(path, `must be a plain object, got ${String(value)}`);
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
        invalidOpt(
            path,
            `must have Object.prototype or null prototype, got ${proto.constructor?.name ?? 'unknown'} prototype`,
        );
    }
}

function ownUnknown(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(obj)) {
        result[key] = obj[key];
    }
    return result;
}

function checkCommonGroupBounds(
    resolved: CommonDefaults,
    userGroup: Record<string, unknown> | undefined,
) {
    if (!userGroup) return;

    if (userGroup.sampling !== undefined) {
        assertPlainObject(userGroup.sampling, 'sampling');
        const g = ownUnknown(userGroup.sampling);
        checkValidGroupKeys(g, COMMON_NESTED_KEYS.sampling, 'sampling');
        resolved.sampling.maxDimension = resolveInteger(
            g.maxDimension,
            resolved.sampling.maxDimension,
            'sampling.maxDimension',
            1,
            4096,
        );
    }

    if (userGroup.filtering !== undefined) {
        assertPlainObject(userGroup.filtering, 'filtering');
        const g = ownUnknown(userGroup.filtering);
        checkValidGroupKeys(g, COMMON_NESTED_KEYS.filtering, 'filtering');
        resolved.filtering.alphaThreshold = resolveInteger(
            g.alphaThreshold,
            resolved.filtering.alphaThreshold,
            'filtering.alphaThreshold',
            0,
            255,
        );
        resolved.filtering.minBrightness = resolveNumber(
            g.minBrightness,
            resolved.filtering.minBrightness,
            'filtering.minBrightness',
            0,
            255,
        );
        resolved.filtering.maxBrightness = resolveNumber(
            g.maxBrightness,
            resolved.filtering.maxBrightness,
            'filtering.maxBrightness',
            0,
            255,
        );
        if (
            resolved.filtering.minBrightness > resolved.filtering.maxBrightness
        ) {
            invalidOpt(
                'filtering.minBrightness',
                `must not exceed filtering.maxBrightness (${resolved.filtering.maxBrightness})`,
            );
        }
        resolved.filtering.minSaturation = resolveNumber(
            g.minSaturation,
            resolved.filtering.minSaturation,
            'filtering.minSaturation',
            0,
            100,
        );
    }

    if (userGroup.result !== undefined) {
        assertPlainObject(userGroup.result, 'result');
        const g = ownUnknown(userGroup.result);
        checkValidGroupKeys(g, COMMON_NESTED_KEYS.result, 'result');
        resolved.result.maxColors = resolveInteger(
            g.maxColors,
            resolved.result.maxColors,
            'result.maxColors',
            1,
            64,
        );
        resolved.result.includeHsl = resolveBoolean(
            g.includeHsl,
            resolved.result.includeHsl,
            'result.includeHsl',
        );
    }
}

function deriveClusterDefault(maxColors: number): number {
    return Math.max(8, maxColors);
}

function checkAdvancedBounds(
    resolved: CommonDefaults,
    userAdvanced: Record<string, unknown> | undefined,
): void {
    const activeAlgorithm = resolved.algorithm;

    if (userAdvanced === undefined) {
        resolved.advanced.labKmeans.clusters = deriveClusterDefault(
            resolved.result.maxColors,
        );
        resolved.advanced.mmcq.boxes = Math.max(8, resolved.result.maxColors);
        return;
    }

    assertPlainObject(userAdvanced, 'advanced');
    userAdvanced = ownUnknown(userAdvanced);
    checkValidGroupKeys(userAdvanced, COMMON_NESTED_KEYS.advanced, 'advanced');

    if (activeAlgorithm === 'lab-kmeans' && userAdvanced.mmcq !== undefined) {
        invalidOpt(
            'advanced.mmcq',
            "advanced.mmcq is not allowed when algorithm is 'lab-kmeans'",
        );
    }
    if (
        (activeAlgorithm as string) === 'mmcq' &&
        userAdvanced.labKmeans !== undefined
    ) {
        invalidOpt(
            'advanced.labKmeans',
            "advanced.labKmeans is not allowed when algorithm is 'mmcq'",
        );
    }

    if (userAdvanced.labKmeans !== undefined) {
        assertPlainObject(userAdvanced.labKmeans, 'advanced.labKmeans');
        const g = ownUnknown(userAdvanced.labKmeans);
        checkValidGroupKeys(
            g,
            ADVANCED_NESTED_KEYS.labKmeans,
            'advanced.labKmeans',
        );
        resolved.advanced.labKmeans.iterations = resolveInteger(
            g.iterations,
            resolved.advanced.labKmeans.iterations,
            'advanced.labKmeans.iterations',
            1,
            100,
        );
        if (g.clusters !== undefined) {
            resolved.advanced.labKmeans.clusters = assertInteger(
                'advanced.labKmeans.clusters',
                g.clusters,
                1,
                64,
            );
            if (
                resolved.advanced.labKmeans.clusters < resolved.result.maxColors
            ) {
                invalidOpt(
                    'advanced.labKmeans.clusters',
                    `must be >= result.maxColors (${resolved.result.maxColors}), got ${String(g.clusters)}`,
                );
            }
        } else {
            resolved.advanced.labKmeans.clusters = deriveClusterDefault(
                resolved.result.maxColors,
            );
        }
    } else {
        resolved.advanced.labKmeans.clusters = deriveClusterDefault(
            resolved.result.maxColors,
        );
    }

    if (userAdvanced.mmcq !== undefined) {
        assertPlainObject(userAdvanced.mmcq, 'advanced.mmcq');
        const g = ownUnknown(userAdvanced.mmcq);
        checkValidGroupKeys(g, ADVANCED_NESTED_KEYS.mmcq, 'advanced.mmcq');
        if (g.boxes !== undefined) {
            resolved.advanced.mmcq.boxes = assertInteger(
                'advanced.mmcq.boxes',
                g.boxes,
                1,
                64,
            );
            if (resolved.advanced.mmcq.boxes < resolved.result.maxColors) {
                invalidOpt(
                    'advanced.mmcq.boxes',
                    `must be >= result.maxColors (${resolved.result.maxColors}), got ${String(g.boxes)}`,
                );
            }
        } else {
            resolved.advanced.mmcq.boxes = Math.max(
                8,
                resolved.result.maxColors,
            );
        }
    } else {
        resolved.advanced.mmcq.boxes = Math.max(8, resolved.result.maxColors);
    }

    if (userAdvanced.perceptualRanking !== undefined) {
        assertPlainObject(
            userAdvanced.perceptualRanking,
            'advanced.perceptualRanking',
        );
        const g = ownUnknown(userAdvanced.perceptualRanking);
        checkValidGroupKeys(
            g,
            ADVANCED_NESTED_KEYS.perceptualRanking,
            'advanced.perceptualRanking',
        );
        resolved.advanced.perceptualRanking.chromaFloor = resolveNumber(
            g.chromaFloor,
            resolved.advanced.perceptualRanking.chromaFloor,
            'advanced.perceptualRanking.chromaFloor',
            0,
            150,
        );
        resolved.advanced.perceptualRanking.lowChromaPenalty = resolveNumber(
            g.lowChromaPenalty,
            resolved.advanced.perceptualRanking.lowChromaPenalty,
            'advanced.perceptualRanking.lowChromaPenalty',
            0,
            1,
        );
    }
}

function checkRejectLegacyKeys(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
        if (LEGACY_KEYS.has(key)) {
            invalidOpt(
                key,
                `legacy option "${key}" is not supported by extractPalette(); use the neutral option group instead`,
            );
        }
    }
}

function resolveBrowserDecode(
    userDecode: Record<string, unknown> | undefined,
): ResolvedBrowserDecodeOptions {
    if (userDecode === undefined) return { ...BROWSER_DECODE_DEFAULTS };
    assertPlainObject(userDecode, 'decode');
    userDecode = ownUnknown(userDecode);
    checkValidGroupKeys(userDecode, new Set(['maxPixels']), 'decode');
    return {
        maxPixels: resolveInteger(
            userDecode.maxPixels,
            BROWSER_DECODE_DEFAULTS.maxPixels,
            'decode.maxPixels',
            1,
            100_000_000,
        ),
    };
}

function resolveNodeRemote(
    userRemote: Record<string, unknown> | undefined,
): ResolvedNodeRemoteOptions {
    if (userRemote === undefined)
        return {
            ...NODE_REMOTE_DEFAULTS,
            allowedProtocols: [...NODE_REMOTE_DEFAULTS.allowedProtocols],
        };
    assertPlainObject(userRemote, 'remote');
    userRemote = ownUnknown(userRemote);
    checkValidGroupKeys(
        userRemote,
        new Set([
            'timeoutMs',
            'maxBytes',
            'maxRedirects',
            'allowedProtocols',
            'allowPrivateNetworks',
            'validateContentType',
        ]),
        'remote',
    );
    return {
        timeoutMs: resolveInteger(
            userRemote.timeoutMs,
            NODE_REMOTE_DEFAULTS.timeoutMs,
            'remote.timeoutMs',
            1,
            300_000,
        ),
        maxBytes: resolveInteger(
            userRemote.maxBytes,
            NODE_REMOTE_DEFAULTS.maxBytes,
            'remote.maxBytes',
            1,
            1_000_000_000,
        ),
        maxRedirects: resolveInteger(
            userRemote.maxRedirects,
            NODE_REMOTE_DEFAULTS.maxRedirects,
            'remote.maxRedirects',
            0,
            20,
        ),
        allowedProtocols: resolveAllowedProtocols(
            userRemote.allowedProtocols,
            'remote.allowedProtocols',
        ),
        allowPrivateNetworks:
            userRemote.allowPrivateNetworks !== undefined
                ? resolveBoolean(
                      userRemote.allowPrivateNetworks,
                      NODE_REMOTE_DEFAULTS.allowPrivateNetworks,
                      'remote.allowPrivateNetworks',
                  )
                : NODE_REMOTE_DEFAULTS.allowPrivateNetworks,
        validateContentType:
            userRemote.validateContentType !== undefined
                ? resolveBoolean(
                      userRemote.validateContentType,
                      NODE_REMOTE_DEFAULTS.validateContentType,
                      'remote.validateContentType',
                  )
                : NODE_REMOTE_DEFAULTS.validateContentType,
    };
}

function resolveNodeDecode(
    userDecode: Record<string, unknown> | undefined,
): ResolvedNodeDecodeOptions {
    if (userDecode === undefined) return { ...NODE_DECODE_DEFAULTS };
    assertPlainObject(userDecode, 'decode');
    userDecode = ownUnknown(userDecode);
    checkValidGroupKeys(
        userDecode,
        new Set([
            'maxPixels',
            'animated',
            'svg',
            'respectOrientation',
            'normalizeColorProfile',
        ]),
        'decode',
    );
    return {
        maxPixels: resolveInteger(
            userDecode.maxPixels,
            NODE_DECODE_DEFAULTS.maxPixels,
            'decode.maxPixels',
            1,
            100_000_000,
        ),
        animated:
            userDecode.animated !== undefined
                ? resolveEnum(
                      userDecode.animated,
                      ['first-frame'] as const,
                      'decode.animated',
                  )
                : NODE_DECODE_DEFAULTS.animated,
        svg:
            userDecode.svg !== undefined
                ? resolveEnum(
                      userDecode.svg,
                      ['disabled', 'enabled'] as const,
                      'decode.svg',
                  )
                : NODE_DECODE_DEFAULTS.svg,
        respectOrientation:
            userDecode.respectOrientation !== undefined
                ? resolveBoolean(
                      userDecode.respectOrientation,
                      NODE_DECODE_DEFAULTS.respectOrientation,
                      'decode.respectOrientation',
                  )
                : NODE_DECODE_DEFAULTS.respectOrientation,
        normalizeColorProfile:
            userDecode.normalizeColorProfile !== undefined
                ? resolveBoolean(
                      userDecode.normalizeColorProfile,
                      NODE_DECODE_DEFAULTS.normalizeColorProfile,
                      'decode.normalizeColorProfile',
                  )
                : NODE_DECODE_DEFAULTS.normalizeColorProfile,
    };
}

const BROWSER_ALLOWED = new Set([...COMMON_GROUP_KEYS, 'decode']);
const NODE_ALLOWED = new Set([...COMMON_GROUP_KEYS, 'remote', 'decode']);
const CORE_ALLOWED = new Set(COMMON_GROUP_KEYS);

function pickRuntimeGroups(
    options: Record<string, unknown>,
    allowed: Set<string>,
    runtime: string,
): Record<string, unknown> {
    checkValidGroupKeys(options, allowed, 'options');
    const picked: Record<string, unknown> = Object.create(null);
    for (const key of COMMON_GROUP_KEYS) {
        if (Object.hasOwn(options, key)) picked[key] = options[key];
    }
    if (allowed.has('decode') && Object.hasOwn(options, 'decode')) {
        picked.decode = options.decode;
    }
    if (allowed.has('remote') && Object.hasOwn(options, 'remote')) {
        if (runtime === 'browser') {
            invalidOpt(
                'remote',
                'remote options are not supported in browser runtime',
            );
        }
        picked.remote = options.remote;
    }
    return picked;
}

export function resolveNeutralOptions(
    options: unknown,
    runtime: 'browser',
): ResolvedBrowserExtractPaletteOptions;

export function resolveNeutralOptions(
    options: unknown,
    runtime: 'node',
): ResolvedNodeExtractPaletteOptions;

export function resolveNeutralOptions(
    options: unknown,
    runtime: 'core',
): ResolvedCoreExtractPaletteOptions;

export function resolveNeutralOptions(
    options: unknown,
    runtime: 'browser' | 'node' | 'core',
): ResolvedBaseOptions & Record<string, unknown> {
    if (options !== undefined && !isPlainObject(options)) {
        invalidOpt('options', 'must be a plain object');
    }

    const obj = (options ?? {}) as Record<string, unknown>;

    checkRejectLegacyKeys(obj);

    const common: CommonDefaults = {
        algorithm: 'lab-kmeans',
        sampling: { ...COMMON_DEFAULTS.sampling },
        filtering: { ...COMMON_DEFAULTS.filtering },
        result: { ...COMMON_DEFAULTS.result },
        advanced: {
            labKmeans: { ...COMMON_DEFAULTS.advanced.labKmeans },
            mmcq: { ...COMMON_DEFAULTS.advanced.mmcq },
            perceptualRanking: {
                ...COMMON_DEFAULTS.advanced.perceptualRanking,
            },
        },
    };

    const signal = Object.hasOwn(obj, 'signal')
        ? checkSignal(obj.signal, 'signal')
        : undefined;
    assertNotAborted(signal);

    let runtimeAllowed: Set<string>;
    if (runtime === 'browser') {
        runtimeAllowed = BROWSER_ALLOWED;
    } else if (runtime === 'node') {
        runtimeAllowed = NODE_ALLOWED;
    } else {
        runtimeAllowed = CORE_ALLOWED;
    }

    const picked = pickRuntimeGroups(obj, runtimeAllowed, runtime);
    if (picked.algorithm !== undefined) {
        if (typeof picked.algorithm !== 'string') {
            invalidOpt(
                'algorithm',
                `must be a string, got ${typeof picked.algorithm}`,
            );
        }
        if (!isAlgorithmRegistered(picked.algorithm)) {
            invalidOpt(
                'algorithm',
                `must be a registered algorithm ('lab-kmeans'), got '${String(picked.algorithm)}'`,
            );
        }
        common.algorithm = picked.algorithm as ExtractionAlgorithm;
    }

    checkCommonGroupBounds(common, picked);
    checkAdvancedBounds(
        common,
        picked.advanced as Record<string, unknown> | undefined,
    );

    const base: ResolvedBaseOptions = {
        algorithm: common.algorithm,
        sampling: { ...common.sampling },
        filtering: { ...common.filtering },
        result: { ...common.result },
        advanced: {
            labKmeans: { ...common.advanced.labKmeans },
            mmcq: { ...common.advanced.mmcq },
            perceptualRanking: { ...common.advanced.perceptualRanking },
        },
    };

    if (runtime === 'browser') {
        return {
            ...base,
            decode: resolveBrowserDecode(
                picked.decode as Record<string, unknown> | undefined,
            ),
        };
    }

    if (runtime === 'node') {
        return {
            ...base,
            remote: resolveNodeRemote(
                picked.remote as Record<string, unknown> | undefined,
            ),
            decode: resolveNodeDecode(
                picked.decode as Record<string, unknown> | undefined,
            ),
        };
    }

    return base;
}
