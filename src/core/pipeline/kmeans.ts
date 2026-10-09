// Weighted Lloyd k-means in Oklab. It refines the clusters proposed by Wu's method without any
// randomness: center sums accumulate in point index order, nearest-center ties go to the lowest
// cluster index, and the loop stops at a fixed criterion.

export interface KmeansResult {
  /** Per point: final cluster, in [0, clusterCount). */
  readonly labels: Uint8Array;
  /** Non-empty clusters after compaction (≤ the input clusterCount). */
  readonly clusterCount: number;
  /** 3 per cluster: weighted mean (L, a, b) of its points, consistent with `labels`. */
  readonly centers: Float64Array;
  /** Per cluster: sum of its points' weights (> 0, exact integer). */
  readonly weights: Float64Array;
  /** Assignment steps performed, in [1, maxIterations]. */
  readonly iterations: number;
}

/**
 * Refines initial clusters with weighted Lloyd k-means in Oklab.
 *
 * 1. Seeding (the first update): each center becomes the weighted mean of its initial points.
 * 2. Each step assigns every point to the nearest center by squared distance
 *    `dL * dL + da * da + db * db` (point minus center). Every cluster takes part, including
 *    empty ones, which keep the center they last had. Ties go to the lowest cluster index.
 * 3. The loop stops after a step that changes no label, or after `maxIterations` steps. After a
 *    step that changes a label, the centers are recomputed, so they always match the labels.
 * 4. Empty clusters are dropped, and the others are renumbered in ascending order.
 *
 * The assignment visits centers sorted by L and prunes with exact bounds; the result equals the
 * brute-force scan over every center bit for bit.
 *
 * Preconditions (not validated):
 * - n = `weights.length` ≥ 1, `points.length === 3n` (L, a, b per point), and
 *   `initialLabels.length === n`.
 * - `clusterCount` is an integer in [1, 254], and every value in [0, clusterCount) occurs in
 *   `initialLabels`.
 * - Points are finite, weights are finite and > 0, and `maxIterations` is an integer ≥ 1.
 *
 * @param points - 3 per point at 3i..3i+2: Oklab L, a, b.
 * @param weights - Per point: its weight.
 * @param initialLabels - Per point: its initial cluster.
 * @param clusterCount - Number of initial clusters.
 * @param maxIterations - Maximum number of assignment steps.
 */
export function runKmeans(
  points: Float64Array,
  weights: Float64Array,
  initialLabels: Uint8Array,
  clusterCount: number,
  maxIterations: number,
): KmeansResult {
  const labels = initialLabels.slice();
  const centers = new Float64Array(3 * clusterCount);
  const sums = new Float64Array(4 * clusterCount);
  const order = new Uint8Array(clusterCount);
  for (let k = 0; k < clusterCount; k++) {
    order[k] = k;
  }
  const rankOf = new Uint8Array(clusterCount);
  const sorted = new Float64Array(3 * clusterCount);

  updateCenters(points, weights, labels, sums, centers);
  let iterations = 0;
  while (iterations < maxIterations) {
    iterations += 1;
    sortCenters(centers, order, rankOf, sorted);
    if (!assignNearest(points, labels, order, rankOf, sorted)) {
      break;
    }
    updateCenters(points, weights, labels, sums, centers);
  }
  return compact(labels, sums, centers, iterations);
}

/**
 * Recomputes `sums` (4 per cluster: Σ w, Σ w·L, Σ w·a, Σ w·b), adding points in index order, and
 * sets the center of every non-empty cluster to its weighted mean. An empty cluster keeps its
 * previous center.
 */
function updateCenters(
  points: Float64Array,
  weights: Float64Array,
  labels: Uint8Array,
  sums: Float64Array,
  centers: Float64Array,
): void {
  sums.fill(0);
  const n = labels.length;
  for (let i = 0; i < n; i++) {
    const s = 4 * labels[i]!;
    const p = 3 * i;
    const w = weights[i]!;
    sums[s] = sums[s]! + w;
    sums[s + 1] = sums[s + 1]! + w * points[p]!;
    sums[s + 2] = sums[s + 2]! + w * points[p + 1]!;
    sums[s + 3] = sums[s + 3]! + w * points[p + 2]!;
  }
  const count = centers.length / 3;
  for (let k = 0; k < count; k++) {
    const s = 4 * k;
    const w = sums[s]!;
    if (w > 0) {
      centers[3 * k] = sums[s + 1]! / w;
      centers[3 * k + 1] = sums[s + 2]! / w;
      centers[3 * k + 2] = sums[s + 3]! / w;
    }
  }
}

/**
 * Sorts the clusters by center L, then by index, into `order` (cluster at each sorted position),
 * `rankOf` (sorted position of each cluster), and `sorted` (3 per position: the center).
 *
 * Insertion sort starting from the previous order: centers move little between steps, so it is
 * nearly linear. The order is total, so the result does not depend on the starting order.
 */
