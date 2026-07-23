import { xyzToLab } from '../../color/lab.js';
import { srgbByteToLinear } from '../../color/srgb.js';
import { linearRgbToXyz } from '../../color/xyz.js';
import { ColorExtractorError } from '../../errors.js';
import type { RgbColor } from '../../palette-types.js';
import type {
    AlgorithmCandidateResult,
    AlgorithmContext,
    ExtractionCandidate,
    ExtractionSampleSet,
    NeutralExtractionAlgorithm,
} from '../contract.js';
import type { MmcqBox, MmcqHistogram } from './types.js';

export const MMCQ_ALGORITHM_VERSION = 'mmcq-v1';

export type MmcqAlgorithmOptions = {
    boxes?: number;
};

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_ABORTED',
            'The operation was aborted.',
            { cause: signal.reason },
        );
    }
}

const HISTOGRAM_BITS = 5;
const SHIFT = 8 - HISTOGRAM_BITS; // 3

function buildHistogram(
    input: ExtractionSampleSet,
    signal?: AbortSignal,
): MmcqHistogram {
    const count = new Uint32Array(32768);
    const sumR = new Float64Array(32768);
    const sumG = new Float64Array(32768);
    const sumB = new Float64Array(32768);
    let occupiedBins = 0;

    checkAborted(signal);

    const samples = input.samples;
    for (let i = 0; i < samples.length; i++) {
        if (i % 4096 === 0) {
            checkAborted(signal);
        }
        const rgb = samples[i]!.rgb;
        const qr = rgb.r >> SHIFT;
        const qg = rgb.g >> SHIFT;
        const qb = rgb.b >> SHIFT;
        const index = (qr << 10) | (qg << 5) | qb;

        if (count[index] === 0) {
            occupiedBins++;
        }
        count[index]! += 1;
        sumR[index]! += rgb.r;
        sumG[index]! += rgb.g;
        sumB[index]! += rgb.b;
    }

    return {
        count,
        sumR,
        sumG,
        sumB,
        occupiedBins,
    };
}

function computeBoxStats(
    rMin: number,
    rMax: number,
    gMin: number,
    gMax: number,
    bMin: number,
    bMax: number,
    count: Uint32Array,
    creationIndex: number,
): MmcqBox | null {
    let realRMin = 32;
    let realRMax = -1;
    let realGMin = 32;
    let realGMax = -1;
    let realBMin = 32;
    let realBMax = -1;
    let population = 0;
    let occupiedBins = 0;

    for (let r = rMin; r <= rMax; r++) {
        const rOff = r << 10;
        for (let g = gMin; g <= gMax; g++) {
            const gOff = g << 5;
            for (let b = bMin; b <= bMax; b++) {
                const idx = rOff | gOff | b;
                const cnt = count[idx]!;
                if (cnt > 0) {
                    population += cnt;
                    occupiedBins++;
                    if (r < realRMin) realRMin = r;
                    if (r > realRMax) realRMax = r;
                    if (g < realGMin) realGMin = g;
                    if (g > realGMax) realGMax = g;
                    if (b < realBMin) realBMin = b;
                    if (b > realBMax) realBMax = b;
                }
            }
        }
    }

    if (occupiedBins === 0) return null;

    return {
        rMin: realRMin,
        rMax: realRMax,
        gMin: realGMin,
        gMax: realGMax,
        bMin: realBMin,
        bMax: realBMax,
        population,
        occupiedBins,
        volume:
            (realRMax - realRMin + 1) *
            (realGMax - realGMin + 1) *
            (realBMax - realBMin + 1),
        creationIndex,
    };
}

function isSplittable(box: MmcqBox): boolean {
    return (
        box.occupiedBins >= 2 &&
        (box.rMax > box.rMin || box.gMax > box.gMin || box.bMax > box.bMin)
    );
}

function compareBoxesForPriority(a: MmcqBox, b: MmcqBox): number {
    if (a.population !== b.population) return b.population - a.population;
    if (a.volume !== b.volume) return b.volume - a.volume;
    if (a.occupiedBins !== b.occupiedBins)
        return b.occupiedBins - a.occupiedBins;
    if (a.rMin !== b.rMin) return a.rMin - b.rMin;
    if (a.rMax !== b.rMax) return a.rMax - b.rMax;
    if (a.gMin !== b.gMin) return a.gMin - b.gMin;
    if (a.gMax !== b.gMax) return a.gMax - b.gMax;
    if (a.bMin !== b.bMin) return a.bMin - b.bMin;
    if (a.bMax !== b.bMax) return a.bMax - b.bMax;
    return a.creationIndex - b.creationIndex;
}

