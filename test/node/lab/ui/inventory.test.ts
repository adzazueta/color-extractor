import { describe, expect, test } from "vite-plus/test";
import type { LabImage, LabInventory } from "../../../../lab/api.js";
import {
  countsOf,
  imagesOf,
  neighbor,
  nextPending,
  orphansOf,
  parseRoute,
  routeFor,
  statusOf,
  visibleImages,
} from "../../../../lab/ui/inventory.js";

function image(set: "dev" | "test", name: string, annotated: boolean, locked = false): LabImage {
  return {
    set,
    sha256: name.padEnd(64, "0"),
    relativePath: `${name}.png`,
    bytes: 1,
    annotation: annotated ? { id: `${set}-001`, category: "general" } : null,
    locked,
  };
}

const images = [
  image("dev", "a1", true),
  image("dev", "a2", false),
  image("dev", "a3", false),
  image("test", "b1", false),
  image("test", "b2", true, true),
];
const inventory: LabInventory = {
  evalDir: "/eval",
  threshold: null,
  calibrationThresholds: [],
  images,
  orphans: [
    { set: "dev", id: "dev-012", sha256: "f".repeat(64), category: "dark" },
    { set: "test", id: "test-004", sha256: "e".repeat(64), category: "general" },
  ],
  duplicates: 0,
  skipped: 0,
  problems: [],
};

test("status", () => {
  expect(images.map(statusOf)).toEqual(["annotated", "pending", "pending", "pending", "locked"]);
});

test("grouping, orphans, and counts", () => {
  expect(imagesOf(inventory, "test")).toHaveLength(2);
  expect(orphansOf(inventory, "dev").map((o) => o.id)).toEqual(["dev-012"]);
  expect(countsOf(inventory, "dev")).toEqual({ annotated: 1, pending: 2, orphaned: 1 });
  expect(countsOf(inventory, "test")).toEqual({ annotated: 1, pending: 1, orphaned: 1 });
});

test("the pending filter keeps the order", () => {
  expect(visibleImages(images, true).map((i) => i.relativePath)).toEqual([
    "a2.png",
    "a3.png",
    "b1.png",
  ]);
  expect(visibleImages(images, false)).toHaveLength(5);
});

describe("neighbor", () => {
  const sha = (index: number): string => images[index]?.sha256 ?? "";

  test("moves one step and stops at the ends", () => {
    expect(neighbor(images, sha(1), 1)?.relativePath).toBe("a3.png");
    expect(neighbor(images, sha(1), -1)?.relativePath).toBe("a1.png");
    expect(neighbor(images, sha(0), -1)).toBeNull();
    expect(neighbor(images, sha(4), 1)).toBeNull();
  });

  test("without a current image, the first or the last", () => {
    expect(neighbor(images, null, 1)?.relativePath).toBe("a1.png");
    expect(neighbor(images, null, -1)?.relativePath).toBe("b2.png");
    expect(neighbor([], null, 1)).toBeNull();
  });
});

describe("nextPending", () => {
  const sha = (index: number): string => images[index]?.sha256 ?? "";

  test("skips annotated and locked images", () => {
    expect(nextPending(images, sha(0))?.relativePath).toBe("a2.png");
    expect(nextPending(images, sha(2))?.relativePath).toBe("b1.png");
  });

  test("wraps around", () => {
    expect(nextPending(images, sha(3))?.relativePath).toBe("a2.png");
  });

  test("is null when nothing else is pending", () => {
    expect(nextPending([image("dev", "a1", true)], null)).toBeNull();
    expect(nextPending([image("dev", "a1", false)], image("dev", "a1", false).sha256)).toBeNull();
  });
});

test("routes", () => {
  const sha = "ab".repeat(32);
  expect(routeFor(sha)).toBe(`#/${sha}`);
  expect(parseRoute(routeFor(sha))).toBe(sha);
  expect(parseRoute("")).toBeNull();
  expect(parseRoute("#/ABC")).toBeNull();
  expect(parseRoute(`#/${sha}x`)).toBeNull();
  expect(parseRoute(`#/${"A".repeat(64)}`)).toBeNull();
});
