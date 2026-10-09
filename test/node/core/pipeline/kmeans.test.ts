import { describe, expect, it } from "vite-plus/test";
import { srgbToOklabInto } from "@/core/color/oklab.js";
import { runKmeans, type KmeansResult } from "@/core/pipeline/kmeans.js";
import { mulberry32, toHex } from "../helpers.js";

/** A result in comparable form: centers and weights as exact bit patterns. */
interface Outcome {
  readonly labels: number[];
  readonly clusterCount: number;
  readonly iterations: number;
  readonly weights: string[];
  readonly centers: string[];
}

interface Case {
  readonly points: Float64Array;
  readonly weights: Float64Array;
  readonly labels: Uint8Array;
  readonly clusterCount: number;
  readonly maxIterations: number;
}

function outcome(result: KmeansResult): Outcome {
  return {
    labels: Array.from(result.labels),
    clusterCount: result.clusterCount,
    iterations: result.iterations,
    weights: Array.from(result.weights, (value) => toHex(value)),
    centers: Array.from(result.centers, (value) => toHex(value)),
  };
}

function run(input: Case): KmeansResult {
  return runKmeans(
    input.points,
    input.weights,
    input.labels,
    input.clusterCount,
    input.maxIterations,
  );
}

/**
 * Per cluster, in index order: Σ w, Σ w·L, Σ w·a, Σ w·b, adding points in index order. This is the
 * update of the design's pseudocode.
 */
function clusterSums(
  points: Float64Array,
  weights: Float64Array,
  labels: ArrayLike<number>,
  clusterCount: number,
): number[][] {
  const sums: number[][] = [];
  for (let k = 0; k < clusterCount; k++) {
    sums.push([0, 0, 0, 0]);
  }
  for (let i = 0; i < weights.length; i++) {
    const sum = sums[labels[i]!]!;
    const w = weights[i]!;
    sum[0] = sum[0]! + w;
    sum[1] = sum[1]! + w * points[3 * i]!;
    sum[2] = sum[2]! + w * points[3 * i + 1]!;
    sum[3] = sum[3]! + w * points[3 * i + 2]!;
  }
  return sums;
}

/** Bit patterns of the weighted means and weights of the given labels (all clusters non-empty). */
function weightedMeans(
  points: Float64Array,
  weights: Float64Array,
  labels: ArrayLike<number>,
  clusterCount: number,
): { centers: string[]; weights: string[] } {
  const centers: string[] = [];
  const totals: string[] = [];
  for (const [w, sumL, sumA, sumB] of clusterSums(points, weights, labels, clusterCount)) {
    centers.push(toHex(sumL! / w!), toHex(sumA! / w!), toHex(sumB! / w!));
    totals.push(toHex(w!));
  }
  return { centers, weights: totals };
}

/**
 * Straightforward weighted Lloyd following the design's pseudocode: the assignment scans every
 * center in index order and keeps the first strictly smaller distance.
 */
