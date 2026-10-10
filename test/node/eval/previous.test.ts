import { expect, test } from "vite-plus/test";
import { findPreviousTestReport, testAnnotationsChange } from "../../../eval/lib/previous.js";
import { buildReport } from "../../../eval/lib/report.js";
import type { StoredReport } from "../../../eval/lib/report-schema.js";

function stored(
  algorithmVersion: string,
  generatedAt: string,
  testSha: string | null,
): StoredReport {
  return {
    algorithmVersion,
    report: buildReport({
      set: "test",
      header: {
        algorithmVersion,
        packageVersion: "0.0.0",
        commit: "c".repeat(40),
        dirty: false,
        generatedAt,
        threshold: 0.05,
        count: 5,
        decoder: { sharp: "1", libvips: "2" },
        annotations: { dev: null, test: testSha },
        testAnnotationsChanged: null,
      },
      measured: [],
      pending: 0,
      orphaned: 0,
      duplicates: 0,
    }),
  };
}

test("the report with the greatest generatedAt wins", () => {
  const reports = [
    stored("1-b", "2026-10-02T00:00:00Z", "b"),
    stored("1-c", "2026-10-03T00:00:00Z", "c"),
    stored("1-a", "2026-10-01T00:00:00Z", "a"),
  ];
  expect(findPreviousTestReport(reports)?.algorithmVersion).toBe("1-c");
});

test("a tie goes to the greater algorithmVersion, by code unit", () => {
  const reports = [
    stored("2-x", "2026-10-02T00:00:00Z", "x"),
    stored("10-x", "2026-10-02T00:00:00Z", "y"),
    stored("1-x", "2026-10-02T00:00:00Z", "z"),
  ];
  // "2-x" > "10-x" > "1-x" by code unit.
  expect(findPreviousTestReport(reports)?.algorithmVersion).toBe("2-x");
  expect(findPreviousTestReport([...reports].reverse())?.algorithmVersion).toBe("2-x");
});

test("no stored report gives null", () => {
  expect(findPreviousTestReport([])).toBeNull();
  expect(testAnnotationsChange(null, "a")).toBeNull();
});

test("a changed hash is flagged with the previous report's data", () => {
  const previous = stored("1-a", "2026-10-01T00:00:00Z", "old");
  expect(testAnnotationsChange(previous, "new")).toEqual({
    algorithmVersion: "1-a",
    generatedAt: "2026-10-01T00:00:00Z",
    testAnnotations: "old",
  });
  expect(testAnnotationsChange(previous, null)).toEqual({
    algorithmVersion: "1-a",
    generatedAt: "2026-10-01T00:00:00Z",
    testAnnotations: "old",
  });
});

test("an unchanged hash is not flagged", () => {
  expect(testAnnotationsChange(stored("1-a", "2026-10-01T00:00:00Z", "same"), "same")).toBeNull();
  expect(testAnnotationsChange(stored("1-a", "2026-10-01T00:00:00Z", null), null)).toBeNull();
});
