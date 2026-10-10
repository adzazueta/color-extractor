import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, test } from "vite-plus/test";

interface Entry {
  path: string;
  type: "file" | "directory";
}
interface TarballModule {
  readTarballEntries: (path: string) => Entry[];
  entriesOutsideAllowlist: (entries: Entry[]) => string[];
}

const scripts = new URL("../../../scripts/", import.meta.url);
// A computed specifier keeps TypeScript from asking for declarations of the plain .mjs script.
const specifier = new URL("tarball.mjs", scripts).href;
const { readTarballEntries, entriesOutsideAllowlist } = (await import(specifier)) as TarballModule;

interface Item {
  name: string;
  type?: string;
  body?: string | Buffer;
  prefix?: string;
}

/** A 512-byte ustar header with a correct checksum. */
function header(item: Item, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(item.name, 0, 100, "utf8");
  block.write("0000644\0", 100, "latin1");
  block.write("0000000\0", 108, "latin1");
  block.write("0000000\0", 116, "latin1");
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "latin1");
  block.write("00000000000\0", 136, "latin1");
  block.write("        ", 148, "latin1");
  block.write(item.type ?? "0", 156, "latin1");
  block.write("ustar\0", 257, "latin1");
  block.write("00", 263, "latin1");
  if (item.prefix !== undefined) {
    block.write(item.prefix, 345, 155, "utf8");
  }
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "latin1");
  return block;
}

