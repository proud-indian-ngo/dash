import { describe, expect, it } from "bun:test";

import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  it("returns values until they expire", () => {
    const cache = createTtlCache<number>({ maxEntries: 10, ttlMs: 1000 });
    cache.set("a", 1, 0);
    expect(cache.get("a", 999)).toBe(1);
    expect(cache.get("a", 1000)).toBeUndefined();
  });

  it("drops the oldest entry at the cap", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 1000 });
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("c", 3, 0);
    expect(cache.get("a", 1)).toBeUndefined();
    expect(cache.get("b", 1)).toBe(2);
    expect(cache.get("c", 1)).toBe(3);
  });
});
