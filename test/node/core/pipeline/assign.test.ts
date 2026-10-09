import { describe, expect, it } from "vite-plus/test";
import { assignGroups } from "@/core/pipeline/assign.js";
import { NO_GROUP } from "@/core/pipeline/parameters.js";
import { mulberry32 } from "../helpers.js";

const T = 0xffffffff;

// 6 colors in 4 cells, 3 clusters, 2 groups.
const colorCells = Uint32Array.of(0, 0, 1, 2, 2, 3);
const colorWeights = Float64Array.of(5, 7, 11, 13, 17, 19);
const cellLabels = Uint8Array.of(1, 0, 2, 2);
const clusterLabels = Uint8Array.of(0, 1, 1);
const pixelColorIndices = Uint32Array.of(0, T, 5, 2, 2, T, 3, 1, 4, 0);

describe("assignGroups", () => {
  it("composes colors -> cells -> clusters -> groups by hand", () => {
    const r = assignGroups(
      pixelColorIndices,
      colorWeights,
      colorCells,
      cellLabels,
      clusterLabels,
      2,
    );
    // cells 0,1,2,3 -> clusters 1,0,2,2 -> groups 1,0,1,1
    expect([...r.colorLabels]).toEqual([1, 1, 0, 1, 1, 1]);
    expect([...r.pixelLabels]).toEqual([1, NO_GROUP, 1, 0, 0, NO_GROUP, 1, 1, 1, 1]);
  });

  it("gives transparent pixels NO_GROUP and nothing else", () => {
    const r = assignGroups(
      pixelColorIndices,
      colorWeights,
      colorCells,
      cellLabels,
      clusterLabels,
      2,
    );
    pixelColorIndices.forEach((index, p) => {
      expect(r.pixelLabels[p] === NO_GROUP).toBe(index === T);
    });
  });

  it("sums exact integer weights per group", () => {
    const r = assignGroups(
      pixelColorIndices,
      colorWeights,
      colorCells,
      cellLabels,
      clusterLabels,
      2,
    );
    expect([...r.weights]).toEqual([11, 5 + 7 + 13 + 17 + 19]);
    expect(r.weights[0]! + r.weights[1]!).toBe(colorWeights.reduce((a, b) => a + b, 0));
  });

  it("handles a fully transparent input", () => {
    const r = assignGroups(
      Uint32Array.of(T, T, T),
      new Float64Array(0),
      new Uint32Array(0),
      new Uint8Array(0),
      new Uint8Array(0),
      0,
    );
    expect([...r.pixelLabels]).toEqual([NO_GROUP, NO_GROUP, NO_GROUP]);
    expect(r.colorLabels.length).toBe(0);
    expect(r.weights.length).toBe(0);
  });

  it("matches a naive reference on seeded random input", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rand = mulberry32(seed);
      const colors = 1 + Math.floor(rand() * 200);
      const cells = 1 + Math.floor(rand() * Math.min(colors, 60));
      const clusters = 1 + Math.floor(rand() * Math.min(cells, 20));
      const groups = 1 + Math.floor(rand() * clusters);
      const cc = new Uint32Array(colors);
      const w = new Float64Array(colors);
      for (let c = 0; c < colors; c++) {
        cc[c] = c < cells ? c : Math.floor(rand() * cells);
        w[c] = 1 + Math.floor(rand() * 255 * 1000);
      }
      const cl = new Uint8Array(cells);
      for (let j = 0; j < cells; j++) cl[j] = j < clusters ? j : Math.floor(rand() * clusters);
      const gl = new Uint8Array(clusters);
      for (let k = 0; k < clusters; k++) gl[k] = k < groups ? k : Math.floor(rand() * groups);
      const n = 1 + Math.floor(rand() * 3000);
      const pci = new Uint32Array(n);
      for (let p = 0; p < n; p++) {
        pci[p] = rand() < 0.1 ? T : Math.floor(rand() * colors);
      }

      const r = assignGroups(pci, w, cc, cl, gl, groups);

      const refColors: number[] = [];
      const refWeights = Array.from({ length: groups }, () => 0);
      for (let c = 0; c < colors; c++) {
        const g = gl[cl[cc[c]!]!]!;
        refColors.push(g);
        refWeights[g]! += w[c]!;
      }
      expect([...r.colorLabels]).toEqual(refColors);
      expect([...r.weights]).toEqual(refWeights);
      const refPixels = [...pci].map((i) => (i === T ? NO_GROUP : refColors[i]!));
      expect([...r.pixelLabels]).toEqual(refPixels);
    }
  });

  it("equals alpha sums over pixels and the total visible weight", () => {
    // Pixel weights are alphas: build them from the per-color weights by construction.
    const alphas = [255, 1, 128, 0, 77, 255, 3, 0];
    const idx = Uint32Array.of(0, 0, 1, T, 2, 2, 1, T);
    const w = new Float64Array(3);
    alphas.forEach((a, p) => {
      const i = idx[p]!;
      if (i !== T) w[i] = w[i]! + a;
    });
    const r = assignGroups(
      idx,
      w,
      Uint32Array.of(0, 1, 2),
      Uint8Array.of(0, 1, 1),
      Uint8Array.of(0, 1),
      2,
    );
    const direct = [0, 0];
    alphas.forEach((a, p) => {
      const g = r.pixelLabels[p]!;
      if (g !== NO_GROUP) direct[g]! += a;
    });
    expect([...r.weights]).toEqual(direct);
    expect(r.weights[0]! + r.weights[1]!).toBe(w[0]! + w[1]! + w[2]!);
  });

  it("is deterministic and allocates fresh outputs", () => {
    const a = assignGroups(
      pixelColorIndices,
      colorWeights,
      colorCells,
      cellLabels,
      clusterLabels,
      2,
    );
    const b = assignGroups(
      pixelColorIndices,
      colorWeights,
      colorCells,
      cellLabels,
      clusterLabels,
      2,
    );
    expect(a.pixelLabels).toEqual(b.pixelLabels);
    expect(a.colorLabels).toEqual(b.colorLabels);
    expect(a.weights).toEqual(b.weights);
    expect(a.pixelLabels).not.toBe(b.pixelLabels);
    expect(a.colorLabels).not.toBe(clusterLabels);
  });

  it("does not mutate its inputs", () => {
    const inputs = [pixelColorIndices, colorWeights, colorCells, cellLabels, clusterLabels];
    const copies = inputs.map((x) => x.slice());
    assignGroups(pixelColorIndices, colorWeights, colorCells, cellLabels, clusterLabels, 2);
    inputs.forEach((x, i) => expect(x).toEqual(copies[i]));
  });
});
