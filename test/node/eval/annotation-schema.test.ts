import { describe, expect, test } from "vite-plus/test";
import {
  AnnotationError,
  crossSetDuplicates,
  emptyAnnotationFile,
  findAnnotation,
  idNumber,
  nextImageId,
  parseAnnotationFile,
  removeAnnotation,
  serializeAnnotationFile,
  upsertAnnotation,
  type AnnotationFile,
  type ImageAnnotation,
} from "../../../eval/lib/annotation-schema.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function image(id: string, sha256: string, extra: Record<string, unknown> = {}): ImageAnnotation {
  return {
    id,
    sha256,
    category: "reference",
    width: 120,
    height: 80,
    acceptable: [
      {
        samples: [
          { x: 10, y: 20, hex: "#d9822b" },
          { x: 30, y: 40, hex: "#da7f2a" },
        ],
      },
      { samples: [{ x: 119, y: 79, hex: "#2aa8b2" }] },
    ],
    ...extra,
  };
}

function file(images: readonly unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ schemaVersion: 1, set: "dev", images, ...extra });
}

function problemsOf(text: string): readonly string[] {
  try {
    parseAnnotationFile(text, "dev", "dev.json");
  } catch (error) {
    expect(error).toBeInstanceOf(AnnotationError);
    return (error as AnnotationError).problems;
  }
  return [];
}

function problemWith(text: string, path: string): string {
  const found = problemsOf(text).find((problem) => problem.startsWith(path));
  expect(found, `a problem at ${path}`).toBeDefined();
  return found!;
}

/** A valid image with one field replaced. */
function withField(field: string, value: unknown): string {
  return file([{ ...image("dev-001", SHA_A), [field]: value }]);
}

describe("canonical form", () => {
  test("parsing and serializing a canonical file gives back the same text", () => {
    const original: AnnotationFile = {
      schemaVersion: 1,
      set: "dev",
      images: [image("dev-001", SHA_A), image("dev-002", SHA_B, { category: "dark" })],
    };
    const text = serializeAnnotationFile(original);
    expect(text.endsWith("}\n")).toBe(true);
    const parsed = parseAnnotationFile(text, "dev", "dev.json");
    expect(parsed).toEqual(original);
    expect(serializeAnnotationFile(parsed)).toBe(text);
  });

  test("serialization orders keys and images", () => {
    const messy = {
      images: [
        { ...image("dev-010", SHA_B), acceptable: [{ samples: [{ hex: "#000000", y: 1, x: 2 }] }] },
        {
          acceptable: image("dev-009", SHA_A).acceptable,
          id: "dev-009",
          sha256: SHA_A,
          height: 80,
          width: 120,
          category: "dark",
        },
      ],
      set: "dev",
      schemaVersion: 1,
    } as unknown as AnnotationFile;
    const text = serializeAnnotationFile(messy);
    expect(text.indexOf("dev-009")).toBeLessThan(text.indexOf("dev-010"));
    expect(text.indexOf('"schemaVersion"')).toBeLessThan(text.indexOf('"set"'));
    expect(text.indexOf('"x"')).toBeLessThan(text.indexOf('"hex"'));
  });

  test("an empty file is canonical", () => {
    expect(serializeAnnotationFile(emptyAnnotationFile("test"))).toBe(
      '{\n  "schemaVersion": 1,\n  "set": "test",\n  "images": []\n}\n',
    );
  });
});

