import type { OutputOptions } from './options.js';
import type { ExtractColorsResult, ExtractionMetadata } from './result.js';
import type { ExtractedColor } from './types.js';

export interface FullExtractionResult {
    readonly primary: ExtractedColor;
    readonly secondary: ExtractedColor | null;
    readonly accents: readonly ExtractedColor[];
    readonly palette: readonly ExtractedColor[];
    readonly metadata: ExtractionMetadata;
}

function shapeColor(
    color: ExtractedColor,
    options: OutputOptions | undefined,
): ExtractedColor {
    const includeHsl = options?.includeHsl ?? true;
    const includeLab = options?.includeLab ?? false;
    const includeScores = options?.includeScores ?? false;

    const shaped: { -readonly [K in keyof ExtractedColor]: ExtractedColor[K] } =
        {
            hex: color.hex,
            rgb: color.rgb,
        };

    if (includeHsl && color.hsl) {
        shaped.hsl = color.hsl;
    }
    if (includeLab && color.lab) {
        shaped.lab = color.lab;
    }
    if (includeScores) {
        shaped.chroma = color.chroma;
        shaped.population = color.population;
        shaped.proportion = color.proportion;
        shaped.score = color.score;
    }
    if (color.role) {
        shaped.role = color.role;
    }
    if (color.source) {
        shaped.source = color.source;
    }

    return shaped;
}

export function applyOutputFlags(
    result: FullExtractionResult,
    options: OutputOptions | undefined,
): ExtractColorsResult {
    const shape = (c: ExtractedColor): ExtractedColor => shapeColor(c, options);

    return {
        primary: shape(result.primary),
        secondary: result.secondary ? shape(result.secondary) : null,
        ...(options?.includeAccents && { accents: result.accents.map(shape) }),
        ...(options?.includePalette && { palette: result.palette.map(shape) }),
        ...(options?.includeMetadata && { metadata: result.metadata }),
    };
}
