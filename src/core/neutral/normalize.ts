import type {
    AlgorithmCandidateResult,
    ExtractionCandidate,
} from '../algorithms/contract.js';
import type { LabKmeansCandidateResult } from '../algorithms/lab-kmeans/types.js';
import { rgbToHex } from '../color/hex.js';
import { rgbToHsl } from '../color/hsl.js';
import { xyzToLab } from '../color/lab.js';
import { srgbByteToLinear } from '../color/srgb.js';
import { linearRgbToXyz } from '../color/xyz.js';
import { ColorExtractorError } from '../errors.js';
import type { ResolvedCoreExtractPaletteOptions } from '../neutral-options.js';
import type {
    ExtractedSwatch,
    ExtractionDecoder,
    ExtractionMetadata,
    ExtractionRuntime,
    ExtractPaletteResult,
    HslColor,
    LabColor,
    SwatchId,
} from '../palette-types.js';

export type NormalizePaletteInput = {
    candidateResult: AlgorithmCandidateResult | LabKmeansCandidateResult;
    validPixels: number;
    sampledWidth: number;
    sampledHeight: number;
    sampledPixels: number;
    runtime: ExtractionRuntime;
    decoder: ExtractionDecoder;
    packageVersion: string;
    algorithmVersion: string;
    options: ResolvedCoreExtractPaletteOptions;
    signal?: AbortSignal;
};

type MergedCandidate = {
    rgb: { r: number; g: number; b: number };
    lab: { L: number; a: number; b: number };
    population: number;
    sourceIndex: number;
};

type ScoredCandidate = MergedCandidate & {
    hex: string;
    id: SwatchId;
    chroma: number;
    proportion: number;
    rawScore: number;
    score: number;
    hsl?: HslColor;
};

function clamp(val: number, min: number, max: number): number {
    return val < min ? min : val > max ? max : val;
}

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'The operation was aborted.',
            { cause: signal.reason },
        );
    }
}

function validateInput(input: NormalizePaletteInput): void {
    const { candidateResult, validPixels, sampledPixels } = input;

    if (
        !Number.isFinite(validPixels) ||
        validPixels < 0 ||
        !Number.isInteger(validPixels)
    ) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            `validPixels must be a non-negative integer, got ${validPixels}`,
        );
    }
    if (validPixels === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            'validPixels is zero — no pixels to normalize.',
        );
    }
    if (
        !Number.isFinite(sampledPixels) ||
        sampledPixels < 0 ||
        !Number.isInteger(sampledPixels)
    ) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `sampledPixels must be a non-negative integer, got ${sampledPixels}`,
        );
    }
    if (validPixels > sampledPixels) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `validPixels (${validPixels}) exceeds sampledPixels (${sampledPixels})`,
        );
    }

    const { candidates } = candidateResult;
    if (candidates.length === 0) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_NO_VALID_PIXELS',
            'No positive-population candidates provided.',
        );
    }

    const seenIndices = new Set<number>();
    let totalPopulation = 0;
    for (const c of candidates) {
        if (
            !Number.isFinite(c.rgb.r) ||
            !Number.isFinite(c.rgb.g) ||
            !Number.isFinite(c.rgb.b)
        ) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                'Candidate RGB channel is not finite.',
            );
        }
        if (
            !Number.isFinite(c.lab.L) ||
            !Number.isFinite(c.lab.a) ||
            !Number.isFinite(c.lab.b)
        ) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                'Candidate Lab channel is not finite.',
            );
        }
        if (!Number.isInteger(c.population) || c.population <= 0) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                `Candidate population must be a positive integer, got ${c.population}`,
            );
        }
        if (!Number.isInteger(c.sourceIndex) || c.sourceIndex < 0) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                `Candidate sourceIndex must be a non-negative integer, got ${c.sourceIndex}`,
            );
        }
        if (seenIndices.has(c.sourceIndex)) {
            throw new ColorExtractorError(
                'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
                `Duplicate candidate sourceIndex ${c.sourceIndex}`,
            );
        }
        seenIndices.add(c.sourceIndex);
        totalPopulation += c.population;
    }

    if (totalPopulation !== validPixels) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `Candidate population sum (${totalPopulation}) does not match validPixels (${validPixels})`,
        );
    }
}

