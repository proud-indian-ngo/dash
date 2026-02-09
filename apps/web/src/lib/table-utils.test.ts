import { describe, expect, it } from "vitest";
import { resolveUpdater } from "./table-utils";

describe("resolveUpdater", () => {
  it("returns value directly when updater is a value", () => {
    expect(resolveUpdater(42, 0)).toBe(42);
    expect(resolveUpdater("hello", "prev")).toBe("hello");
    expect(resolveUpdater(true, false)).toBe(true);
  });

  it("calls function with previous value when updater is a function", () => {
    const result = resolveUpdater((prev: number) => prev + 1, 5);
    expect(result).toBe(6);
  });

  it("function updater receives correct previous value", () => {
    const updater = (prev: string) => `${prev}-updated`;
    expect(resolveUpdater(updater, "original")).toBe("original-updated");
  });

  it("works with numbers", () => {
    expect(resolveUpdater(10, 0)).toBe(10);
    expect(resolveUpdater((prev: number) => prev * 2, 7)).toBe(14);
  });

  it("works with strings", () => {
    expect(resolveUpdater("new", "old")).toBe("new");
    expect(resolveUpdater((prev: string) => prev.toUpperCase(), "hello")).toBe(
      "HELLO"
    );
  });

  it("works with objects", () => {
    const obj = { a: 1, b: 2 };
    expect(resolveUpdater(obj, { a: 0, b: 0 })).toBe(obj);

    const result = resolveUpdater(
      (prev: { count: number }) => ({ count: prev.count + 1 }),
      { count: 3 }
    );
    expect(result).toEqual({ count: 4 });
  });

  it("works with arrays", () => {
    const arr = [1, 2, 3];
    expect(resolveUpdater(arr, [])).toBe(arr);

    const result = resolveUpdater((prev: number[]) => [...prev, 4], [1, 2, 3]);
    expect(result).toEqual([1, 2, 3, 4]);
  });
});