function pad(body: Buffer): Buffer {
  return Buffer.concat([body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}

function paxRecord(key: string, value: string): string {
  const rest = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(rest) + 1;
  while (Buffer.byteLength(`${length}${rest}`) !== length) length++;
  return `${length}${rest}`;
}

function tar(items: Item[], trailer = true): Buffer {
  const parts: Buffer[] = [];
  for (const item of items) {
    const body = Buffer.from(item.body ?? "");
    parts.push(header(item, body.length), pad(body));
  }
  if (trailer) parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const folder = mkdtempSync(join(tmpdir(), "tarball-test-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

let counter = 0;
function write(content: Buffer, gzip = true): string {
  const path = join(folder, `case-${++counter}.tgz`);
  writeFileSync(path, gzip ? gzipSync(content) : content);
  return path;
}

const file = (name: string, body = "x"): Item => ({ name, body });
const outside = (...paths: string[]) =>
  entriesOutsideAllowlist(paths.map((path) => ({ path, type: "file" as const })));

describe("readTarballEntries", () => {
  test("lists files and directories in archive order", () => {
    const path = write(
      tar([
        { name: "package/", type: "5" },
        file("package/package.json"),
        { name: "package/dist/", type: "5" },
        file("package/dist/a.js"),
      ]),
    );
    expect(readTarballEntries(path)).toEqual([
      { path: "package/", type: "directory" },
      { path: "package/package.json", type: "file" },
      { path: "package/dist/", type: "directory" },
      { path: "package/dist/a.js", type: "file" },
    ]);
  });

  test("reads a path longer than 100 characters from a pax record", () => {
    const long = `package/dist/${"d".repeat(60)}/${"f".repeat(60)}.js`;
    const path = write(
      tar([
        { name: "PaxHeader", type: "x", body: paxRecord("path", long) },
        { name: long.slice(0, 100), body: "x" },
        file("package/README.md"),
      ]),
    );
    expect(readTarballEntries(path).map((entry) => entry.path)).toEqual([
      long,
      "package/README.md",
    ]);
  });

  test("joins a ustar prefix and a name", () => {
    const path = write(tar([{ name: "b.js", prefix: "package/dist/deep", body: "x" }]));
    expect(readTarballEntries(path)).toEqual([{ path: "package/dist/deep/b.js", type: "file" }]);
  });

  test("reads a GNU long name and skips global pax headers", () => {
    const long = `package/dist/${"g".repeat(120)}.js`;
    const path = write(
      tar([
        { name: "global", type: "g", body: paxRecord("comment", "hi") },
        { name: "././@LongLink", type: "L", body: `${long}\0` },
        file("truncated-name"),
      ]),
    );
    expect(readTarballEntries(path)).toEqual([{ path: long, type: "file" }]);
  });

  test("throws on a corrupted header checksum", () => {
    const content = tar([file("package/package.json")]);
    content.write("X", 3, "latin1"); // changes the name after the checksum was computed
    expect(() => readTarballEntries(write(content))).toThrow(/checksum/);
  });

  test("throws on a symlink entry", () => {
    const path = write(tar([{ name: "package/dist/link", type: "2" }]));
    expect(() => readTarballEntries(path)).toThrow(/Unsupported entry type "2"/);
  });

  test("throws on a hard link entry", () => {
    const path = write(tar([{ name: "package/dist/link", type: "1" }]));
    expect(() => readTarballEntries(path)).toThrow(/Unsupported entry type "1"/);
  });

  test("throws on a base-256 size", () => {
    const content = tar([file("package/package.json")]);
    content[124] = 0x80;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : content[i]!;
    content.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "latin1");
    expect(() => readTarballEntries(write(content))).toThrow(/size/);
  });

  test("throws on a truncated body", () => {
    const content = tar([file("package/dist/a.js", "y".repeat(2000))], false);
    expect(() => readTarballEntries(write(content.subarray(0, 512 + 600)))).toThrow(
      /middle of an entry/,
    );
  });

  test("throws on a truncated header", () => {
    const content = tar([file("package/package.json"), file("package/dist/a.js")], false);
    expect(() => readTarballEntries(write(content.subarray(0, 1024 + 100)))).toThrow(
      /middle of a header/,
    );
  });

  test("throws on a file that is not gzip", () => {
    expect(() => readTarballEntries(write(tar([file("package/package.json")]), false))).toThrow();
  });
});

describe("entriesOutsideAllowlist", () => {
  test("accepts the allowed files and directories", () => {
    expect(
      entriesOutsideAllowlist([
        { path: "package/", type: "directory" },
        { path: "package/dist/", type: "directory" },
        { path: "package/dist/sub", type: "directory" },
        { path: "package/dist/sub/", type: "directory" },
        { path: "package/package.json", type: "file" },
        { path: "package/dist/a.js", type: "file" },
        { path: "package/dist/sub/b.d.ts", type: "file" },
        { path: "package/README.md", type: "file" },
        { path: "package/LICENSE", type: "file" },
        { path: "package/CHANGELOG.md", type: "file" },
      ]),
    ).toEqual([]);
  });

  test("reports everything else, in archive order", () => {
    const paths = [
      "package/eval/annotations/dev.json",
      "package/lab/index.html",
      "package/._package.json",
      "package/../x",
      "package/dist/../x",
      "package/dist//a.js",
      "package/dist/./a.js",
      "package/LICENSE.md",
      "package/readme.md",
      "package/dist",
      "package/sub/package.json",
      "other/package.json",
      "/package/package.json",
      "package.json",
    ];
    expect(outside(...paths)).toEqual(paths);
  });

  test("rejects directories outside package/ and package/dist/", () => {
    expect(
      entriesOutsideAllowlist([
        { path: "package/eval/", type: "directory" },
        { path: "package/dist/../eval/", type: "directory" },
        { path: "package/distribution/", type: "directory" },
        { path: "other/", type: "directory" },
      ]),
    ).toHaveLength(4);
  });
});

describe("scripts/smoke.mjs", () => {
  test("fails at step 2, naming the file, before any npm call", () => {
    const bad = write(
      tar([
        file("package/package.json", "{}"),
        file("package/dist/a.js"),
        file("package/eval/annotations/dev.json", "{}"),
      ]),
    );
    const env = { ...process.env };
    delete env.SMOKE_EXPECTED_NODE;
    const result = spawnSync(process.execPath, [new URL("smoke.mjs", scripts).pathname, bad], {
      encoding: "utf8",
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("FAILED at step 2");
    expect(result.stderr).toContain("package/eval/annotations/dev.json");
    expect(result.stdout).not.toContain("[smoke 3]");
  });
});
