import { ColorExtractorError } from '../errors.js';
import type {
    ExtractionAlgorithm,
    NeutralExtractionAlgorithm,
} from './contract.js';
import { labKmeansAlgorithm } from './lab-kmeans/algorithm.js';
import { mmcqAlgorithm } from './mmcq/algorithm.js';

const registry: Record<string, NeutralExtractionAlgorithm<unknown>> = {
    'lab-kmeans': labKmeansAlgorithm,
    mmcq: mmcqAlgorithm,
};

/**
 * Gets a registered extraction algorithm by ID.
 */
export function getAlgorithm(
    id: ExtractionAlgorithm,
): NeutralExtractionAlgorithm<unknown> {
    const algo = registry[id];
    if (!algo) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_INVALID_OPTIONS',
            `Unknown extraction algorithm: '${id}'`,
        );
    }
    return algo;
}

/**
 * Registers an extraction algorithm in the internal registry.
 */
export function registerAlgorithm(
    algo: NeutralExtractionAlgorithm<unknown>,
): void {
    registry[algo.id] = algo;
}

/**
 * Gets all registered extraction algorithms.
 */
export function getRegisteredAlgorithms(): readonly NeutralExtractionAlgorithm<unknown>[] {
    return Object.values(registry);
}

/**
 * Checks if an algorithm ID is registered.
 */
export function isAlgorithmRegistered(id: string): boolean {
    return Object.hasOwn(registry, id);
}
