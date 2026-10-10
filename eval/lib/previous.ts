import type { PreviousReportRef, StoredReport } from "./report-schema.js";

/**
 * The stored test report with the greatest `generatedAt` (ISO UTC strings compare
 * chronologically); ties go to the greater algorithmVersion, by code unit.
 */
export function findPreviousTestReport(reports: readonly StoredReport[]): StoredReport | null {
  let best: StoredReport | null = null;
  for (const candidate of reports) {
    if (best === null) {
      best = candidate;
      continue;
    }
    const left = candidate.report.header.generatedAt;
    const right = best.report.header.generatedAt;
    if (left > right || (left === right && candidate.algorithmVersion > best.algorithmVersion)) {
      best = candidate;
    }
  }
  return best;
}

/** Null when there is no previous report or its test annotation hash equals `currentSha256`. */
export function testAnnotationsChange(
  previous: StoredReport | null,
  currentSha256: string | null,
): PreviousReportRef | null {
  if (previous === null) return null;
  const old = previous.report.header.annotations.test;
  if (old === currentSha256) return null;
  return {
    algorithmVersion: previous.report.header.algorithmVersion,
    generatedAt: previous.report.header.generatedAt,
    testAnnotations: old,
  };
}