function referenceKmeans(input: Case): Outcome {
  const { points, weights, clusterCount, maxIterations } = input;
  const n = weights.length;
  const labels = Array.from(input.labels);
  const centers: number[][] = [];
  for (let k = 0; k < clusterCount; k++) {
    centers.push([0, 0, 0]);
  }
  let sums: number[][] = [];
  const update = (): void => {
    sums = clusterSums(points, weights, labels, clusterCount);
    for (let k = 0; k < clusterCount; k++) {
      const [w, sumL, sumA, sumB] = sums[k]!;
      if (w! > 0) {
        centers[k] = [sumL! / w!, sumA! / w!, sumB! / w!];
      }
    }
  };

  update();
  let iterations = 0;
  while (iterations < maxIterations) {
    iterations += 1;
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDistance = 0;
      for (let k = 0; k < clusterCount; k++) {
        const [cL, cA, cB] = centers[k]!;
        const dL = points[3 * i]! - cL!;
        const da = points[3 * i + 1]! - cA!;
        const db = points[3 * i + 2]! - cB!;
        const distance = dL * dL + da * da + db * db;
        if (k === 0 || distance < bestDistance) {
          best = k;
          bestDistance = distance;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
    update();
  }

  const remap: number[] = [];
  const outCenters: string[] = [];
  const outWeights: string[] = [];
  let survivors = 0;
  for (let k = 0; k < clusterCount; k++) {
    const w = sums[k]![0]!;
    if (w > 0) {
      remap[k] = survivors;
      survivors += 1;
      outCenters.push(...centers[k]!.map((value) => toHex(value)));
      outWeights.push(toHex(w));
    }
  }
  return {
    labels: labels.map((k) => remap[k]!),
    clusterCount: survivors,
    iterations,
    weights: outWeights,
    centers: outCenters,
  };
}

/** Labels where every value in [0, clusterCount) occurs, in a shuffled order. */
function randomLabels(next: () => number, n: number, clusterCount: number): Uint8Array {
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    labels[i] = i < clusterCount ? i : Math.floor(next() * clusterCount);
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const swap = labels[i]!;
    labels[i] = labels[j]!;
    labels[j] = swap;
  }
  return labels;
}

/** Labels by bands of L, like contiguous seeds: rank by (L, index), then rank · clusterCount / n. */
function bandLabels(points: Float64Array, n: number, clusterCount: number): Uint8Array {
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((x, y) => points[3 * x]! - points[3 * y]! || x - y);
  const labels = new Uint8Array(n);
  for (let rank = 0; rank < n; rank++) {
    labels[indices[rank]!] = Math.floor((rank * clusterCount) / n);
  }
  return labels;
}

/**
 * Small case from the design: n in [1, 60], clusterCount in [1, 12], maxIterations in [1, 8];
 * 70 % lattice coordinates (multiples of 1/8, with exact ties); weights in [1, 3] or [1, 1000].
 */
function smallCase(next: () => number): Case {
  const n = 1 + Math.floor(next() * 60);
  const clusterCount = 1 + Math.floor(next() * Math.min(12, n));
  const maxIterations = 1 + Math.floor(next() * 8);
  const lattice = next() < 0.7;
  const maxWeight = next() < 0.5 ? 3 : 1000;
  const points = new Float64Array(3 * n);
  const weights = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (lattice) {
      points[3 * i] = Math.floor(next() * 5) / 8;
      points[3 * i + 1] = (Math.floor(next() * 5) - 2) / 8;
      points[3 * i + 2] = (Math.floor(next() * 5) - 2) / 8;
    } else {
      points[3 * i] = next();
      points[3 * i + 1] = next() - 0.5;
      points[3 * i + 2] = next() - 0.5;
    }
    weights[i] = 1 + Math.floor(next() * maxWeight);
  }
  return {
    points,
    weights,
    labels: randomLabels(next, n, clusterCount),
    clusterCount,
    maxIterations,
  };
}

/**
 * Large case: hundreds to thousands of points, 2 to 64 clusters, and usually 50 steps at most.
 * Points are Oklab colors of random RGB, lattice points, or blobs; seeds are bands of L or random.
 */
