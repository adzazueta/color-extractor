import { describe, expect, test } from "vite-plus/test";
import type { ImageAnnotation, SetName } from "../../../eval/lib/annotation-schema.js";
import type { Category } from "../../../eval/lib/categories.js";
import { buildReport, type MeasuredImage } from "../../../eval/lib/report.js";
import type { ReportHeader } from "../../../eval/lib/report-schema.js";
import { CALIBRATION_THRESHOLDS } from "../../../eval/config.js";
import { oklabDistance, parseHex } from "../../../eval/lib/color.js";

const ORANGE = "#d9822b";
const TEAL = "#28aab4";
const BLACK = "#000000";

function header(threshold: number | null): ReportHeader {
  return {
    algorithmVersion: "1-test",
    packageVersion: "0.0.0",
    commit: "c".repeat(40),
    dirty: false,
    generatedAt: "2026-10-20T18:04:05Z",
    threshold,
    count: 5,
    decoder: { sharp: "1.0.0", libvips: "2.0.0" },
    annotations: { dev: "a".repeat(64), test: null },
    testAnnotationsChanged: null,
  };
}

function annotation(number: number, category: Category, hex: string, set: SetName = "dev") {
  const id = `${set}-${String(number).padStart(3, "0")}`;
  const result: ImageAnnotation = {
    id,
    sha256: number.toString(16).padStart(64, "0"),
    category,
    width: 4,
    height: 4,
    acceptable: [{ samples: [{ x: 0, y: 0, hex }] }],
  };
  return result;
}

function measured(
  image: ImageAnnotation,
  perceptual: string[],
  population: string[] = perceptual,
  extra: Partial<MeasuredImage> = {},
): MeasuredImage {
  const toColors = (hexes: string[]) => hexes.map((hex) => ({ hex, coverage: 0.2 }));
  return {
    annotation: image,
    error: null,
    perceptual: toColors(perceptual),
    population: toColors(population),
    sampleDrift: false,
    ...extra,
  };
}

function input(set: SetName, threshold: number | null, images: MeasuredImage[]) {
  return {
    set,
    header: header(threshold),
    measured: images,
    pending: 0,
    orphaned: 0,
    duplicates: 0,
  };
}

describe("summary", () => {
  const images = [
    measured(annotation(1, "reference", ORANGE), [ORANGE, TEAL]), // first hit in both
    measured(annotation(2, "general", ORANGE), [TEAL, ORANGE], [ORANGE, TEAL]), // top 3 only / first
    measured(annotation(3, "general", ORANGE), [TEAL, BLACK], [TEAL, BLACK]), // miss
  ];

  test("counts hits per mode, with the difference", () => {
    const report = buildReport(input("dev", 0.05, images));
    expect(report.summary).toEqual({
      measured: 3,
      pending: 0,
      orphaned: 0,
      duplicates: 0,
      errors: 0,
      sampleDrift: 0,
      perceptual: { firstHits: 1, top3Hits: 2 },
      population: { firstHits: 2, top3Hits: 2 },
      perceptualMinusPopulation: -1,
    });
  });

  test("pending, orphaned, and duplicates are reported but not counted as measured", () => {
    const report = buildReport({
      ...input("dev", 0.05, images),
      pending: 3,
      orphaned: 2,
      duplicates: 1,
    });
    expect(report.summary).toMatchObject({ measured: 3, pending: 3, orphaned: 2, duplicates: 1 });
  });

  test("an analysis error is a miss in both modes and keeps its code", () => {
    const failed = measured(annotation(4, "dark", BLACK), [], [], { error: "DECODE_FAILED" });
    const report = buildReport(input("dev", 0.05, [failed]));
    expect(report.summary).toMatchObject({
      measured: 1,
      errors: 1,
      perceptual: { firstHits: 0, top3Hits: 0 },
      population: { firstHits: 0, top3Hits: 0 },
    });
    expect(report.images[0]).toMatchObject({
      error: "DECODE_FAILED",
      perceptual: { colors: [], firstHit: false, top3Hit: false, nearest: null },
    });
  });

  test("sample drift is counted", () => {
    const report = buildReport(
      input("dev", 0.05, [
        measured(annotation(1, "general", ORANGE), [ORANGE], [ORANGE], { sampleDrift: true }),
      ]),
    );
    expect(report.summary.sampleDrift).toBe(1);
  });

  test("a null threshold gives null hits and a calibration table", () => {
    const report = buildReport(input("dev", null, images));
    expect(report.header.threshold).toBeNull();
    expect(report.summary.perceptual).toEqual({ firstHits: null, top3Hits: null });
    expect(report.summary.perceptualMinusPopulation).toBeNull();
    expect(report.images[0]?.perceptual).toMatchObject({ firstHit: null, top3Hit: null });
    expect(report.images[0]?.perceptual.nearest?.distance).toBe(0);
    expect(report.calibration?.thresholds).toHaveLength(CALIBRATION_THRESHOLDS.length);
    expect(report.calibration?.thresholds[0]).toEqual({
      threshold: 0.02,
      perceptual: 1,
      population: 2,
    });
  });
});

describe("categories", () => {
  test("all 7 categories appear in enum order, with zeros", () => {
    const report = buildReport(
      input("dev", 0.05, [measured(annotation(1, "dark", BLACK), [BLACK])]),
    );
    expect(report.categories.map((row) => row.category)).toEqual([
      "reference",
      "black-and-white",
      "saturated-logo",
      "character-art",
      "white-background",
      "dark",
      "general",
    ]);
    expect(report.categories.find((row) => row.category === "dark")).toEqual({
      category: "dark",
      measured: 1,
      perceptual: { firstHits: 1, top3Hits: 1 },
      population: { firstHits: 1, top3Hits: 1 },
    });
    expect(report.categories.find((row) => row.category === "reference")).toEqual({
      category: "reference",
      measured: 0,
      perceptual: { firstHits: 0, top3Hits: 0 },
      population: { firstHits: 0, top3Hits: 0 },
    });
  });
});

