import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import {
  crossSetDuplicates,
  parseAnnotationFile,
  SET_NAMES,
  serializeAnnotationFile,
} from "../../../eval/lib/annotation-schema.js";
import { annotationsPath, repositoryRoot } from "../../../eval/lib/locate.js";

// The annotation files are excluded from `vp fmt`, so this is the guard against bad hand edits.
const root = repositoryRoot();

test.each(SET_NAMES)("the committed %s annotations are valid and canonical", (set) => {
  const path = annotationsPath(root, set);
  const text = readFileSync(path, "utf8");
  const file = parseAnnotationFile(text, set, path);
  expect(serializeAnnotationFile(file)).toBe(text);
});

test("no image is annotated in both sets", () => {
  const [dev, test_] = SET_NAMES.map((set) => {
    const path = annotationsPath(root, set);
    return parseAnnotationFile(readFileSync(path, "utf8"), set, path);
  });
  expect(crossSetDuplicates(dev!, test_!)).toEqual([]);
});
