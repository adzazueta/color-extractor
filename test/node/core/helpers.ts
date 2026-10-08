const view = new DataView(new ArrayBuffer(8));

/** Exact bit pattern of a double as 16 lowercase hex digits (big-endian, platform independent). */
export function toHex(value: number): string {
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false).toString(16).padStart(16, "0");
}

/** Bit pattern of a double as a BigInt. */
export function toBits(value: number): bigint {
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

/**
 * Distance in units in the last place between two finite doubles of the same sign, from their
 * bit patterns. Adjacent doubles are 1 apart.
 */
export function ulpDistance(a: number, b: number): bigint {
  const x = toBits(a);
  const y = toBits(b);
  return x > y ? x - y : y - x;
}

/**
 * Streaming 64-bit digest made of two independent 32-bit FNV-1a style lanes. Words are fed from
 * the bit patterns of doubles, so any single-bit difference changes the digest.
 */
const LOW_FIRST = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export class Digest {
  #a = 0x811c9dc5;
  #b = 0x01000193 ^ 0xdeadbeef;
  #words = new Uint32Array(2);
  #doubles = new Float64Array(this.#words.buffer);

  addWord(word: number): void {
    this.#a = Math.imul(this.#a ^ word, 0x01000193);
    this.#b = Math.imul(this.#b ^ ((word << 13) | (word >>> 19)), 0x85ebca6b);
    this.#b ^= this.#b >>> 15;
  }

  addDouble(value: number): void {
    this.#doubles[0] = value;
    // The word order depends on the platform's endianness; normalize to little-endian order.
    this.addWord(this.#words[LOW_FIRST ? 0 : 1]!);
    this.addWord(this.#words[LOW_FIRST ? 1 : 0]!);
  }

  hex(): string {
    return (
      (this.#a >>> 0).toString(16).padStart(8, "0") + (this.#b >>> 0).toString(16).padStart(8, "0")
    );
  }
}

/** Small deterministic generator (mulberry32) for fixed pseudo-random samples. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a positive double from its high and low 32-bit words. */
export function fromWords(high: number, low: number): number {
  view.setUint32(0, high >>> 0, false);
  view.setUint32(4, low >>> 0, false);
  return view.getFloat64(0, false);
}
