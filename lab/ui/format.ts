/** (100 * ratio).toFixed(1) + "%" */
export function formatPercent(ratio: number): string {
  return `${(100 * ratio).toFixed(1)}%`;
}

export function formatDistance(distance: number): string {
  return distance.toFixed(3);
}

export function formatScore(score: number): string {
  return score.toFixed(3);
}

export function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toFixed(0)} ms`;
}

/** Letter of an acceptable color: A, B, C... (at most 8 colors). */
export function colorLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Label of a sample: color letter and sample number, for example "A1" or "B3". */
export function sampleLabel(color: number, sample: number): string {
  return `${colorLetter(color)}${sample + 1}`;
}

/**
 * The hex readout of the magnifier. The canvas premultiplies alpha, so below 255 the value is only
 * approximate and the readout says so.
 */
export function formatCanvasReadout(hex: string, alpha: number): string {
  return alpha >= 255 ? hex : `≈ ${hex} · alpha ${alpha}`;
}

export function formatThreshold(threshold: number): string {
  return threshold.toFixed(3);
}
