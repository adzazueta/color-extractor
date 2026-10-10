import { describe, expect, test } from "vite-plus/test";
import {
  colorLetter,
  formatCanvasReadout,
  formatDistance,
  formatMilliseconds,
  formatPercent,
  formatScore,
  formatThreshold,
  sampleLabel,
} from "../../../../lab/ui/format.js";

describe("format", () => {
  test("percent has one decimal", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  test("distances, scores, and thresholds have three decimals", () => {
    expect(formatDistance(0.0612)).toBe("0.061");
    expect(formatScore(0.5)).toBe("0.500");
    expect(formatThreshold(0.06)).toBe("0.060");
  });

  test("milliseconds are rounded", () => {
    expect(formatMilliseconds(12.6)).toBe("13 ms");
  });

  test("colors are lettered and samples numbered from 1", () => {
    expect(colorLetter(0)).toBe("A");
    expect(colorLetter(7)).toBe("H");
    expect(sampleLabel(1, 2)).toBe("B3");
  });

  test("the canvas readout is marked approximate below alpha 255", () => {
    expect(formatCanvasReadout("#aabbcc", 255)).toBe("#aabbcc");
    expect(formatCanvasReadout("#aabbcc", 128)).toBe("≈ #aabbcc · alpha 128");
  });
});
