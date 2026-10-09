/** Result of merging nearly identical k-means clusters into groups. */
export interface MergeResult {
  /** Per input cluster: its group, in [0, groupCount). */
  readonly labels: Uint8Array;
  readonly groupCount: number;
  /** 3 per group: merged center. */
  readonly centers: Float64Array;
  /** Per group: sum of its clusters' weights (exact). */
  readonly weights: Float64Array;
}

/**
 * Merges the closest pair of clusters while its squared Oklab distance is below
 * `thresholdSquared`. The lower index survives, so groups are ordered by their
 * smallest member. Ties go to the smallest `i`, then the smallest `j`.
 *
 * Preconditions: `weights.length` is in [1, 254], `centers.length === 3 * weights.length`,
 * and every weight is greater than 0. Inputs are not mutated.
 */
export function mergeClusters(
  centers: Float64Array,
  weights: Float64Array,
  thresholdSquared: number,
): MergeResult {
  const count = weights.length;
  if (count < 1 || count > 254 || centers.length !== 3 * count) {
    throw new Error("mergeClusters: invalid input sizes");
  }
  const work = new Float64Array(centers);
  const mass = new Float64Array(weights);
  const active = new Uint8Array(count).fill(1);
  const owner = new Uint8Array(count);
  for (let k = 0; k < count; k++) owner[k] = k;

  for (;;) {
    let best = Infinity;
    let bestI = -1;
    let bestJ = -1;
    for (let i = 0; i < count; i++) {
      if (active[i] === 0) continue;
      const li = work[3 * i]!;
      const ai = work[3 * i + 1]!;
      const bi = work[3 * i + 2]!;
      for (let j = i + 1; j < count; j++) {
        if (active[j] === 0) continue;
        const dL = li - work[3 * j]!;
        const da = ai - work[3 * j + 1]!;
        const db = bi - work[3 * j + 2]!;
        const d = dL * dL + da * da + db * db;
        if (d < best) {
          best = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0 || !(best < thresholdSquared)) break;

    const wi = mass[bestI]!;
    const wj = mass[bestJ]!;
    const total = wi + wj;
    for (let x = 0; x < 3; x++) {
      work[3 * bestI + x] = (wi * work[3 * bestI + x]! + wj * work[3 * bestJ + x]!) / total;
    }
    mass[bestI] = total;
    active[bestJ] = 0;
    for (let k = 0; k < count; k++) {
      if (owner[k] === bestJ) owner[k] = bestI;
    }
  }

  const groupOf = new Uint8Array(count);
  let groupCount = 0;
  for (let k = 0; k < count; k++) {
    if (active[k] === 1) groupOf[k] = groupCount++;
  }
  const outCenters = new Float64Array(3 * groupCount);
  const outWeights = new Float64Array(groupCount);
  for (let k = 0; k < count; k++) {
    if (active[k] === 0) continue;
    const g = groupOf[k]!;
    outCenters[3 * g] = work[3 * k]!;
    outCenters[3 * g + 1] = work[3 * k + 1]!;
    outCenters[3 * g + 2] = work[3 * k + 2]!;
    outWeights[g] = mass[k]!;
  }
  const labels = new Uint8Array(count);
  for (let k = 0; k < count; k++) labels[k] = groupOf[owner[k]!]!;
  return { labels, groupCount, centers: outCenters, weights: outWeights };
}