describe("calibration", () => {
  test("the test report has none", () => {
    const report = buildReport(
      input("test", 0.05, [measured(annotation(1, "general", ORANGE, "test"), [ORANGE], [ORANGE])]),
    );
    expect(report.calibration).toBeNull();
  });

  test("hits at thresholds use the distance of the first color", () => {
    const near = "#d9822f";
    const distance = oklabDistance(parseHex(near), parseHex(ORANGE));
    const report = buildReport(
      input("dev", null, [
        measured(annotation(1, "general", ORANGE), [near]),
        measured(annotation(2, "general", ORANGE), [ORANGE]),
      ]),
    );
    const rows = report.calibration?.thresholds ?? [];
    expect(distance).toBeLessThan(0.02);
    expect(rows[0]).toEqual({ threshold: 0.02, perceptual: 2, population: 2 });
    const far = buildReport(
      input("dev", null, [measured(annotation(1, "general", ORANGE), [TEAL])]),
    );
    expect(far.calibration?.thresholds.at(-1)).toEqual({
      threshold: 0.2,
      perceptual: 0,
      population: 0,
    });
  });

  test("the histogram covers every image once: buckets, the open one, and no color", () => {
    const report = buildReport(
      input("dev", null, [
        measured(annotation(1, "general", ORANGE), [ORANGE]),
        measured(annotation(2, "general", ORANGE), [TEAL]),
        measured(annotation(3, "general", ORANGE), [], [], { error: "DECODE_FAILED" }),
      ]),
    );
    const distances = report.calibration?.distances ?? [];
    expect(distances[0]).toEqual({ from: 0, to: 0.02, perceptual: 1, population: 1 });
    expect(distances.at(-2)).toEqual({ from: 0.2, to: null, perceptual: 1, population: 1 });
    expect(distances.at(-1)).toEqual({ from: -1, to: null, perceptual: 1, population: 1 });
    expect(distances.reduce((sum, bucket) => sum + bucket.perceptual, 0)).toBe(3);
  });

  test("each distance falls in exactly one half-open bucket", () => {
    for (const grey of ["#030303", "#080808", "#101010", "#202020", "#808080"]) {
      const distance = oklabDistance(parseHex(BLACK), parseHex(grey));
      const report = buildReport(
        input("dev", null, [measured(annotation(1, "general", BLACK), [grey])]),
      );
      const rows = report.calibration?.distances ?? [];
      const owners = rows.filter((row) => row.perceptual === 1);
      expect(owners).toHaveLength(1);
      const owner = owners[0]!;
      expect(distance).toBeGreaterThanOrEqual(owner.from);
      if (owner.to !== null) expect(distance).toBeLessThan(owner.to);
    }
  });
});

describe("dark diagnostic", () => {
  test("only dark images get a row, sorted by id", () => {
    const report = buildReport(
      input("dev", 0.05, [
        measured(annotation(12, "dark", BLACK), [BLACK, "#0a0a0a"]),
        measured(annotation(3, "general", ORANGE), [ORANGE]),
        measured(annotation(9, "dark", BLACK), [ORANGE]),
      ]),
    );
    expect(report.dark.map((row) => row.id)).toEqual(["dev-009", "dev-012"]);
    expect(report.dark[0]?.perceptual).toEqual({ nearBlack: 0, coverage: 0, closestPair: null });
    expect(report.dark[1]?.perceptual.nearBlack).toBe(2);
    expect(report.dark[1]?.perceptual.coverage).toBe(0.4);
    expect(report.dark[1]?.perceptual.closestPair).toBeGreaterThan(0);
  });
});

describe("ordering and rounding", () => {
  test("images are sorted by id number, not by text", () => {
    const report = buildReport(
      input("dev", 0.05, [
        measured(annotation(10, "general", ORANGE), [ORANGE]),
        measured(annotation(9, "general", ORANGE), [ORANGE]),
        measured(annotation(100, "general", ORANGE), [ORANGE]),
      ]),
    );
    expect(report.images.map((row) => row.id)).toEqual(["dev-009", "dev-010", "dev-100"]);
  });

  test("distances are rounded to 4 decimals and the key order is fixed", () => {
    const report = buildReport(
      input("dev", 0.05, [measured(annotation(1, "general", ORANGE), ["#d9822f"])]),
    );
    const distance = report.images[0]?.perceptual.nearest?.distance ?? 0;
    expect(distance).toBe(Math.round(distance * 10_000) / 10_000);
    expect(Object.keys(report)).toEqual([
      "schemaVersion",
      "set",
      "header",
      "summary",
      "categories",
      "calibration",
      "dark",
      "images",
    ]);
    expect(Object.keys(report.images[0]?.perceptual ?? {})).toEqual([
      "colors",
      "firstHit",
      "top3Hit",
      "nearest",
    ]);
    expect(Object.keys(report.header)).toEqual([
      "algorithmVersion",
      "packageVersion",
      "commit",
      "dirty",
      "generatedAt",
      "threshold",
      "count",
      "decoder",
      "annotations",
      "testAnnotationsChanged",
    ]);
  });

  test("the report carries no path or file name", () => {
    const text = JSON.stringify(
      buildReport(input("dev", 0.05, [measured(annotation(1, "general", ORANGE), [ORANGE])])),
    );
    expect(text).not.toMatch(/relativePath|\.png|\.jpg|\//);
  });
});
