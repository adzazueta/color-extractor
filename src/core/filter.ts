import { rgbToHsl } from './color/hsl.js';
import { ColorExtractorError } from './errors.js';
import type { NormalizedPixels, Pixel } from './pixels.js';

export interface FilterCriteria {
    readonly alphaThreshold: number;
    readonly minBrightness: number;
    readonly maxBrightness: number;
    readonly minSaturation: number;
}

function isByteValue(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 255;
}

function isSaturationValue(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function validateFilterCriteria(criteria: FilterCriteria): void {
    if (!isByteValue(criteria.alphaThreshold)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `alphaThreshold must be a finite number in [0, 255], got ${criteria.alphaThreshold}`,
            { cause: criteria.alphaThreshold },
        );
    }
    if (!isByteValue(criteria.minBrightness)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `minBrightness must be a finite number in [0, 255], got ${criteria.minBrightness}`,
            { cause: criteria.minBrightness },
        );
    }
    if (!isByteValue(criteria.maxBrightness)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `maxBrightness must be a finite number in [0, 255], got ${criteria.maxBrightness}`,
            { cause: criteria.maxBrightness },
        );
    }
    if (!isSaturationValue(criteria.minSaturation)) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `minSaturation must be a finite number in [0, 100], got ${criteria.minSaturation}`,
            { cause: criteria.minSaturation },
        );
    }
    if (criteria.minBrightness > criteria.maxBrightness) {
        throw new ColorExtractorError(
            'COLOR_EXTRACTOR_UNSUPPORTED_INPUT',
            `minBrightness (${criteria.minBrightness}) cannot exceed maxBrightness (${criteria.maxBrightness})`,
            {
                cause: {
                    minBrightness: criteria.minBrightness,
                    maxBrightness: criteria.maxBrightness,
                },
            },
        );
    }
}

function passesFilterUnvalidated(
    pixel: Pixel,
    criteria: FilterCriteria,
): boolean {
    if (pixel.a < criteria.alphaThreshold) return false;

    const maxChannel = Math.max(pixel.r, pixel.g, pixel.b);
    if (maxChannel < criteria.minBrightness) return false;
    if (maxChannel > criteria.maxBrightness) return false;

    const { s } = rgbToHsl(pixel.r, pixel.g, pixel.b);
    if (s * 100 < criteria.minSaturation) return false;

    return true;
}

export function passesFilter(pixel: Pixel, criteria: FilterCriteria): boolean {
    validateFilterCriteria(criteria);
    return passesFilterUnvalidated(pixel, criteria);
}

export function filterPixels(
    pixels: NormalizedPixels,
    criteria: FilterCriteria,
): Pixel[] {
    validateFilterCriteria(criteria);
    const result: Pixel[] = [];
    for (const pixel of pixels) {
        if (passesFilterUnvalidated(pixel, criteria)) {
            result.push(pixel);
        }
    }
    return result;
}
