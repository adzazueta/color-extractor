import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { DecodedImage } from "../../eval/lib/analyze.js";
import { loadAnnotations, sha256Hex } from "../../eval/lib/annotation-files.js";
import type { AnnotationFile, SetName } from "../../eval/lib/annotation-schema.js";
import { scanEvalDir, type DiscoveredImage, type Inventory } from "../../eval/lib/discover.js";
import { annotationsPath, reportsRoot } from "../../eval/lib/locate.js";
import { listReports } from "../../eval/lib/report-schema.js";
import { LruCache } from "./cache.js";
import type { Analyzer } from "./handler.js";
import { HttpError } from "./http.js";
import type { Limiter } from "./limit.js";

export const DECODED_CACHE_ENTRIES: number = 4;
export const DECODED_CACHE_BYTES: number = 512 * 1024 * 1024;
export const PNG_CACHE_ENTRIES: number = 8;
export const PNG_CACHE_BYTES: number = 256 * 1024 * 1024;

export interface ScanResult {
  /** Null when the scan failed. */
  readonly inventory: Inventory | null;
  /** Why the scan failed (a missing evaluation folder, for example). */
  readonly error: string | null;
}

export interface FoundImage {
  /** For a hash in both dev/ and test/, the test copy: the blind rules win. */
  readonly image: DiscoveredImage;
  /** The same file is in dev/ and test/. */
  readonly conflict: boolean;
}

export interface TestLocks {
  /** Hashes of every image in a stored test report. */
  readonly hashes: ReadonlySet<string>;
  /** Stored test reports that cannot be read. While there is one, every test image is locked. */
  readonly problems: readonly string[];
}

export interface DecodedEntry {
  readonly image: DecodedImage;
  /** How long the decode took. */
  readonly milliseconds: number;
}

export interface LabState {
  /** Scans the evaluation folder (joining a scan already running). */
  scan(): Promise<ScanResult>;
  /** Looks the hash up in the latest scan, rescanning once when it is unknown. */
  find(sha256: string): Promise<FoundImage | undefined>;
  /** Reads the annotation file of a set from disk. Throws AnnotationError for an invalid file. */
  loadAnnotations(set: SetName): Promise<AnnotationFile>;
  /** Runs `fn` after every earlier `fn` of the same set has settled. */
  withFileLock<T>(set: SetName, fn: () => Promise<T>): Promise<T>;
  /** Reads the stored test reports. */
  testLocks(): Promise<TestLocks>;
  /** The decoded pixels, from the cache or from one decode shared by concurrent callers. */
  decoded(image: DiscoveredImage): Promise<DecodedEntry>;
  /** The display PNG of the decoded pixels, from the cache or encoded now. */
  png(image: DiscoveredImage): Promise<Uint8Array>;
  /** Clears the decoded-image and PNG caches; decodes already running are not cached. */
  invalidate(): void;
  /** Invalidates and refuses every later job. */
  close(): void;
}

export interface LabStateContext {
  readonly root: string;
  readonly evalDir: string;
  readonly loadAnalyzer: () => Promise<Analyzer>;
  readonly limiter: Limiter;
}

/** A hash cache that keeps only the entries the current scan uses, so it stays bounded. */
class ScanHashCache extends Map<string, string> {
  readonly #previous: ReadonlyMap<string, string>;

  constructor(previous: ReadonlyMap<string, string>) {
    super();
    this.#previous = previous;
  }

