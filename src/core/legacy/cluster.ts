import type { HSL, Lab, RGB } from '../types.js';

export interface Cluster {
    readonly index: number;
    readonly lab: Lab;
    readonly rgb: RGB;
    readonly hsl: HSL;
    readonly population: number;
    readonly proportion: number;
    readonly chroma: number;
    readonly score: number;
}
