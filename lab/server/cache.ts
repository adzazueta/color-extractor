/**
 * A least-recently-used cache bounded by entry count and by total size. A value larger than
 * `maxBytes` on its own is not stored.
 */
export class LruCache<V> {
  readonly #maxEntries: number;
  readonly #maxBytes: number;
  readonly #sizeOf: (value: V) => number;
  /** Map order is recency order: the first entry is the least recently used. */
  readonly #entries = new Map<string, { readonly value: V; readonly size: number }>();
  #bytes = 0;

  constructor(maxEntries: number, maxBytes: number, sizeOf: (value: V) => number) {
    this.#maxEntries = maxEntries;
    this.#maxBytes = maxBytes;
    this.#sizeOf = sizeOf;
  }

  get size(): number {
    return this.#entries.size;
  }

  get bytes(): number {
    return this.#bytes;
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.delete(key);
    const size = this.#sizeOf(value);
    if (size > this.#maxBytes || this.#maxEntries < 1) return;
    this.#entries.set(key, { value, size });
    this.#bytes += size;
    for (const [oldest, entry] of this.#entries) {
      if (this.#entries.size <= this.#maxEntries && this.#bytes <= this.#maxBytes) break;
      this.#entries.delete(oldest);
      this.#bytes -= entry.size;
    }
  }

  delete(key: string): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) return false;
    this.#entries.delete(key);
    this.#bytes -= entry.size;
    return true;
  }

  clear(): void {
    this.#entries.clear();
    this.#bytes = 0;
  }
}