  override get(key: string): string | undefined {
    const value = super.get(key) ?? this.#previous.get(key);
    if (value !== undefined) super.set(key, value);
    return value;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createLabState(context: LabStateContext): LabState {
  const { root, evalDir, loadAnalyzer, limiter } = context;

  let hashCache: ReadonlyMap<string, string> = new Map();
  let latest: ReadonlyMap<string, FoundImage> | null = null;
  let scanning: Promise<ScanResult> | null = null;

  const fileLocks: Record<SetName, Promise<unknown>> = {
    dev: Promise.resolve(),
    test: Promise.resolve(),
  };

  let generation = 0;
  const decodedCache = new LruCache<DecodedEntry>(
    DECODED_CACHE_ENTRIES,
    DECODED_CACHE_BYTES,
    (entry) => entry.image.data.byteLength,
  );
  const pngCache = new LruCache<Uint8Array>(
    PNG_CACHE_ENTRIES,
    PNG_CACHE_BYTES,
    (png) => png.byteLength,
  );
  const decoding = new Map<string, Promise<DecodedEntry>>();

  async function runScan(): Promise<ScanResult> {
    const cache = new ScanHashCache(hashCache);
    try {
      const inventory = await scanEvalDir(evalDir, { hashCache: cache });
      hashCache = cache;
      const conflicts = new Set(inventory.conflicts.map((conflict) => conflict.sha256));
      const found = new Map<string, FoundImage>();
      for (const set of ["dev", "test"] as const) {
        for (const image of inventory.images[set]) {
          found.set(image.sha256, { image, conflict: conflicts.has(image.sha256) });
        }
      }
      latest = found;
      return { inventory, error: null };
    } catch (error) {
      latest = new Map();
      return { inventory: null, error: message(error) };
    }
  }

  function scan(): Promise<ScanResult> {
    if (scanning === null) {
      scanning = runScan().finally(() => {
        scanning = null;
      });
    }
    return scanning;
  }

  async function find(sha256: string): Promise<FoundImage | undefined> {
    const known = latest?.get(sha256);
    if (known !== undefined) return known;
    await scan();
    return latest?.get(sha256);
  }

  function withFileLock<T>(set: SetName, fn: () => Promise<T>): Promise<T> {
    const result = fileLocks[set].then(fn);
    fileLocks[set] = result.catch(() => undefined);
    return result;
  }

  async function testLocks(): Promise<TestLocks> {
    const folder = reportsRoot(root);
    let listed;
    try {
      listed = await listReports(folder, "test");
    } catch (error) {
      return { hashes: new Set(), problems: [`${folder}: ${message(error)}`] };
    }
    const hashes = new Set<string>();
    for (const { report } of listed.reports) {
      for (const image of report.images) hashes.add(image.sha256);
    }
    return { hashes, problems: listed.problems };
  }

  async function decode(image: DiscoveredImage): Promise<DecodedEntry> {
    const analyzer = await loadAnalyzer();
    return limiter.run(async () => {
      const bytes = await readFile(image.path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        throw new HttpError(404, "The image is no longer in the evaluation folder.");
      });
      if (sha256Hex(bytes) !== image.sha256) {
        throw new HttpError(404, "The image changed on disk. Reload the inventory.");
      }
      const start = performance.now();
      const decoded = await analyzer.decodeEvalImage(bytes);
      return { image: decoded, milliseconds: performance.now() - start };
    });
  }

  function decoded(image: DiscoveredImage): Promise<DecodedEntry> {
    const cached = decodedCache.get(image.sha256);
    if (cached !== undefined) return Promise.resolve(cached);
    const running = decoding.get(image.sha256);
    if (running !== undefined) return running;
    const started = generation;
    const promise = decode(image)
      .then((entry) => {
        if (generation === started) decodedCache.set(image.sha256, entry);
        return entry;
      })
      .finally(() => {
        if (decoding.get(image.sha256) === promise) decoding.delete(image.sha256);
      });
    decoding.set(image.sha256, promise);
    return promise;
  }

  async function png(image: DiscoveredImage): Promise<Uint8Array> {
    const cached = pngCache.get(image.sha256);
    if (cached !== undefined) return cached;
    const started = generation;
    const entry = await decoded(image);
    const analyzer = await loadAnalyzer();
    const bytes = await limiter.run(() => analyzer.encodeDisplayPng(entry.image));
    if (generation === started) pngCache.set(image.sha256, bytes);
    return bytes;
  }

  function invalidate(): void {
    generation += 1;
    decodedCache.clear();
    pngCache.clear();
    decoding.clear();
  }

  return {
    scan,
    find,
    loadAnnotations: async (set) => (await loadAnnotations(annotationsPath(root, set), set)).file,
    withFileLock,
    testLocks,
    decoded,
    png,
    invalidate,
    close() {
      invalidate();
      limiter.close();
    },
  };
}