describe("validation", () => {
  test("text that is not JSON, or not an object", () => {
    expect(problemsOf("nope")).toEqual(["The text is not valid JSON."]);
    expect(problemsOf("[]")).toEqual(["The top level must be an object."]);
  });

  test("wrong schemaVersion or set", () => {
    expect(problemWith(file([], { schemaVersion: 2 }), "schemaVersion")).toContain("must be 1");
    expect(problemWith(file([], { set: "test" }), "set")).toContain('"dev"');
  });

  test("unknown keys at each level", () => {
    expect(problemWith(file([], { title: "x" }), "title")).toContain("unknown key");
    expect(problemWith(withField("title", "x"), "images[0].title")).toContain("unknown key");
    const colorExtra = file([
      image("dev-001", SHA_A, {
        acceptable: [{ samples: [{ x: 0, y: 0, hex: "#000000" }], note: 1 }],
      }),
    ]);
    expect(problemWith(colorExtra, "images[0].acceptable[0].note")).toContain("unknown key");
    const sampleExtra = file([
      image("dev-001", SHA_A, {
        acceptable: [{ samples: [{ x: 0, y: 0, hex: "#000000", z: 1 }] }],
      }),
    ]);
    expect(problemWith(sampleExtra, "images[0].acceptable[0].samples[0].z")).toContain(
      "unknown key",
    );
  });

  test("ids: bad pattern, wrong prefix, zero, duplicate", () => {
    expect(problemWith(withField("id", "dev-1"), "images[0].id")).toContain("at least 3 digits");
    expect(problemWith(withField("id", "test-001"), "images[0].id")).toContain('start with "dev-"');
    expect(problemWith(withField("id", "dev-000"), "images[0].id")).toContain("1 or more");
    const duplicate = file([image("dev-001", SHA_A), image("dev-001", SHA_B)]);
    expect(problemWith(duplicate, "images[1].id")).toContain("images[0].id");
  });

  test("hashes: bad and duplicate", () => {
    expect(problemWith(withField("sha256", "ABC"), "images[0].sha256")).toContain("64 lowercase");
    expect(problemWith(withField("sha256", "A".repeat(64)), "images[0].sha256")).toContain(
      "64 lowercase",
    );
    const duplicate = file([image("dev-001", SHA_A), image("dev-002", SHA_A)]);
    expect(problemWith(duplicate, "images[1].sha256")).toContain("images[0].sha256");
  });

  test("unknown category", () => {
    expect(problemWith(withField("category", "Reference"), "images[0].category")).toContain(
      "unknown",
    );
  });

  test("sizes: not integer, not positive, too many pixels", () => {
    expect(problemWith(withField("width", 1.5), "images[0].width")).toContain("positive integer");
    expect(problemWith(withField("height", 0), "images[0].height")).toContain("positive integer");
    expect(problemWith(withField("width", "10"), "images[0].width")).toContain("positive integer");
    const large = file([
      {
        ...image("dev-001", SHA_A),
        width: 4097,
        height: 4096,
        acceptable: [{ samples: [{ x: 0, y: 0, hex: "#000000" }] }],
      },
    ]);
    expect(problemWith(large, "images[0]")).toContain("16777216");
    const edge = file([{ ...image("dev-001", SHA_A), width: 4096, height: 4096 }]);
    expect(problemsOf(edge).some((problem) => problem.includes("16777216"))).toBe(false);
  });

  test("0 or 9 colors, 0 or 17 samples", () => {
    expect(problemWith(withField("acceptable", []), "images[0].acceptable")).toContain("1 to 8");
    const nine = Array.from({ length: 9 }, (_, i) => ({
      samples: [{ x: i, y: 0, hex: "#000000" }],
    }));
    expect(problemWith(withField("acceptable", nine), "images[0].acceptable")).toContain("1 to 8");
    expect(
      problemWith(withField("acceptable", [{ samples: [] }]), "images[0].acceptable[0].samples"),
    ).toContain("1 to 16");
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ x: i, y: 0, hex: "#000000" }));
    expect(
      problemWith(
        withField("acceptable", [{ samples: seventeen }]),
        "images[0].acceptable[0].samples",
      ),
    ).toContain("1 to 16");
    const eight = nine.slice(0, 8);
    expect(problemsOf(withField("acceptable", eight)).length).toBe(0);
  });

  test("x and y: out of range or fractional", () => {
    const sample = (x: number, y: number) =>
      withField("acceptable", [{ samples: [{ x, y, hex: "#000000" }] }]);
    expect(problemWith(sample(120, 0), "images[0].acceptable[0].samples[0].x")).toContain("width");
    expect(problemWith(sample(0, 80), "images[0].acceptable[0].samples[0].y")).toContain("height");
    expect(problemWith(sample(-1, 0), "images[0].acceptable[0].samples[0].x")).toContain("width");
    expect(problemWith(sample(1.5, 0), "images[0].acceptable[0].samples[0].x")).toContain(
      "integer",
    );
  });

  test("hex: uppercase or short", () => {
    const sample = (hex: string) => withField("acceptable", [{ samples: [{ x: 0, y: 0, hex }] }]);
    expect(problemWith(sample("#D9822B"), "images[0].acceptable[0].samples[0].hex")).toContain(
      "lowercase",
    );
    expect(problemWith(sample("#fff"), "images[0].acceptable[0].samples[0].hex")).toContain(
      "lowercase",
    );
  });

  test("a duplicate position, even across colors", () => {
    const text = withField("acceptable", [
      { samples: [{ x: 5, y: 5, hex: "#000000" }] },
      { samples: [{ x: 5, y: 5, hex: "#000000" }] },
    ]);
    expect(problemWith(text, "images[0].acceptable[1].samples[0]")).toContain("already used");
  });

  test("several problems are reported together", () => {
    const text = file(
      [{ ...image("dev-001", SHA_A), category: "nope", width: 0 }, { ...image("test-002", "x") }],
      { set: "test" },
    );
    const problems = problemsOf(text);
    expect(problems.length).toBeGreaterThanOrEqual(5);
    expect(problems.some((p) => p.startsWith("set"))).toBe(true);
    expect(problems.some((p) => p.startsWith("images[0].category"))).toBe(true);
    expect(problems.some((p) => p.startsWith("images[1].sha256"))).toBe(true);
  });

  test("the error message lists every problem", () => {
    try {
      parseAnnotationFile(file([], { set: "test", schemaVersion: 3 }), "dev", "dev.json");
    } catch (error) {
      expect((error as Error).message).toContain("dev.json");
      expect((error as Error).message).toContain("schemaVersion");
      expect((error as Error).message).toContain("set");
      return;
    }
    throw new Error("Expected a throw.");
  });
});

