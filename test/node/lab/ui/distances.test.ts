import type { ExtractedColor } from "@/core/types.js";
import { describe, expect, test } from "vite-plus/test";
import { MATCH_THRESHOLD } from "../../../../eval/config.js";
import { oklabDistance, parseHex } from "../../../../eval/lib/color.js";
import { evaluateMode } from "../../../../eval/lib/match.js";
import {
  clampThreshold,
  defaultThreshold,
  draftAnnotation,
  liveRows,
  liveSummary,
} from "../../../../lab/ui/distances.js";
import {
  addSample,
  draftFrom,
  selectColor,
  setCategory,
  type Draft,
} from "../../../../lab/ui/draft.js";

function color(rank: number, hex: string): ExtractedColor {
  return {
    rank,
    hex,
    hex8: `${hex}ff`,
    rgba: [0, 0, 0, 255],
    coverage: 0.25,
    score: 0.5,
    position: { x: 0, y: 0 },
  };
}

function draft(): Draft {
  let value = setCategory(draftFrom(null), "general");
  value = addSample(value, { x: 0, y: 0, hex: "#ff0000", alpha: 255 });
  value = addSample(value, { x: 1, y: 0, hex: "#fe0000", alpha: 255 });
  value = { ...value, colors: [...value.colors, []] };
  value = selectColor(value, 1);
  return addSample(value, { x: 2, y: 0, hex: "#0000ff", alpha: 255 });
}

const colors = [color(1, "#fd0000"), color(2, "#0000fe"), color(3, "#00ff00")];

describe("draftAnnotation", () => {
  test("is null without samples", () => {
    expect(draftAnnotation(draftFrom(null))).toBeNull();
  });

  test("keeps color indexes", () => {
    const annotation = draftAnnotation(draft());
    expect(annotation?.acceptable.map((c) => c.samples.length)).toEqual([2, 1]);
  });
});

describe("liveRows", () => {
  test("distances come from the shared matcher", () => {
    const rows = liveRows(colors, draft(), 0.06);
    expect(rows[0]?.distance).toBe(oklabDistance(parseHex("#fd0000"), parseHex("#fe0000")));
    expect(rows[0]?.nearest).toBe("A2");
    expect(rows[1]?.nearest).toBe("B1");
  });

  test("hits use distance <= threshold", () => {
    const rows = liveRows(colors, draft(), 0.06);
    expect(rows.map((row) => row.hit)).toEqual([true, true, false]);
    const exact = rows[0]?.distance ?? 0;
    expect(liveRows(colors, draft(), exact)[0]?.hit).toBe(true);
    expect(liveRows(colors, draft(), exact - 1e-9)[0]?.hit).toBe(false);
  });

  test("without samples there is no distance and no hit", () => {
    const rows = liveRows(colors, draftFrom(null), 0.06);
    expect(rows.every((row) => row.distance === null && row.hit === null)).toBe(true);
  });

  test("rows carry rank, coverage, and score through", () => {
    expect(liveRows(colors, draft(), 0.06)[2]).toMatchObject({
      rank: 3,
      coverage: 0.25,
      score: 0.5,
    });
  });
});

describe("liveSummary", () => {
  test("matches evaluateMode, the script's matcher", () => {
    const annotation = draftAnnotation(draft());
    if (annotation === null) throw new Error("expected samples");
    for (const threshold of [0, 0.01, 0.06, 0.3]) {
      const expected = evaluateMode(colors, annotation, threshold);
      expect(liveSummary(colors, draft(), threshold)).toEqual({
        firstHit: expected.firstHit,
        top3Hit: expected.top3Hit,
      });
    }
  });

  test("top 3 can hit when the first color misses", () => {
    const later = [color(1, "#00ff00"), color(2, "#fe0000")];
    expect(liveSummary(later, draft(), 0.06)).toEqual({ firstHit: false, top3Hit: true });
  });

  test("is null without samples", () => {
    expect(liveSummary(colors, draftFrom(null), 0.06)).toBeNull();
  });
});

describe("threshold", () => {
  test("clamps to 0..0.3 and snaps to 0.005", () => {
    expect(clampThreshold(-1)).toBe(0);
    expect(clampThreshold(1)).toBe(0.3);
    expect(clampThreshold(0.0612)).toBe(0.06);
    expect(clampThreshold(0.0626)).toBe(0.065);
    expect(clampThreshold(Number.NaN)).toBe(0.06);
  });

  test("the default is MATCH_THRESHOLD, or 0.06 while it is not fixed", () => {
    expect(defaultThreshold()).toBe(clampThreshold(MATCH_THRESHOLD ?? 0.06));
  });
});