type Axis = 'R' | 'G' | 'B';

function chooseSplitAxis(box: MmcqBox): Axis {
    const rLen = box.rMax - box.rMin;
    const gLen = box.gMax - box.gMin;
    const bLen = box.bMax - box.bMin;
    const maxLen = Math.max(rLen, gLen, bLen);

    if (maxLen === rLen) return 'R';
    if (maxLen === gLen) return 'G';
    return 'B';
}

function getAxisOccupiedBinsAndPop(
    box: MmcqBox,
    axis: Axis,
    coord: number,
    count: Uint32Array,
): { pop: number; bins: number } {
    let pop = 0;
    let bins = 0;

    if (axis === 'R') {
        const rOff = coord << 10;
        for (let g = box.gMin; g <= box.gMax; g++) {
            const gOff = g << 5;
            for (let b = box.bMin; b <= box.bMax; b++) {
                const cnt = count[rOff | gOff | b]!;
                if (cnt > 0) {
                    pop += cnt;
                    bins++;
                }
            }
        }
    } else if (axis === 'G') {
        const gOff = coord << 5;
        for (let r = box.rMin; r <= box.rMax; r++) {
            const rOff = r << 10;
            for (let b = box.bMin; b <= box.bMax; b++) {
                const cnt = count[rOff | gOff | b]!;
                if (cnt > 0) {
                    pop += cnt;
                    bins++;
                }
            }
        }
    } else {
        const bVal = coord;
        for (let r = box.rMin; r <= box.rMax; r++) {
            const rOff = r << 10;
            for (let g = box.gMin; g <= box.gMax; g++) {
                const cnt = count[rOff | (g << 5) | bVal]!;
                if (cnt > 0) {
                    pop += cnt;
                    bins++;
                }
            }
        }
    }

    return { pop, bins };
}

