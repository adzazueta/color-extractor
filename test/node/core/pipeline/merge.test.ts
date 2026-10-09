import { describe, expect, it } from "vite-plus/test";

import { mergeClusters } from "@/core/pipeline/merge.js";

const THRESHOLD = 0.0009;

/** Centers on the L axis only (a = b = 0), so d² = dL². */
function onL(values: number[]): Float64Array {
  const out = new Float64Array(values.length * 3);
  values.forEach((v, i) => {
    out[3 * i] = v;
  });
  return out;
}

function ws(values: number[]): Float64Array {
  return Float64Array.from(values);
}

describe("mergeClusters", () => {
  it("does not merge when no pair is below the threshold", () => {
    const centers = Float64Array.from([0.1, 0.2, 0.3, 0.5, -0.1, 0.2, 0.9, 0.1, -0.3]);
    const weights = ws([5, 6, 7]);
    const r = mergeClusters(centers, weights, THRESHOLD);
    expect(r.groupCount).toBe(3);
    expect(Array.from(r.labels)).toEqual([0, 1, 2]);
    expect(Array.from(r.centers)).toEqual(Array.from(centers));
    expect(Array.from(r.weights)).toEqual([5, 6, 7]);
    expect(r.centers).not.toBe(centers);
    expect(r.weights).not.toBe(weights);
  });

  it("is strict: a squared distance equal to the threshold does not merge", () => {
    const r = mergeClusters(onL([0, 0.5]), ws([1, 1]), 0.25);
    expect(r.groupCount).toBe(2);
    expect(Array.from(r.labels)).toEqual([0, 1]);
  });

  it("merges a pair just below the threshold and not one just above", () => {
    const below = mergeClusters(onL([0, 0.5]), ws([1, 1]), 0.2500001);
    expect(below.groupCount).toBe(1);
    expect(Array.from(below.labels)).toEqual([0, 0]);
    const above = mergeClusters(onL([0, 0.5]), ws([1, 1]), 0.2499999);
    expect(above.groupCount).toBe(2);
  });

  it("uses the full Oklab distance, not only lightness", () => {
    const centers = Float64Array.from([0.5, 0, 0, 0.5, 0.02, 0.02]);
    // d² = 0.0004 + 0.0004 = 0.0008 < 0.0009
    expect(mergeClusters(centers, ws([1, 1]), THRESHOLD).groupCount).toBe(1);
    expect(mergeClusters(centers, ws([1, 1]), 0.0008).groupCount).toBe(2);
  });

  it("merges the closest pair first in a chain A-B, B-C", () => {
    // d²(A,B) = 0.0004 (dL 0.02), d²(B,C) = 0.0005 (dL ~0.0223607)
    const a = 0.3;
    const b = a + 0.02;
    const c = b + Math.sqrt(0.0005);
    const wA = 3;
    const wB = 5;
    const wC = 7;
    const r = mergeClusters(onL([a, b, c]), ws([wA, wB, wC]), THRESHOLD);
    const ab = (wA * a + wB * b) / (wA + wB);
    const dL = ab - c;
    const abMergesWithC = dL * dL < THRESHOLD;
    expect(abMergesWithC).toBe(true);
    expect(r.groupCount).toBe(1);
    const abc = ((wA + wB) * ab + wC * c) / (wA + wB + wC);
    expect(r.centers[0]).toBe(abc);
    expect(r.weights[0]).toBe(15);
  });

  it("stops the chain when the merged center is no longer close enough", () => {
    // A-B merge first; the merged center moves away from C by more than the threshold.
    const a = 0;
    const b = 0.028; // d² 0.000784 < 0.0009
    const c = 0.06; // d²(B,C) = 0.001024 > threshold
    const r = mergeClusters(onL([a, b, c]), ws([1, 1, 1]), THRESHOLD);
    expect(r.groupCount).toBe(2);
    expect(Array.from(r.labels)).toEqual([0, 0, 1]);
    expect(r.centers[0]).toBe((1 * a + 1 * b) / 2);
    expect(r.centers[3]).toBe(c);
  });

  it("picks the closest pair even when a farther pair has a smaller index", () => {
    // (0,1): 0.025² = 0.000625; (1,2): 0.01² = 0.0001 merges first.
    const r = mergeClusters(onL([0, 0.025, 0.035]), ws([1, 1, 1]), THRESHOLD);
    // After (1,2): center 0.03 vs 0 -> 0.0009 which is not below the threshold.
    expect(r.groupCount).toBe(2);
    expect(Array.from(r.labels)).toEqual([0, 1, 1]);
  });

  it("breaks ties by smallest i: (0,1) before (2,3)", () => {
    const r = mergeClusters(onL([0, 0.01, 1, 1.01]), ws([1, 1, 1, 1]), THRESHOLD);
    expect(r.groupCount).toBe(2);
    expect(Array.from(r.labels)).toEqual([0, 0, 1, 1]);
  });

  it("breaks ties by smallest i then smallest j: (0,2) before (1,2)", () => {
    // Cluster 2 sits at 0.01 from 0; cluster 1 is placed so that d²(1,2) equals d²(0,2) exactly.
    const centers = Float64Array.from([0, 0, 0, 0.02, 0, 0, 0.01, 0, 0]);
    // d²(0,1) = 0.0004; d²(0,2) = d²(1,2) = 0.0001 exactly equal.
    const r = mergeClusters(centers, ws([1, 2, 4]), THRESHOLD);
    // (0,2) merges first; the merged center then absorbs cluster 1 (survivor 0).
    const first = (4 * 0.01) / 5;
    const final = (5 * first + 2 * 0.02) / 7;
    expect(r.groupCount).toBe(1);
    expect(r.centers[0]).toBe(final);
    expect(r.weights[0]).toBe(7);
  });

  it("breaks ties between equal distances with the lower j", () => {
    // d²(0,1) == d²(0,2) == 0.0001 exactly; (0,1) wins, so 2 joins later with a weighted center.
    const centers = Float64Array.from([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]);
    const r = mergeClusters(centers, ws([1, 1, 1]), 0.00011);
    expect(Array.from(r.labels)).toEqual([0, 0, 1]);
    expect(r.groupCount).toBe(2);
    expect(r.centers[0]).toBe(0.005);
  });

  it("keeps the lower index as survivor and numbers groups by smallest member", () => {
    const r = mergeClusters(onL([0, 0.4, 0.8, 0.41]), ws([1, 1, 1, 1]), THRESHOLD);
    expect(r.groupCount).toBe(3);
    expect(Array.from(r.labels)).toEqual([0, 1, 2, 1]);
    expect(r.centers[3]).toBe((1 * 0.4 + 1 * 0.41) / 2);
    expect(r.centers[6]).toBe(0.8);
  });

  it("computes weighted-mean centers on all three coordinates and exact weight sums", () => {
    const centers = Float64Array.from([0.5, 0.1, -0.1, 0.51, 0.11, -0.09]);
    const r = mergeClusters(centers, ws([3, 1]), THRESHOLD);
    expect(r.groupCount).toBe(1);
    expect(r.centers[0]).toBe((3 * 0.5 + 1 * 0.51) / 4);
    expect(r.centers[1]).toBe((3 * 0.1 + 1 * 0.11) / 4);
    expect(r.centers[2]).toBe((3 * -0.1 + 1 * -0.09) / 4);
    expect(r.weights[0]).toBe(4);
    const big = mergeClusters(onL([0, 0.001]), ws([2 ** 40 + 1, 2 ** 40 + 3]), THRESHOLD);
    expect(big.weights[0]).toBe(2 ** 41 + 4);
  });

  it("passes a single cluster through unchanged, in fresh arrays", () => {
    const centers = Float64Array.from([0.4, 0.05, -0.02]);
    const weights = ws([9]);
    const r = mergeClusters(centers, weights, THRESHOLD);
    expect(r.groupCount).toBe(1);
    expect(Array.from(r.labels)).toEqual([0]);
    expect(Array.from(r.centers)).toEqual([0.4, 0.05, -0.02]);
    expect(Array.from(r.weights)).toEqual([9]);
    expect(r.centers).not.toBe(centers);
    expect(r.weights).not.toBe(weights);
  });

  it("rejects an empty input", () => {
    expect(() => mergeClusters(new Float64Array(0), new Float64Array(0), THRESHOLD)).toThrow(Error);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const values: number[] = [];
    for (let i = 0; i < 40; i++) values.push(((i * 37) % 101) / 101);
    const centers = new Float64Array(120);
    for (let i = 0; i < 120; i++) centers[i] = ((i * 53) % 97) / 400;
    const weights = ws(values.map((v, i) => 1 + i + Math.floor(v * 10)));
    const centersCopy = Float64Array.from(centers);
    const weightsCopy = Float64Array.from(weights);
    const first = mergeClusters(centers, weights, 0.01);
    const second = mergeClusters(centers, weights, 0.01);
    expect(Array.from(centers)).toEqual(Array.from(centersCopy));
    expect(Array.from(weights)).toEqual(Array.from(weightsCopy));
    expect(first.groupCount).toBe(second.groupCount);
    expect(Array.from(first.labels)).toEqual(Array.from(second.labels));
    expect(Array.from(first.centers)).toEqual(Array.from(second.centers));
    expect(Array.from(first.weights)).toEqual(Array.from(second.weights));
    expect(first.groupCount).toBeLessThan(40);
    expect(first.weights.reduce((s, w) => s + w, 0)).toBe(weights.reduce((s, w) => s + w, 0));
  });
});