function largeCase(seed: number): Case {
  const next = mulberry32(seed);
  const n = 200 + Math.floor(next() * 3800);
  const clusterCount = 2 + Math.floor(next() * 63);
  const kind = seed % 3;
  const points = new Float64Array(3 * n);
  const weights = new Float64Array(n);
  const blobs: number[][] = [];
  for (let b = 0; b < 12; b++) {
    blobs.push([next(), next() * 0.6 - 0.3, next() * 0.6 - 0.3]);
  }
  for (let i = 0; i < n; i++) {
    if (kind === 0) {
      const red = Math.floor(next() * 256);
      const green = Math.floor(next() * 256);
      const blue = Math.floor(next() * 256);
      srgbToOklabInto(red, green, blue, points, 3 * i);
    } else if (kind === 1) {
      points[3 * i] = Math.floor(next() * 17) / 16;
      points[3 * i + 1] = (Math.floor(next() * 17) - 8) / 32;
      points[3 * i + 2] = (Math.floor(next() * 17) - 8) / 32;
    } else {
      const [bL, bA, bB] = blobs[Math.floor(next() * blobs.length)]!;
      points[3 * i] = bL! + (next() - 0.5) * 0.1;
      points[3 * i + 1] = bA! + (next() - 0.5) * 0.1;
      points[3 * i + 2] = bB! + (next() - 0.5) * 0.1;
    }
    weights[i] = next() < 0.5 ? 1 + Math.floor(next() * 1000) : 255 * (1 + Math.floor(next() * 64));
  }
  const labels =
    next() < 0.5 ? bandLabels(points, n, clusterCount) : randomLabels(next, n, clusterCount);
  // One case in four has a low cap, from 1 to 8 steps.
  const maxIterations = seed % 4 === 0 ? 1 + Math.floor(next() * 8) : 50;
  return { points, weights, labels, clusterCount, maxIterations };
}

/** Points on the L axis (a = b = 0) with the given weights and labels. */
function onLAxis(
  lightness: number[],
  weights: number[],
  labels: number[],
  clusterCount: number,
  maxIterations = 50,
): Case {
  const points = new Float64Array(3 * lightness.length);
  lightness.forEach((value, i) => {
    points[3 * i] = value;
  });
  return {
    points,
    weights: Float64Array.from(weights),
    labels: Uint8Array.from(labels),
    clusterCount,
    maxIterations,
  };
}

