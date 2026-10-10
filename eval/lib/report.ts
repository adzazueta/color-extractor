import { CALIBRATION_THRESHOLDS, DISTANCE_BUCKET_EDGES } from "../config.js";
import { idNumber, type ImageAnnotation, type SetName } from "./annotation-schema.js";
import { CATEGORIES } from "./categories.js";
import {
  darkDiagnostic,
  evaluateMode,
  hitsAtThresholds,
  round4,
  type ColorLike,
  type ModeOutcome,
  type SampleMatch,
} from "./match.js";
import {
  REPORT_SCHEMA_VERSION,
  type CategoryCounts,
  type DarkRow,
  type DistanceBucket,
  type ImageModeResult,
  type ImageRow,
  type ModeCounts,
  type Report,
  type ReportHeader,
} from "./report-schema.js";

/** One annotated image after analysis. It carries no path and no file name. */
export interface MeasuredImage {
  readonly annotation: ImageAnnotation;
  /** A ColorExtractorError code when the analysis failed. */
  readonly error: string | null;
  /** Empty when the analysis failed. */
  readonly perceptual: readonly ColorLike[];
  readonly population: readonly ColorLike[];
  readonly sampleDrift: boolean;
}

export interface ReportInput {
  readonly set: SetName;
  readonly header: ReportHeader;
  readonly measured: readonly MeasuredImage[];
  readonly pending: number;
  readonly orphaned: number;
  readonly duplicates: number;
}

const MODES = ["perceptual", "population"] as const;

interface Evaluated {
  readonly image: MeasuredImage;
  readonly perceptual: ModeOutcome;
  readonly population: ModeOutcome;
}

function roundedNearest(nearest: SampleMatch | null): SampleMatch | null {
  return nearest === null
    ? null
    : {
        hex: nearest.hex,
        color: nearest.color,
        sample: nearest.sample,
        distance: round4(nearest.distance),
      };
}

function modeResult(outcome: ModeOutcome): ImageModeResult {
  return {
    colors: outcome.colors,
    firstHit: outcome.firstHit,
    top3Hit: outcome.top3Hit,
    nearest: roundedNearest(outcome.nearest),
  };
}

function modeCounts(
  evaluated: readonly Evaluated[],
  mode: (typeof MODES)[number],
  threshold: number | null,
): ModeCounts {
  if (threshold === null) return { firstHits: null, top3Hits: null };
  return {
    firstHits: evaluated.filter((item) => item[mode].firstHit === true).length,
    top3Hits: evaluated.filter((item) => item[mode].top3Hit === true).length,
  };
}

/** Hits of the first color, or null: used for the calibration table and the histogram. */
function firstDistance(item: Evaluated, mode: (typeof MODES)[number]): number | null {
  return item[mode].nearest?.distance ?? null;
}

function distanceBuckets(evaluated: readonly Evaluated[]): DistanceBucket[] {
  const edges = DISTANCE_BUCKET_EDGES;
  const count = (mode: (typeof MODES)[number], from: number, to: number | null): number =>
    evaluated.filter((item) => {
      const distance = firstDistance(item, mode);
      return distance !== null && distance >= from && (to === null || distance < to);
    }).length;
  const buckets: DistanceBucket[] = [];
  let from = 0;
  for (const edge of edges) {
    buckets.push({
      from,
      to: edge,
      perceptual: count("perceptual", from, edge),
      population: count("population", from, edge),
    });
    from = edge;
  }
  buckets.push({
    from,
    to: null,
    perceptual: count("perceptual", from, null),
    population: count("population", from, null),
  });
  const noColor = (mode: (typeof MODES)[number]): number =>
    evaluated.filter((item) => firstDistance(item, mode) === null).length;
  buckets.push({
    from: -1,
    to: null,
    perceptual: noColor("perceptual"),
    population: noColor("population"),
  });
  return buckets;
}

/**
 * Builds the report model (section 3.2). Images are sorted by id number, categories follow the
 * enum order, dark rows are sorted by id, and the calibration (development set only) comes from
 * the candidate thresholds and the histogram edges of `eval/config.ts`.
 */
export function buildReport(input: ReportInput): Report {
  const threshold = input.header.threshold;
  const evaluated: Evaluated[] = [...input.measured]
    .sort((a, b) => idNumber(a.annotation.id) - idNumber(b.annotation.id))
    .map((image) => ({
      image,
      perceptual: evaluateMode(image.perceptual, image.annotation, threshold),
      population: evaluateMode(image.population, image.annotation, threshold),
    }));

  const perceptual = modeCounts(evaluated, "perceptual", threshold);
  const population = modeCounts(evaluated, "population", threshold);

  const categories: CategoryCounts[] = CATEGORIES.map((category) => {
    const subset = evaluated.filter((item) => item.image.annotation.category === category);
    return {
      category,
      measured: subset.length,
      perceptual: modeCounts(subset, "perceptual", threshold),
      population: modeCounts(subset, "population", threshold),
    };
  });

  const dark: DarkRow[] = evaluated
    .filter((item) => item.image.annotation.category === "dark")
    .map((item) => ({
      id: item.image.annotation.id,
      perceptual: darkDiagnostic(item.image.perceptual),
      population: darkDiagnostic(item.image.population),
    }));

  const images: ImageRow[] = evaluated.map((item) => ({
    id: item.image.annotation.id,
    sha256: item.image.annotation.sha256,
    category: item.image.annotation.category,
    error: item.image.error,
    perceptual: modeResult(item.perceptual),
    population: modeResult(item.population),
  }));

  let calibration: Report["calibration"] = null;
  if (input.set === "dev") {
    const perceptualHits = hitsAtThresholds(
      evaluated.map((item) => firstDistance(item, "perceptual")),
      CALIBRATION_THRESHOLDS,
    );
    const populationHits = hitsAtThresholds(
      evaluated.map((item) => firstDistance(item, "population")),
      CALIBRATION_THRESHOLDS,
    );
    calibration = {
      thresholds: CALIBRATION_THRESHOLDS.map((value, index) => ({
        threshold: value,
        perceptual: perceptualHits[index] ?? 0,
        population: populationHits[index] ?? 0,
      })),
      distances: distanceBuckets(evaluated),
    };
  }

  const header = input.header;
  const previous = header.testAnnotationsChanged;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    set: input.set,
    header: {
      algorithmVersion: header.algorithmVersion,
      packageVersion: header.packageVersion,
      commit: header.commit,
      dirty: header.dirty,
      generatedAt: header.generatedAt,
      threshold: header.threshold === null ? null : round4(header.threshold),
      count: header.count,
      decoder: { sharp: header.decoder.sharp, libvips: header.decoder.libvips },
      annotations: { dev: header.annotations.dev, test: header.annotations.test },
      testAnnotationsChanged:
        previous === null || input.set !== "test"
          ? null
          : {
              algorithmVersion: previous.algorithmVersion,
              generatedAt: previous.generatedAt,
              testAnnotations: previous.testAnnotations,
            },
    },
    summary: {
      measured: evaluated.length,
      pending: input.pending,
      orphaned: input.orphaned,
      duplicates: input.duplicates,
      errors: evaluated.filter((item) => item.image.error !== null).length,
      sampleDrift: evaluated.filter((item) => item.image.sampleDrift).length,
      perceptual,
      population,
      perceptualMinusPopulation:
        perceptual.firstHits === null || population.firstHits === null
          ? null
          : perceptual.firstHits - population.firstHits,
    },
    categories,
    calibration,
    dark,
    images,
  };
}