function canonicalizeRgb(
    r: number,
    g: number,
    b: number,
): { r: number; g: number; b: number } {
    return {
        r: clamp(Math.round(r), 0, 255),
        g: clamp(Math.round(g), 0, 255),
        b: clamp(Math.round(b), 0, 255),
    };
}

function hexFromRgb(r: number, g: number, b: number): string {
    return rgbToHex({ r, g, b });
}

function rgbToLab(r: number, g: number, b: number): LabColor {
    const lr = srgbByteToLinear(r);
    const lg = srgbByteToLinear(g);
    const lb = srgbByteToLinear(b);
    const { x, y, z } = linearRgbToXyz(lr, lg, lb);
    const lab = xyzToLab(x, y, z);
    return {
        L: lab.L,
        a: Math.abs(lab.a) < 1e-4 ? 0 : lab.a,
        b: Math.abs(lab.b) < 1e-4 ? 0 : lab.b,
    };
}

function swatchIdFromHex(hex: string): SwatchId {
    return `swatch-${hex.slice(1)}` as SwatchId;
}

function mergeByRgb(
    candidates: readonly (
        | ExtractionCandidate
        | LabKmeansCandidateResult['candidates'][number]
    )[],
): MergedCandidate[] {
    const groups = new Map<
        string,
        {
            sumL: number;
            suma: number;
            sumb: number;
            population: number;
            sourceIndex: number;
            rgb: { r: number; g: number; b: number };
        }
    >();

    for (const cand of candidates) {
        const rgb = canonicalizeRgb(cand.rgb.r, cand.rgb.g, cand.rgb.b);
        const key = `${rgb.r},${rgb.g},${rgb.b}`;
        const existing = groups.get(key);
        if (existing) {
            existing.sumL += cand.lab.L * cand.population;
            existing.suma += cand.lab.a * cand.population;
            existing.sumb += cand.lab.b * cand.population;
            existing.population += cand.population;
        } else {
            groups.set(key, {
                sumL: cand.lab.L * cand.population,
                suma: cand.lab.a * cand.population,
                sumb: cand.lab.b * cand.population,
                population: cand.population,
                sourceIndex: cand.sourceIndex,
                rgb,
            });
        }
    }

    const result: MergedCandidate[] = [];
    for (const entry of groups.values()) {
        const pop = entry.population;
        result.push({
            rgb: entry.rgb,
            lab: {
                L: entry.sumL / pop,
                a: entry.suma / pop,
                b: entry.sumb / pop,
            },
            population: pop,
            sourceIndex: entry.sourceIndex,
        });
    }

    return result;
}

function calculateRawScore(
    chroma: number,
    population: number,
    chromaFloor: number,
    lowChromaPenalty: number,
): number {
    let score = chroma * Math.log(population + 1);
    if (chroma < chromaFloor) {
        score *= lowChromaPenalty;
    }
    return score;
}

function comparePerceptual(a: ScoredCandidate, b: ScoredCandidate): number {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.population !== a.population) return b.population - a.population;
    if (b.chroma !== a.chroma) return b.chroma - a.chroma;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function comparePopulation(a: ScoredCandidate, b: ScoredCandidate): number {
    if (b.population !== a.population) return b.population - a.population;
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.chroma !== a.chroma) return b.chroma - a.chroma;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function compareChroma(a: ScoredCandidate, b: ScoredCandidate): number {
    if (b.chroma !== a.chroma) return b.chroma - a.chroma;
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.population !== a.population) return b.population - a.population;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

