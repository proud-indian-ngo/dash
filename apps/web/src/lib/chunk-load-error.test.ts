import { describe, expect, it } from "bun:test";

import { isChunkLoadError, reloadForChunkError } from "./chunk-load-error";

const APP_CHUNK =
  "Failed to fetch dynamically imported module: https://dash.example.org/assets/_app-a1.js";
const EDITOR_CHUNK =
  "Failed to fetch dynamically imported module: https://dash.example.org/assets/editor-b2.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function counter() {
  const calls = { count: 0 };
  return {
    calls,
    reload: () => {
      calls.count += 1;
    },
  };
}

describe("isChunkLoadError", () => {
  it.each([
    APP_CHUNK,
    "error loading dynamically imported module: https://x/assets/_app-a.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/index-a.css",
  ])("recognises %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("recognises non-Error values carrying the message", () => {
    expect(isChunkLoadError(APP_CHUNK)).toBe(true);
    expect(isChunkLoadError({ message: APP_CHUNK })).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("reloadForChunkError", () => {
  it("reloads the first time a chunk fails", () => {
    const { calls, reload } = counter();
    const storage = memoryStorage();
    expect(
      reloadForChunkError(new TypeError(APP_CHUNK), () => storage, reload)
    ).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("does not reload twice for the same chunk, however much later", () => {
    const { calls, reload } = counter();
    const storage = memoryStorage();
    reloadForChunkError(new TypeError(APP_CHUNK), () => storage, reload);
    expect(
      reloadForChunkError(new TypeError(APP_CHUNK), () => storage, reload)
    ).toBe(false);
    expect(calls.count).toBe(1);
  });

  it("reloads again for a different chunk", () => {
    const { calls, reload } = counter();
    const storage = memoryStorage();
    reloadForChunkError(new TypeError(APP_CHUNK), () => storage, reload);
    expect(
      reloadForChunkError(new TypeError(EDITOR_CHUNK), () => storage, reload)
    ).toBe(true);
    expect(calls.count).toBe(2);
  });

  it("does not reload when storage is unavailable", () => {
    const { calls, reload } = counter();
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    expect(reloadForChunkError(new TypeError(APP_CHUNK), blocked, reload)).toBe(
      false
    );
    expect(calls.count).toBe(0);
  });

  it("does not reload when the record cannot be written", () => {
    const { calls, reload } = counter();
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(
      reloadForChunkError(new TypeError(APP_CHUNK), () => full, reload)
    ).toBe(false);
    expect(calls.count).toBe(0);
  });

  it("treats a corrupt record as empty", () => {
    for (const record of ["{not json", '{"a":1}']) {
      const { calls, reload } = counter();
      const storage = memoryStorage();
      storage.setItem("pi-dash:chunk-reloaded", record);
      expect(
        reloadForChunkError(new TypeError(APP_CHUNK), () => storage, reload)
      ).toBe(true);
      expect(
        reloadForChunkError(new TypeError(APP_CHUNK), () => storage, reload)
      ).toBe(false);
      expect(calls.count).toBe(1);
    }
  });
});