describe("ids and updates", () => {
  const withIds = (...numbers: number[]): AnnotationFile => ({
    schemaVersion: 1,
    set: "dev",
    images: numbers.map((n, i) =>
      image(`dev-${String(n).padStart(3, "0")}`, String(i).padStart(64, "0")),
    ),
  });

  test("nextImageId", () => {
    expect(nextImageId(emptyAnnotationFile("dev"))).toBe("dev-001");
    expect(nextImageId(emptyAnnotationFile("test"))).toBe("test-001");
    expect(nextImageId(withIds(7, 12))).toBe("dev-013");
    expect(nextImageId(withIds(999))).toBe("dev-1000");
  });

  test("idNumber", () => {
    expect(idNumber("dev-012")).toBe(12);
    expect(idNumber("test-1000")).toBe(1000);
    expect(() => idNumber("dev-1")).toThrow(RangeError);
  });

  test("upsertAnnotation keeps the id-number order and replaces by hash", () => {
    let current = withIds(9);
    current = upsertAnnotation(current, image("dev-010", SHA_B));
    current = upsertAnnotation(current, image("dev-1000", "c".repeat(64)));
    expect(current.images.map((i) => i.id)).toEqual(["dev-009", "dev-010", "dev-1000"]);
    const replaced = upsertAnnotation(current, image("dev-010", SHA_B, { category: "dark" }));
    expect(replaced.images).toHaveLength(3);
    expect(findAnnotation(replaced, SHA_B)?.category).toBe("dark");
    // The inputs are not modified.
    expect(findAnnotation(current, SHA_B)?.category).toBe("reference");
  });

  test("an id of 10 sorts after 9, not before", () => {
    const sorted = upsertAnnotation(withIds(10), image("dev-009", SHA_A));
    expect(sorted.images.map((i) => i.id)).toEqual(["dev-009", "dev-010"]);
  });

  test("removeAnnotation and findAnnotation", () => {
    const current = upsertAnnotation(emptyAnnotationFile("dev"), image("dev-001", SHA_A));
    expect(findAnnotation(current, SHA_A)?.id).toBe("dev-001");
    expect(findAnnotation(current, SHA_B)).toBeUndefined();
    expect(removeAnnotation(current, SHA_A).images).toEqual([]);
    expect(removeAnnotation(current, SHA_B).images).toHaveLength(1);
  });

  test("cross-set duplicates are found", () => {
    const dev = upsertAnnotation(
      upsertAnnotation(emptyAnnotationFile("dev"), image("dev-001", SHA_A)),
      image("dev-002", SHA_B),
    );
    const test = upsertAnnotation(emptyAnnotationFile("test"), image("test-001", SHA_B));
    expect(crossSetDuplicates(dev, test)).toEqual([SHA_B]);
    expect(crossSetDuplicates(dev, emptyAnnotationFile("test"))).toEqual([]);
  });
});