export function normalizePalette(
    input: NormalizePaletteInput,
): ExtractPaletteResult {
    checkAborted(input.signal);

    const { candidateResult, validPixels } = input;
    const preDedupCount = candidateResult.candidates.length;

    validateInput(input);

    checkAborted(input.signal);

    const merged = mergeByRgb(candidateResult.candidates);

    checkAborted(input.signal);

    const { maxColors, includeHsl } = input.options.result;
    const { chromaFloor, lowChromaPenalty } =
        input.options.advanced.perceptualRanking;

    const scored: ScoredCandidate[] = [];
    for (const m of merged) {
        const hex = hexFromRgb(m.rgb.r, m.rgb.g, m.rgb.b);
        const lab = rgbToLab(m.rgb.r, m.rgb.g, m.rgb.b);
        const chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
        const proportion = m.population / validPixels;
        const rawScore = calculateRawScore(
            chroma,
            m.population,
            chromaFloor,
            lowChromaPenalty,
        );

        scored.push({
            rgb: m.rgb,
            lab,
            population: m.population,
            sourceIndex: m.sourceIndex,
            hex,
            id: swatchIdFromHex(hex),
            chroma,
            proportion,
            rawScore,
            score: 0,
            ...(includeHsl ? { hsl: rgbToHsl(m.rgb.r, m.rgb.g, m.rgb.b) } : {}),
        });
    }

    const maxRawScore =
        scored.length > 0 ? Math.max(...scored.map((s) => s.rawScore)) : 0;

    for (const s of scored) {
        s.score = maxRawScore > 0 ? clamp(s.rawScore / maxRawScore, 0, 1) : 0;
    }

    const selected = scored
        .slice()
        .sort(comparePerceptual)
        .slice(0, Math.min(maxColors, scored.length));

    selected.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const swatches: ExtractedSwatch[] = selected.map((s) => {
        const swatch: ExtractedSwatch = {
            id: s.id,
            hex: s.hex,
            rgb: { r: s.rgb.r, g: s.rgb.g, b: s.rgb.b },
            lab: { L: s.lab.L, a: s.lab.a, b: s.lab.b },
            chroma: s.chroma,
            population: s.population,
            proportion: s.proportion,
            score: s.score,
        };
        if (includeHsl && s.hsl) {
            swatch.hsl = s.hsl;
        }
        return swatch;
    });

    const ids = swatches.map((s) => s.id);

    const perceptualRanking = [...ids].sort((a, b) => {
        const sa = selected.find((s) => s.id === a)!;
        const sb = selected.find((s) => s.id === b)!;
        return comparePerceptual(sa, sb);
    });

    const populationRanking = [...ids].sort((a, b) => {
        const sa = selected.find((s) => s.id === a)!;
        const sb = selected.find((s) => s.id === b)!;
        return comparePopulation(sa, sb);
    });

    const chromaRanking = [...ids].sort((a, b) => {
        const sa = selected.find((s) => s.id === a)!;
        const sb = selected.find((s) => s.id === b)!;
        return compareChroma(sa, sb);
    });

    const returnedPopulation = swatches.reduce(
        (sum, s) => sum + s.population,
        0,
    );
    const coverage =
        validPixels > 0 ? clamp(returnedPopulation / validPixels, 0, 1) : 0;

    const diagnostics: Record<string, unknown> =
        'diagnostics' in candidateResult
            ? (candidateResult.diagnostics as Record<string, unknown>)
            : {
                  requestedClusters: candidateResult.metadata.requestedClusters,
                  producedCandidates:
                      candidateResult.metadata.producedCandidates,
                  iterations: candidateResult.metadata.iterations,
              };

    const algorithm =
        'algorithm' in candidateResult
            ? candidateResult.algorithm
            : input.options.algorithm;

    const algorithmVersion =
        'algorithmVersion' in candidateResult
            ? candidateResult.algorithmVersion
            : input.algorithmVersion;

    const metadata: ExtractionMetadata = {
        algorithm,
        algorithmVersion,
        packageVersion: input.packageVersion,
        runtime: input.runtime,
        decoder: input.decoder,
        sampledWidth: input.sampledWidth,
        sampledHeight: input.sampledHeight,
        sampledPixels: input.sampledPixels,
        validPixels,
        candidateCount: preDedupCount,
        returnedColors: swatches.length,
        returnedPopulation,
        coverage,
        algorithmDetails: Object.freeze({ ...diagnostics }),
    };

    return {
        swatches,
        rankings: {
            perceptual: perceptualRanking,
            population: populationRanking,
            chroma: chromaRanking,
        },
        metadata,
    };
}
