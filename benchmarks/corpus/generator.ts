import { createHash } from 'node:crypto';
import type {
    BenchmarkCorpusManifest,
    BenchmarkFixtureData,
    BenchmarkFixtureManifest,
} from './manifest.js';

function computeChecksum(data: Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
}

export type FixtureGeneratorSpec = {
    id: string;
    category: string;
    width: number;
    height: number;
    notes: string;
    generate: (w: number, h: number) => Uint8Array;
};

export const FIXTURE_SPECS: readonly FixtureGeneratorSpec[] = [
    {
        id: 'synthetic-single',
        category: 'synthetic single color',
        width: 100,
        height: 100,
        notes: 'Solid blue image (40, 100, 200, 255)',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 40;
                data[i + 1] = 100;
                data[i + 2] = 200;
                data[i + 3] = 255;
            }
            return data;
        },
    },
    {
        id: 'synthetic-blocks',
        category: 'synthetic two/three-color blocks',
        width: 120,
        height: 120,
        notes: '3 equal horizontal color bands: red, green, blue',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            const bandHeight = Math.floor(h / 3);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    if (y < bandHeight) {
                        data[idx] = 200;
                        data[idx + 1] = 50;
                        data[idx + 2] = 50;
                    } else if (y < bandHeight * 2) {
                        data[idx] = 50;
                        data[idx + 1] = 180;
                        data[idx + 2] = 50;
                    } else {
                        data[idx] = 50;
                        data[idx + 1] = 50;
                        data[idx + 2] = 200;
                    }
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'muted-vivid',
        category: 'muted-majority plus vivid-minority',
        width: 150,
        height: 150,
        notes: 'Muted majority canvas with a vivid magenta accent square',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            const vividSize = Math.floor(w * 0.25);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const isVivid = x < vividSize && y < vividSize;
                    if (isVivid) {
                        data[idx] = 230;
                        data[idx + 1] = 20;
                        data[idx + 2] = 160;
                    } else {
                        data[idx] = 140;
                        data[idx + 1] = 120;
                        data[idx + 2] = 120;
                    }
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'near-gray',
        category: 'near-gray/low-chroma',
        width: 120,
        height: 120,
        notes: 'Low-chroma pastel tones with ~11% saturation',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const n = (x + y) % 3;
                    data[idx] = 145 + n * 3;
                    data[idx + 1] = 128 + n * 2;
                    data[idx + 2] = 128 - n * 2;
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'rgb-gradient',
        category: 'smooth RGB gradients',
        width: 150,
        height: 150,
        notes: 'Continuous diagonal RGB color gradient',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    data[idx] = Math.round((x / w) * 160 + 40);
                    data[idx + 1] = Math.round((y / h) * 160 + 40);
                    data[idx + 2] = Math.round(((x + y) / (w + h)) * 160 + 40);
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'photo-vibrant',
        category: 'high-diversity photographic scenes',
        width: 160,
        height: 160,
        notes: 'Multi-hue checkerboard grid mimicking rich photography',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            const colors = [
                [210, 40, 40],
                [40, 180, 50],
                [40, 80, 210],
                [220, 190, 30],
                [180, 50, 200],
                [30, 200, 200],
            ];
            const tileSize = 20;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const tileX = Math.floor(x / tileSize);
                    const tileY = Math.floor(y / tileSize);
                    const color = colors[
                        (tileX + tileY * 7) % colors.length
                    ] ?? [0, 0, 0];
                    data[idx] = color[0] ?? 0;
                    data[idx + 1] = color[1] ?? 0;
                    data[idx + 2] = color[2] ?? 0;
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'portrait-skin',
        category: 'skin/portrait-like scenes',
        width: 120,
        height: 120,
        notes: 'Warm skin tone gradients with dark hair background',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    if (y < h * 0.3) {
                        data[idx] = 60;
                        data[idx + 1] = 40;
                        data[idx + 2] = 30;
                    } else {
                        const t = (x + y) / (w + h);
                        data[idx] = Math.round(210 + t * 20);
                        data[idx + 1] = Math.round(150 + t * 15);
                        data[idx + 2] = Math.round(110 + t * 15);
                    }
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'nature-landscape',
        category: 'landscape/nature-like scenes',
        width: 150,
        height: 150,
        notes: 'Sky blue top, green foliage center, brown earth bottom',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    if (y < h * 0.4) {
                        data[idx] = 100;
                        data[idx + 1] = 170;
                        data[idx + 2] = 230;
                    } else if (y < h * 0.75) {
                        data[idx] = 45;
                        data[idx + 1] = 135;
                        data[idx + 2] = 55;
                    } else {
                        data[idx] = 120;
                        data[idx + 1] = 80;
                        data[idx + 2] = 45;
                    }
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'graphic-flat',
        category: 'logos/illustrations with flat colors',
        width: 100,
        height: 100,
        notes: 'Flat vector logo with 4 distinct quadrant colors',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            const midX = w / 2;
            const midY = h / 2;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    if (x < midX && y < midY) {
                        data[idx] = 230;
                        data[idx + 1] = 60;
                        data[idx + 2] = 60;
                    } else if (x >= midX && y < midY) {
                        data[idx] = 60;
                        data[idx + 1] = 200;
                        data[idx + 2] = 60;
                    } else if (x < midX && y >= midY) {
                        data[idx] = 60;
                        data[idx + 1] = 60;
                        data[idx + 2] = 230;
                    } else {
                        data[idx] = 230;
                        data[idx + 1] = 200;
                        data[idx + 2] = 40;
                    }
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'transparent-asset',
        category: 'transparent-background assets',
        width: 100,
        height: 100,
        notes: 'Centered colored circle surrounded by transparent pixels',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            const cx = w / 2;
            const cy = h / 2;
            const radius = w * 0.35;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const dist = Math.hypot(x - cx, y - cy);
                    if (dist <= radius) {
                        data[idx] = 180;
                        data[idx + 1] = 40;
                        data[idx + 2] = 220;
                        data[idx + 3] = 255;
                    } else {
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                        data[idx + 3] = 0;
                    }
                }
            }
            return data;
        },
    },
    {
        id: 'small-image',
        category: 'small images',
        width: 16,
        height: 16,
        notes: 'Small 16x16 icon image',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    data[idx] = 40 + x * 10;
                    data[idx + 1] = 40 + y * 10;
                    data[idx + 2] = 150;
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
    {
        id: 'max-sample-limit',
        category: 'images near configured sampling limit',
        width: 400,
        height: 400,
        notes: 'Large 400x400 image testing sampling grid step behavior',
        generate: (w, h) => {
            const data = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    data[idx] = Math.round((x / w) * 160 + 40);
                    data[idx + 1] = Math.round((y / h) * 160 + 40);
                    data[idx + 2] = 120;
                    data[idx + 3] = 255;
                }
            }
            return data;
        },
    },
];

export function generateCorpus(): readonly BenchmarkFixtureData[] {
    return FIXTURE_SPECS.map((spec) => {
        const rawPixels = spec.generate(spec.width, spec.height);
        const checksum = computeChecksum(rawPixels);
        const manifest: BenchmarkFixtureManifest = {
            id: spec.id,
            source: 'generated',
            license: 'CC0-1.0 (Programmatic Synthetic)',
            category: spec.category,
            width: spec.width,
            height: spec.height,
            checksum,
            notes: spec.notes,
        };
        return {
            manifest,
            pixels: {
                data: rawPixels,
                width: spec.width,
                height: spec.height,
                channels: 4 as const,
            },
        };
    });
}

export function generateManifest(
    fixtures: readonly BenchmarkFixtureData[],
): BenchmarkCorpusManifest {
    return {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        fixtures: fixtures.map((f) => f.manifest),
    };
}