function sortCenters(
  centers: Float64Array,
  order: Uint8Array,
  rankOf: Uint8Array,
  sorted: Float64Array,
): void {
  const count = order.length;
  for (let s = 1; s < count; s++) {
    const k = order[s]!;
    const lightness = centers[3 * k]!;
    let t = s;
    while (t > 0) {
      const previous = order[t - 1]!;
      const previousLightness = centers[3 * previous]!;
      if (previousLightness < lightness || (previousLightness === lightness && previous < k)) {
        break;
      }
      order[t] = previous;
      t -= 1;
    }
    order[t] = k;
  }
  for (let s = 0; s < count; s++) {
    const k = order[s]!;
    rankOf[k] = s;
    sorted[3 * s] = centers[3 * k]!;
    sorted[3 * s + 1] = centers[3 * k + 1]!;
    sorted[3 * s + 2] = centers[3 * k + 2]!;
  }
}

/**
 * Assignment step: moves every point to the lexicographic minimum of (squared distance, cluster
 * index) over all centers. Returns whether any label changed.
 *
 * Exact speed-up. The search starts at the point's current cluster and scans the centers sorted
 * by L, upward and then downward. Every operation involved is monotone in IEEE arithmetic
 * (subtraction, squaring of |x|, and addition of non-negative terms), so:
 * - A partial sum never exceeds the full distance. A candidate is abandoned once its partial sum
 *   rules it out: `> best` for a lower index (which wins ties), `≥ best` for a higher one.
 * - A direction stops when `dL * dL > best`. That can only happen after the scan has passed the
 *   point's L: before that, the current best (the start or a center visited earlier) is at least
 *   as far in L as the visited center. After it, |dL| never shrinks, so every remaining center in
 *   that direction is strictly farther than the best.
 * The accepted candidate is the lexicographic minimum, which does not depend on the visiting
 * order. The result therefore equals the brute-force scan with ties to the lowest index.
 */
function assignNearest(
  points: Float64Array,
  labels: Uint8Array,
  order: Uint8Array,
  rankOf: Uint8Array,
  sorted: Float64Array,
): boolean {
  const n = labels.length;
  const count = order.length;
  let changed = false;
  for (let i = 0; i < n; i++) {
    const p = 3 * i;
    const pointL = points[p]!;
    const pointA = points[p + 1]!;
    const pointB = points[p + 2]!;
    const current = labels[i]!;
    const start = rankOf[current]!;
    const c = 3 * start;
    const startL = pointL - sorted[c]!;
    const startA = pointA - sorted[c + 1]!;
    const startB = pointB - sorted[c + 2]!;
    let best = current;
    let bestDistance = startL * startL + startA * startA + startB * startB;

    // Upward in L (step 1, until position count), then downward (step -1, until position -1).
    for (let step = 1; step >= -1; step -= 2) {
      const end = step === 1 ? count : -1;
      for (let s = start + step; s !== end; s += step) {
        const o = 3 * s;
        const dL = pointL - sorted[o]!;
        let distance = dL * dL;
        if (distance > bestDistance) {
          break;
        }
        const k = order[s]!;
        if (k < best) {
          const da = pointA - sorted[o + 1]!;
          distance += da * da;
          if (distance > bestDistance) {
            continue;
          }
          const db = pointB - sorted[o + 2]!;
          distance += db * db;
          if (distance <= bestDistance) {
            best = k;
            bestDistance = distance;
          }
        } else {
          if (distance >= bestDistance) {
            continue;
          }
          const da = pointA - sorted[o + 1]!;
          distance += da * da;
          if (distance >= bestDistance) {
            continue;
          }
          const db = pointB - sorted[o + 2]!;
          distance += db * db;
          if (distance < bestDistance) {
            best = k;
            bestDistance = distance;
          }
        }
      }
    }

    if (best !== current) {
      labels[i] = best;
      changed = true;
    }
  }
  return changed;
}

/**
 * Drops the clusters with zero weight and renumbers the others in ascending order. It only
 * reindexes: centers and weights are copied as they are.
 */
function compact(
  labels: Uint8Array,
  sums: Float64Array,
  centers: Float64Array,
  iterations: number,
): KmeansResult {
  const count = centers.length / 3;
  const remap = new Uint8Array(count);
  let survivors = 0;
  for (let k = 0; k < count; k++) {
    if (sums[4 * k]! > 0) {
      remap[k] = survivors;
      survivors += 1;
    }
  }
  const outCenters = new Float64Array(3 * survivors);
  const outWeights = new Float64Array(survivors);
  for (let k = 0; k < count; k++) {
    const w = sums[4 * k]!;
    if (w > 0) {
      const j = remap[k]!;
      outCenters[3 * j] = centers[3 * k]!;
      outCenters[3 * j + 1] = centers[3 * k + 1]!;
      outCenters[3 * j + 2] = centers[3 * k + 2]!;
      outWeights[j] = w;
    }
  }
  if (survivors < count) {
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      labels[i] = remap[labels[i]!]!;
    }
  }
  return {
    labels,
    clusterCount: survivors,
    centers: outCenters,
    weights: outWeights,
    iterations,
  };
}