function splitBox(
    box: MmcqBox,
    count: Uint32Array,
    nextCreationIndex: { value: number },
): [MmcqBox, MmcqBox] | null {
    const axis = chooseSplitAxis(box);
    const minCoord =
        axis === 'R' ? box.rMin : axis === 'G' ? box.gMin : box.bMin;
    const maxCoord =
        axis === 'R' ? box.rMax : axis === 'G' ? box.gMax : box.bMax;

    if (minCoord >= maxCoord) return null;

    const numCoords = maxCoord - minCoord + 1;
    const popAtCoord = new Uint32Array(numCoords);
    const binsAtCoord = new Uint32Array(numCoords);

    for (let c = minCoord; c <= maxCoord; c++) {
        const stats = getAxisOccupiedBinsAndPop(box, axis, c, count);
        popAtCoord[c - minCoord] = stats.pop;
        binsAtCoord[c - minCoord] = stats.bins;
    }

    const cumPop = new Float64Array(numCoords);
    let runningPop = 0;
    for (let i = 0; i < numCoords; i++) {
        runningPop += popAtCoord[i]!;
        cumPop[i] = runningPop;
    }

    const target = box.population / 2;
    let targetIdx = 0;
    for (let i = 0; i < numCoords; i++) {
        if (cumPop[i]! >= target) {
            targetIdx = i;
            break;
        }
    }

    const cumBins = new Uint32Array(numCoords);
    let runningBins = 0;
    for (let i = 0; i < numCoords; i++) {
        runningBins += binsAtCoord[i]!;
        cumBins[i] = runningBins;
    }
    const totalBins = box.occupiedBins;

    function isValidCut(idx: number): boolean {
        if (idx < 0 || idx >= numCoords - 1) return false;
        const lowerBins = cumBins[idx]!;
        const upperBins = totalBins - lowerBins;
        return lowerBins > 0 && upperBins > 0;
    }

    let chosenIdx = -1;
    const initialCutIdx = Math.min(targetIdx, numCoords - 2);

    if (isValidCut(initialCutIdx)) {
        chosenIdx = initialCutIdx;
    } else {
        let cLow = -1;
        for (let i = initialCutIdx - 1; i >= 0; i--) {
            if (isValidCut(i)) {
                cLow = i;
                break;
            }
        }
        let cHigh = -1;
        for (let i = initialCutIdx + 1; i <= numCoords - 2; i++) {
            if (isValidCut(i)) {
                cHigh = i;
                break;
            }
        }

        if (cLow !== -1 && cHigh !== -1) {
            const distLow = initialCutIdx - cLow;
            const distHigh = cHigh - initialCutIdx;
            if (distLow <= distHigh) {
                chosenIdx = cLow;
            } else {
                chosenIdx = cHigh;
            }
        } else if (cLow !== -1) {
            chosenIdx = cLow;
        } else if (cHigh !== -1) {
            chosenIdx = cHigh;
        }
    }

    if (chosenIdx === -1) return null;

    const cutCoord = minCoord + chosenIdx;

    let lowerBounds: [number, number, number, number, number, number];
    let upperBounds: [number, number, number, number, number, number];

    if (axis === 'R') {
        lowerBounds = [
            box.rMin,
            cutCoord,
            box.gMin,
            box.gMax,
            box.bMin,
            box.bMax,
        ];
        upperBounds = [
            cutCoord + 1,
            box.rMax,
            box.gMin,
            box.gMax,
            box.bMin,
            box.bMax,
        ];
    } else if (axis === 'G') {
        lowerBounds = [
            box.rMin,
            box.rMax,
            box.gMin,
            cutCoord,
            box.bMin,
            box.bMax,
        ];
        upperBounds = [
            box.rMin,
            box.rMax,
            cutCoord + 1,
            box.gMax,
            box.bMin,
            box.bMax,
        ];
    } else {
        lowerBounds = [
            box.rMin,
            box.rMax,
            box.gMin,
            box.gMax,
            box.bMin,
            cutCoord,
        ];
        upperBounds = [
            box.rMin,
            box.rMax,
            box.gMin,
            box.gMax,
            cutCoord + 1,
            box.bMax,
        ];
    }

    const lowerBox = computeBoxStats(
        ...lowerBounds,
        count,
        nextCreationIndex.value++,
    );
    const upperBox = computeBoxStats(
        ...upperBounds,
        count,
        nextCreationIndex.value++,
    );

    if (!lowerBox || !upperBox) return null;

    return [lowerBox, upperBox];
}

interface FinalCandidateBox {
    box: MmcqBox;
    rgb: RgbColor;
}

function compareFinalBoxes(a: FinalCandidateBox, b: FinalCandidateBox): number {
    const boxA = a.box;
    const boxB = b.box;
    if (boxA.population !== boxB.population)
        return boxB.population - boxA.population;
    if (boxA.volume !== boxB.volume) return boxB.volume - boxA.volume;

    if (a.rgb.r !== b.rgb.r) return a.rgb.r - b.rgb.r;
    if (a.rgb.g !== b.rgb.g) return a.rgb.g - b.rgb.g;
    if (a.rgb.b !== b.rgb.b) return a.rgb.b - b.rgb.b;

    if (boxA.rMin !== boxB.rMin) return boxA.rMin - boxB.rMin;
    if (boxA.rMax !== boxB.rMax) return boxA.rMax - boxB.rMax;
    if (boxA.gMin !== boxB.gMin) return boxA.gMin - boxB.gMin;
    if (boxA.gMax !== boxB.gMax) return boxA.gMax - boxB.gMax;
    if (boxA.bMin !== boxB.bMin) return boxA.bMin - boxB.bMin;
    if (boxA.bMax !== boxB.bMax) return boxA.bMax - boxB.bMax;

    return boxA.creationIndex - boxB.creationIndex;
}

