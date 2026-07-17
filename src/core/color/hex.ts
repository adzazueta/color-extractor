import type { RGB } from '../types.js';

function formatChannel(channel: number): string {
    if (!Number.isFinite(channel)) {
        throw new RangeError('RGB channels must be finite numbers');
    }

    const byte = Math.round(Math.min(255, Math.max(0, channel)));
    return byte.toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }: RGB): string {
    return `#${formatChannel(r)}${formatChannel(g)}${formatChannel(b)}`;
}
