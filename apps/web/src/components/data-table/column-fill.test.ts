import { describe, expect, it } from "bun:test";

import {
  applyPreferredSizingChange,
  deriveColumnFill,
  type SizingColumn,
} from "./column-fill";
import { getSizingColumns } from "./use-column-fill";
const columns: SizingColumn[] = [
  { id: "a", size: 120 },
  { id: "b", size: 150 },
  { id: "actions", size: 50 },
];
function fill(overrides: Partial<Parameters<typeof deriveColumnFill>[0]> = {}) {
  return deriveColumnFill({
    columns,
    preferred: {},
    order: [],
    visibility: {},
    pinning: { end: ["actions"] },
    viewportWidth: 600,
    ...overrides,
  });
}
describe("Explicit last-unpinned column fill", () => {
  it("adds all spare width to just the final unpinned column", () => {
    const result = fill();
    expect(result.fillerId).toBe("b");
    expect(result.effective).toEqual({ b: 430 });
    expect(result.fillerMinimum).toBe(430);
  });
  it("recalculates for visibility, ordering and pinning while pinned sizes stay fixed", () => {
    expect(fill({ visibility: { b: false } }).effective).toEqual({ a: 550 });
    expect(fill({ order: ["b", "a", "actions"] }).effective).toEqual({
      a: 400,
    });
    expect(
      fill({ pinning: { start: ["b"], end: ["actions"] } }).effective
    ).toEqual({ a: 400 });
    expect(fill({ visibility: { actions: false } }).effective).toEqual({
      b: 480,
    });
  });
  it("does not fill pinned columns when no unpinned column remains", () => {
    const preferred = { a: 130 };
    const result = fill({
      preferred,
      pinning: { start: ["a", "b"], end: ["actions"] },
    });
    expect(result.fillerId).toBeUndefined();
    expect(result.effective).toBe(preferred);
  });
  it("preserves preferred widths on viewport changes and permits overflow", () => {
    const preferred = Object.freeze({ a: 200, b: 250 });
    expect(fill({ preferred, viewportWidth: 800 }).effective).toEqual({
      a: 200,
      b: 550,
    });
    expect(fill({ preferred, viewportWidth: 400 }).effective).toBe(preferred);
    expect(fill({ preferred, viewportWidth: 0 }).effective).toBe(preferred);
    expect(preferred).toEqual({ a: 200, b: 250 });
  });
  it("honors limits and leaves spare room rather than stretching another column", () => {
    const limited = [
      { id: "a", size: 120 },
      { id: "b", size: 150, maxSize: 300 },
      { id: "actions", size: 50 },
    ];
    expect(fill({ columns: limited }).effective).toEqual({ b: 300 });
    const minimum = fill({
      columns: [{ id: "a", size: 100, minSize: 80 }],
      viewportWidth: 40,
    });
    expect(minimum.fillerMinimum).toBe(80);
  });
  it("resolves actual leaf IDs and leaf bounds for nested definitions", () => {
    expect(
      getSizingColumns<{ name: string }>([
        {
          id: "group",
          columns: [
            { accessorKey: "name", size: 160, minSize: 60, maxSize: 400 },
          ],
        },
      ])
    ).toEqual([{ id: "name", size: 160, minSize: 60, maxSize: 400 }]);
  });
});
describe("Persisting user preferences rather than derived fill", () => {
  it("persists a resized neighbor only, allowing just the filler to absorb slack", () => {
    const preferred = {};
    const result = applyPreferredSizingChange(preferred, fill(), (old) => ({
      ...old,
      a: 200,
    }));
    expect(result).toEqual({ a: 200 });
    expect(fill({ preferred: result }).effective).toEqual({ a: 200, b: 350 });
    expect(preferred).toEqual({});
  });
  it("starts a filler drag at its visible width and grows directly into overflow", () => {
    const preferred = applyPreferredSizingChange({}, fill(), (old) => ({
      ...old,
      b: 510,
    }));
    expect(preferred).toEqual({ b: 510 });
    expect(fill({ preferred }).effective).toBe(preferred);
  });
  it("does not save the fill when a shrink gesture cannot pass its dynamic minimum", () => {
    const preferred = {};
    expect(
      applyPreferredSizingChange(preferred, fill(), (old) => ({
        ...old,
        b: 350,
      }))
    ).toBe(preferred);
  });
  it("shrinks an overflowing filler down to the remaining-space floor without a release jump", () => {
    const preferred = { b: 510 };
    const changed = applyPreferredSizingChange(
      preferred,
      fill({ preferred }),
      (old) => ({ ...old, b: 350 })
    );
    expect(changed).toEqual({ b: 430 });
    expect(fill({ preferred: changed }).effective).toEqual(changed);
  });
  it("retains hidden preferences and supports explicit reset without copying the filler", () => {
    const preferred = { a: 200, hidden: 91 };
    const result = applyPreferredSizingChange(
      preferred,
      fill({ preferred }),
      (old) => {
        const { a: _removed, ...rest } = old;
        return rest;
      }
    );
    expect(result).toEqual({ hidden: 91 });
    expect(fill({ preferred: result }).effective).toEqual({
      hidden: 91,
      b: 430,
    });
  });
  it("does not persist a no-op against a width already clamped by column bounds", () => {
    const preferred = { b: 600 };
    const constrained = fill({
      preferred,
      columns: [columns[0]!, { id: "b", size: 150, maxSize: 300 }, columns[2]!],
    });
    expect(
      applyPreferredSizingChange(preferred, constrained, (old) => ({
        ...old,
        b: 250,
      }))
    ).toBe(preferred);
  });
  it("clamps explicit user widths to min/max", () => {
    const limited = fill({
      columns: [
        { id: "a", size: 120, minSize: 100, maxSize: 180 },
        ...columns.slice(1),
      ],
    });
    expect(
      applyPreferredSizingChange({}, limited, (old) => ({ ...old, a: 500 }))
    ).toEqual({ a: 180 });
    expect(
      applyPreferredSizingChange({}, limited, (old) => ({ ...old, a: 5 }))
    ).toEqual({ a: 100 });
  });
});