export const mmcqAlgorithm: NeutralExtractionAlgorithm<MmcqAlgorithmOptions> = {
    id: 'mmcq',
    version: MMCQ_ALGORITHM_VERSION,
    run(
        input: ExtractionSampleSet,
        options: Readonly<MmcqAlgorithmOptions>,
        context: Readonly<AlgorithmContext>,
    ): AlgorithmCandidateResult {
        const signal = context.signal;
        checkAborted(signal);

        const targetBoxes = options.boxes ?? 8;

        if (targetBoxes <= 0 || input.samples.length === 0) {
            return {
                algorithm: 'mmcq',
                algorithmVersion: MMCQ_ALGORITHM_VERSION,
                candidates: [],
                diagnostics: {
                    requestedBoxes: targetBoxes,
                    producedCandidates: 0,
                    histogramBits: 5,
                    occupiedBins: 0,
                    splits: 0,
                },
            };
        }

        const histogram = buildHistogram(input, signal);

        if (histogram.occupiedBins === 0) {
            return {
                algorithm: 'mmcq',
                algorithmVersion: MMCQ_ALGORITHM_VERSION,
                candidates: [],
                diagnostics: {
                    requestedBoxes: targetBoxes,
                    producedCandidates: 0,
                    histogramBits: 5,
                    occupiedBins: 0,
                    splits: 0,
                },
            };
        }

        const initialBox = computeBoxStats(
            0,
            31,
            0,
            31,
            0,
            31,
            histogram.count,
            0,
        );

        if (!initialBox) {
            return {
                algorithm: 'mmcq',
                algorithmVersion: MMCQ_ALGORITHM_VERSION,
                candidates: [],
                diagnostics: {
                    requestedBoxes: targetBoxes,
                    producedCandidates: 0,
                    histogramBits: 5,
                    occupiedBins: histogram.occupiedBins,
                    splits: 0,
                },
            };
        }

        const boxes: MmcqBox[] = [initialBox];
        const nextCreationIndex = { value: 1 };
        let splits = 0;

        while (boxes.length < targetBoxes) {
            let bestIdx = -1;
            let bestBox: MmcqBox | null = null;

            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i]!;
                if (!isSplittable(box)) continue;
                if (
                    bestBox === null ||
                    compareBoxesForPriority(box, bestBox) < 0
                ) {
                    bestBox = box;
                    bestIdx = i;
                }
            }

            if (bestIdx === -1 || bestBox === null) {
                break;
            }

            checkAborted(signal);

            const splitResult = splitBox(
                bestBox,
                histogram.count,
                nextCreationIndex,
            );
            if (!splitResult) {
                bestBox.occupiedBins = 1;
                continue;
            }

            boxes.splice(bestIdx, 1, splitResult[0], splitResult[1]);
            splits++;
        }

        checkAborted(signal);

        const finalCandidateBoxes: FinalCandidateBox[] = [];

        for (const box of boxes) {
            let sumR = 0;
            let sumG = 0;
            let sumB = 0;

            for (let r = box.rMin; r <= box.rMax; r++) {
                const rOff = r << 10;
                for (let g = box.gMin; g <= box.gMax; g++) {
                    const gOff = g << 5;
                    for (let b = box.bMin; b <= box.bMax; b++) {
                        const idx = rOff | gOff | b;
                        if (histogram.count[idx]! > 0) {
                            sumR += histogram.sumR[idx]!;
                            sumG += histogram.sumG[idx]!;
                            sumB += histogram.sumB[idx]!;
                        }
                    }
                }
            }

            const pop = box.population;
            const r = Math.min(255, Math.max(0, Math.round(sumR / pop)));
            const g = Math.min(255, Math.max(0, Math.round(sumG / pop)));
            const b = Math.min(255, Math.max(0, Math.round(sumB / pop)));

            finalCandidateBoxes.push({
                box,
                rgb: { r, g, b },
            });
        }

        finalCandidateBoxes.sort(compareFinalBoxes);

        const candidates: ExtractionCandidate[] = finalCandidateBoxes.map(
            (c, sourceIndex) => {
                const rgb = c.rgb;
                const lr = srgbByteToLinear(rgb.r);
                const lg = srgbByteToLinear(rgb.g);
                const lb = srgbByteToLinear(rgb.b);
                const { x, y, z } = linearRgbToXyz(lr, lg, lb);
                const lab = xyzToLab(x, y, z);

                return {
                    rgb,
                    lab,
                    population: c.box.population,
                    sourceIndex,
                };
            },
        );

        checkAborted(signal);

        return {
            algorithm: 'mmcq',
            algorithmVersion: MMCQ_ALGORITHM_VERSION,
            candidates,
            diagnostics: {
                requestedBoxes: targetBoxes,
                producedCandidates: candidates.length,
                histogramBits: 5,
                occupiedBins: histogram.occupiedBins,
                splits,
            },
        };
    },
};