describe("runKmeans", () => {
  it("equals the brute-force reference on 2,000 small seeded cases", () => {
    const next = mulberry32(2026);
    let compacted = 0;
    let capped = 0;
    for (let c = 0; c < 2000; c++) {
      const input = smallCase(next);
      const actual = outcome(run(input));
      expect(actual, `case ${c}`).toEqual(referenceKmeans(input));
      if (actual.clusterCount < input.clusterCount) {
        compacted += 1;
      }
      if (actual.iterations === input.maxIterations && input.maxIterations > 1) {
        capped += 1;
      }
    }
    // The sample exercises compaction and the iteration cap, not only easy cases.
    expect(compacted).toBeGreaterThan(100);
    expect(capped).toBeGreaterThan(100);
  });

  it("equals the brute-force reference on large seeded cases with up to 64 clusters", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const input = largeCase(seed);
      expect(outcome(run(input)), `seed ${seed}`).toEqual(referenceKmeans(input));
    }
  });

  it("converges on separable data", () => {
    // Three blobs on the L axis; the initial labels cut them at the wrong places.
    const lightness: number[] = [];
    const labels: number[] = [];
    for (let i = 0; i < 90; i++) {
      const blob = Math.floor(i / 30);
      lightness.push(0.2 + 0.3 * blob + ((i % 30) - 15) / 1000);
      labels.push(Math.min(2, Math.floor(i / 20)));
    }
    const input = onLAxis(
      lightness,
      Array.from({ length: 90 }, () => 1),
      labels,
      3,
    );
    const result = run(input);
    expect(Array.from(result.labels)).toEqual(lightness.map((_, i) => Math.floor(i / 30)));
    expect(result.clusterCount).toBe(3);
    expect(result.iterations).toBeGreaterThan(1);
    expect(result.iterations).toBeLessThan(50);
    expect(outcome(result)).toEqual(referenceKmeans(input));
  });

  it("returns iterations 1 and the same labels for an already converged input", () => {
    const input = onLAxis([0, 0.125, 1, 1.125], [1, 2, 3, 4], [0, 0, 1, 1], 2);
    const result = run(input);
    expect(result.iterations).toBe(1);
    expect(Array.from(result.labels)).toEqual([0, 0, 1, 1]);
    const means = weightedMeans(input.points, input.weights, result.labels, 2);
    expect(outcome(result)).toMatchObject(means);
  });

  it("stops at maxIterations with centers that match the returned labels", () => {
    // The boundary between the two clusters moves a few points per step.
    const lightness = Array.from({ length: 20 }, (_, i) => i);
    const labels = lightness.map((_, i) => (i === 0 ? 0 : 1));
    const weights = Array.from({ length: 20 }, () => 1);
    const uncapped = run(onLAxis(lightness, weights, labels, 2));
    expect(uncapped.iterations).toBeGreaterThan(3);

    const input = onLAxis(lightness, weights, labels, 2, 3);
    const result = run(input);
    expect(result.iterations).toBe(3);
    expect(Array.from(result.labels)).not.toEqual(Array.from(uncapped.labels));
    const means = weightedMeans(input.points, input.weights, result.labels, result.clusterCount);
    expect(outcome(result)).toMatchObject(means);
    expect(outcome(result)).toEqual(referenceKmeans(input));
  });

  it("drops a cluster that ends empty when ties send every point to cluster 0", () => {
    // Both centers start at L = 1, so every point ties and goes to the lowest index.
    const input = onLAxis([0, 1, 2], [1, 1, 1], [0, 1, 0], 2);
    const result = run(input);
    expect(result.clusterCount).toBe(1);
    expect(Array.from(result.labels)).toEqual([0, 0, 0]);
    expect(outcome(result)).toMatchObject({ centers: [toHex(1), toHex(0), toHex(0)] });
    expect(outcome(result)).toMatchObject({ weights: [toHex(3)] });
  });

  it("renumbers the surviving clusters in ascending order", () => {
    // Cluster 1 (center L = 1) loses its two points to clusters 0 and 2, and stays empty.
    const input = onLAxis([0, 0.25, 1.75, 2], [1, 1, 1, 1], [0, 1, 1, 2], 3);
    const result = run(input);
    expect(result.clusterCount).toBe(2);
    expect(Array.from(result.labels)).toEqual([0, 0, 1, 1]);
    expect(Array.from(result.centers)).toEqual([0.125, 0, 0, 1.875, 0, 0]);
    expect(Array.from(result.weights)).toEqual([2, 2]);
    expect(result.iterations).toBe(2);
  });

  it("keeps the previous center of an empty cluster, which can win points back", () => {
    // Step 1 empties cluster 1 (center L = 1). The heavy point at 0.125 then pulls center 0 away,
    // so in step 2 the points at 0.625 move to cluster 1, whose center is still at 1.
    const input = onLAxis([0.125, 0.625, 0.625, 1.875, 2], [10, 1, 1, 10, 1], [1, 0, 0, 1, 2], 3);
    const result = run(input);
    expect(result.iterations).toBe(3);
    expect(result.clusterCount).toBe(3);
    expect(Array.from(result.labels)).toEqual([0, 1, 1, 2, 2]);
    const means = weightedMeans(input.points, input.weights, result.labels, 3);
    expect(outcome(result)).toMatchObject(means);
    expect(outcome(result)).toEqual(referenceKmeans(input));
  });

  it("breaks nearest-center ties toward the lowest cluster index", () => {
    // The point at L = 1 is 1 away from both centers (0 and 2) and leaves cluster 1 for cluster 0.
    const lower = run(onLAxis([0, 1, 2, 3], [1, 1, 1, 1], [0, 1, 1, 1], 2));
    expect(Array.from(lower.labels)).toEqual([0, 0, 1, 1]);
    expect(lower.iterations).toBe(2);

    // The point at L = 2 is 1 away from both centers (1 and 3) and stays in cluster 0.
    const stay = run(onLAxis([0, 1, 2, 3], [1, 1, 1, 1], [0, 0, 0, 1], 2));
    expect(Array.from(stay.labels)).toEqual([0, 0, 0, 1]);
    expect(stay.iterations).toBe(1);

    // Centers with the same L, tied on a: (0.5, 0.25, 0) and (0.5, -0.25, 0). The point
    // (0.5, 0, 0) leaves cluster 1 for cluster 0.
    const points = Float64Array.from([0.5, 0.25, 0, 0.5, 0, 0, 0.5, -0.5, 0]);
    const weights = Float64Array.from([1, 1, 1]);
    const sameL = runKmeans(points, weights, Uint8Array.from([0, 1, 1]), 2, 50);
    expect(Array.from(sameL.labels)).toEqual([0, 0, 1]);
    expect(Array.from(sameL.centers)).toEqual([0.5, 0.125, 0, 0.5, -0.5, 0]);

    // A tie seen from cluster 0, which only appears after the b term (a 3-4-5 triangle): the point
    // (0.5, 0, 0) is 5/16 from center 0 (0.5, 5/16, 0) and from center 1 (0.5, 3/16, 4/16), and it
    // stays in cluster 0.
    const triangle = Float64Array.from([0.5, 0, 0, 0.5, 0.625, 0, 0.5, 0.1875, 0.25]);
    const keep = runKmeans(triangle, weights, Uint8Array.from([0, 0, 1]), 2, 50);
    expect(Array.from(keep.labels)).toEqual([0, 0, 1]);
    expect(Array.from(keep.centers)).toEqual([0.5, 0.3125, 0, 0.5, 0.1875, 0.25]);
    expect(keep.iterations).toBe(1);
  });

  it("pulls centers toward heavier points", () => {
    const single = run(onLAxis([0, 4], [3, 1], [0, 0], 1));
    expect(Array.from(single.centers)).toEqual([1, 0, 0]);
    expect(Array.from(single.weights)).toEqual([4]);

    // With equal weights, the point at 1.5 stays with the center at 2.75.
    const even = run(onLAxis([0, 1.5, 4], [1, 1, 1], [0, 1, 1], 2));
    expect(Array.from(even.labels)).toEqual([0, 1, 1]);
    expect(even.iterations).toBe(1);

    // A weight of 9 at L = 4 pulls center 1 to 3.75, so the point at 1.5 moves to cluster 0.
    const heavy = run(onLAxis([0, 1.5, 4], [1, 1, 9], [0, 1, 1], 2));
    expect(Array.from(heavy.labels)).toEqual([0, 0, 1]);
    expect(Array.from(heavy.centers)).toEqual([0.75, 0, 0, 4, 0, 0]);
    expect(Array.from(heavy.weights)).toEqual([2, 9]);
    expect(heavy.iterations).toBe(2);
  });

  it("handles a single point and a single cluster", () => {
    const points = Float64Array.from([0.3, 0.1, -0.2]);
    const result = runKmeans(points, Float64Array.from([7]), Uint8Array.from([0]), 1, 50);
    expect(Array.from(result.labels)).toEqual([0]);
    expect(result.clusterCount).toBe(1);
    expect(result.iterations).toBe(1);
    expect(outcome(result).centers).toEqual([
      toHex((7 * 0.3) / 7),
      toHex((7 * 0.1) / 7),
      toHex((7 * -0.2) / 7),
    ]);
    expect(Array.from(result.weights)).toEqual([7]);
  });

  it("is deterministic across two runs", () => {
    const input = largeCase(99);
    expect(outcome(run(input))).toEqual(outcome(run(input)));
  });

  it("does not mutate its inputs and returns fresh arrays", () => {
    const input = largeCase(7);
    const points = input.points.slice();
    const weights = input.weights.slice();
    const labels = input.labels.slice();
    const result = run(input);
    expect(input.points).toEqual(points);
    expect(input.weights).toEqual(weights);
    expect(input.labels).toEqual(labels);
    expect(result.labels).not.toBe(input.labels);
    expect(result.weights).not.toBe(input.weights);

    const converged = onLAxis([0, 1], [1, 1], [0, 1], 2);
    expect(run(converged).labels).not.toBe(converged.labels);
  });
});
