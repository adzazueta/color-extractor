import { describe, expect, test } from "vite-plus/test";
import type { ImageAnnotation } from "../../../../eval/lib/annotation-schema.js";
import {
  addColor,
  addSample,
  draftFrom,
  draftProblems,
  isDirty,
  removeColor,
  removeSample,
  selectColor,
  setCategory,
  toRequestBody,
  type DraftSample,
} from "../../../../lab/ui/draft.js";

const stored: ImageAnnotation = {
  id: "dev-001",
  sha256: "a".repeat(64),
  category: "dark",
  width: 10,
  height: 10,
  acceptable: [
    {
      samples: [
        { x: 1, y: 1, hex: "#102030" },
        { x: 2, y: 2, hex: "#112233" },
      ],
    },
    { samples: [{ x: 5, y: 5, hex: "#ff0000" }] },
  ],
};

function sample(x: number, y: number, alpha = 255): DraftSample {
  return { x, y, hex: "#123456", alpha };
}

describe("draftFrom", () => {
  test("a new draft has one empty active color and no category", () => {
    expect(draftFrom(null)).toEqual({ category: null, colors: [[]], active: 0 });
  });

  test("a stored annotation becomes opaque samples with no active color", () => {
    const draft = draftFrom(stored);
    expect(draft.category).toBe("dark");
    expect(draft.active).toBeNull();
    expect(draft.colors).toEqual([
      [
        { x: 1, y: 1, hex: "#102030", alpha: 255 },
        { x: 2, y: 2, hex: "#112233", alpha: 255 },
      ],
      [{ x: 5, y: 5, hex: "#ff0000", alpha: 255 }],
    ]);
  });
});

describe("editing", () => {
  test("setCategory", () => {
    expect(setCategory(draftFrom(null), "general").category).toBe("general");
  });

  test("addColor appends an empty color and activates it", () => {
    const draft = addColor(draftFrom(stored));
    expect(draft.colors).toHaveLength(3);
    expect(draft.colors[2]).toEqual([]);
    expect(draft.active).toBe(2);
  });

  test("addColor stops at 8 colors", () => {
    let draft = draftFrom(null);
    for (let i = 0; i < 10; i++) draft = addColor(draft);
    expect(draft.colors).toHaveLength(8);
  });

  test("selectColor ignores bad indexes", () => {
    const draft = draftFrom(stored);
    expect(selectColor(draft, 1).active).toBe(1);
    expect(selectColor(draft, 2)).toBe(draft);
    expect(selectColor(draft, -1)).toBe(draft);
    expect(selectColor(draft, 0.5)).toBe(draft);
  });

  test("addSample goes to the active color", () => {
    const draft = addSample(selectColor(draftFrom(stored), 1), sample(7, 7));
    expect(draft.colors[1]).toHaveLength(2);
    expect(draft.colors[0]).toHaveLength(2);
  });

  test("addSample without an active color changes nothing", () => {
    const draft = draftFrom(stored);
    expect(addSample(draft, sample(7, 7))).toBe(draft);
  });

  test("addSample ignores a position already used, in any color", () => {
    const draft = selectColor(draftFrom(stored), 1);
    expect(addSample(draft, sample(1, 1))).toBe(draft);
    expect(addSample(draft, sample(5, 5))).toBe(draft);
  });

  test("addSample stops at 16 samples per color", () => {
    let draft = draftFrom(null);
    for (let i = 0; i < 20; i++) draft = addSample(draft, sample(i, 0));
    expect(draft.colors[0]).toHaveLength(16);
  });

  test("removeSample", () => {
    const draft = removeSample(draftFrom(stored), 0, 0);
    expect(draft.colors[0]).toEqual([{ x: 2, y: 2, hex: "#112233", alpha: 255 }]);
    const same = draftFrom(stored);
    expect(removeSample(same, 5, 0)).toBe(same);
    expect(removeSample(same, 0, 9)).toBe(same);
  });

  test("removeColor keeps the same color active", () => {
    const draft = selectColor(draftFrom(stored), 1);
    expect(removeColor(draft, 0).active).toBe(0);
    expect(removeColor(draft, 1).active).toBeNull();
    expect(removeColor(selectColor(draft, 0), 1).active).toBe(0);
    expect(removeColor(draft, 0).colors).toHaveLength(1);
  });
});

describe("draftProblems and toRequestBody", () => {
  test("a stored annotation is saveable", () => {
    expect(draftProblems(draftFrom(stored))).toEqual([]);
  });

  test("a new draft reports the category and the empty color", () => {
    expect(draftProblems(draftFrom(null))).toEqual([
      "Choose a category.",
      "Color A has no samples.",
    ]);
  });

  test("no colors", () => {
    const draft = removeColor(setCategory(draftFrom(null), "general"), 0);
    expect(draftProblems(draft)).toEqual(["Add at least one acceptable color."]);
  });

  test("transparent samples are refused", () => {
    const draft = addSample(setCategory(draftFrom(null), "general"), sample(1, 1, 0));
    expect(draftProblems(draft)).toEqual(["Sample at (1, 1) is fully transparent."]);
  });

  test("an empty added color blocks saving", () => {
    expect(draftProblems(addColor(draftFrom(stored)))).toEqual(["Color C has no samples."]);
  });

  test("toRequestBody keeps only positions and the category", () => {
    expect(toRequestBody(draftFrom(stored))).toEqual({
      category: "dark",
      acceptable: [
        {
          samples: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
        { samples: [{ x: 5, y: 5 }] },
      ],
    });
  });

  test("toRequestBody throws while there are problems", () => {
    expect(() => toRequestBody(draftFrom(null))).toThrow(RangeError);
  });
});

describe("isDirty", () => {
  test("a fresh draft is clean, with or without a stored annotation", () => {
    expect(isDirty(draftFrom(null), null)).toBe(false);
    expect(isDirty(draftFrom(stored), stored)).toBe(false);
  });

  test("a new category or sample on a new image is dirty", () => {
    expect(isDirty(setCategory(draftFrom(null), "dark"), null)).toBe(true);
    expect(isDirty(addSample(draftFrom(null), sample(0, 0)), null)).toBe(true);
  });

  test("changes against a stored annotation are dirty", () => {
    const draft = draftFrom(stored);
    expect(isDirty(setCategory(draft, "general"), stored)).toBe(true);
    expect(isDirty(removeSample(draft, 0, 0), stored)).toBe(true);
    expect(isDirty(removeColor(draft, 1), stored)).toBe(true);
    expect(isDirty(addSample(selectColor(draft, 0), sample(8, 8)), stored)).toBe(true);
  });

  test("an empty card is not a change", () => {
    expect(isDirty(addColor(draftFrom(stored)), stored)).toBe(false);
  });

  test("undoing a change makes the draft clean again", () => {
    const draft = addSample(selectColor(draftFrom(stored), 0), sample(8, 8));
    expect(isDirty(removeSample(draft, 0, 2), stored)).toBe(false);
  });
});
