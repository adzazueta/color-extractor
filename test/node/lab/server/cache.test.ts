import { expect, test } from "vite-plus/test";
import { LruCache } from "../../../../lab/server/cache.js";

const sized = (maxEntries: number, maxBytes: number) =>
  new LruCache<string>(maxEntries, maxBytes, (value) => value.length);

test("evicts the least recently used entry beyond the entry limit", () => {
  const cache = sized(2, 100);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.set("c", "3");
  expect(cache.get("a")).toBeUndefined();
  expect(cache.get("b")).toBe("2");
  expect(cache.get("c")).toBe("3");
  expect(cache.size).toBe(2);
});

test("a get makes an entry recent", () => {
  const cache = sized(2, 100);
  cache.set("a", "1");
  cache.set("b", "2");
  expect(cache.get("a")).toBe("1");
  cache.set("c", "3");
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")).toBe("1");
  expect(cache.get("c")).toBe("3");
});

test("evicts by total size, oldest first", () => {
  const cache = sized(10, 10);
  cache.set("a", "xxxx");
  cache.set("b", "xxxx");
  expect(cache.bytes).toBe(8);
  cache.set("c", "xxxx");
  expect(cache.get("a")).toBeUndefined();
  expect(cache.get("b")).toBe("xxxx");
  expect(cache.get("c")).toBe("xxxx");
  expect(cache.bytes).toBe(8);
  cache.set("d", "xxxxxxxxx");
  expect([cache.get("b"), cache.get("c")]).toEqual([undefined, undefined]);
  expect(cache.get("d")).toBe("xxxxxxxxx");
  expect(cache.bytes).toBe(9);
});

test("a value larger than the byte limit is not stored and evicts nothing", () => {
  const cache = sized(10, 10);
  cache.set("a", "x");
  cache.set("big", "x".repeat(11));
  expect(cache.get("big")).toBeUndefined();
  expect(cache.get("a")).toBe("x");
  expect(cache.bytes).toBe(1);
});

test("replacing a key updates its size and recency", () => {
  const cache = sized(2, 100);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.set("a", "333");
  expect(cache.bytes).toBe(4);
  cache.set("c", "4");
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")).toBe("333");
});

test("delete and clear", () => {
  const cache = sized(4, 100);
  cache.set("a", "11");
  cache.set("b", "2");
  expect(cache.delete("a")).toBe(true);
  expect(cache.delete("a")).toBe(false);
  expect([cache.size, cache.bytes]).toEqual([1, 1]);
  cache.clear();
  expect([cache.size, cache.bytes]).toEqual([0, 0]);
  expect(cache.get("b")).toBeUndefined();
});
