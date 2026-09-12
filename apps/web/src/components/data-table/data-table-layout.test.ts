import { describe, expect, it } from "bun:test";

import { cn } from "@pi-dash/design-system/lib/utils";

import { getDataTableClassNames } from "./data-table-layout";

describe("Resizable table header hit area", () => {
  it("moves the separator inside its header without moving the boundary line", () => {
    const classes = getDataTableClassNames(true)?.base.split(" ");
    expect(classes).toEqual([
      "min-w-0",
      "[&_thead_.cursor-col-resize]:end-0",
      "[&_thead_.cursor-col-resize]:before:end-0",
      "[&_thead_.cursor-col-resize]:before:translate-x-0",
    ]);
  });
  it("overrides the upstream minimum only when resizing is enabled", () => {
    const defaults = "w-full min-w-full table-fixed";
    const resizable = cn(defaults, getDataTableClassNames(true)?.base).split(
      " "
    );
    expect(resizable).toContain("min-w-0");
    expect(resizable).not.toContain("min-w-full");
    expect(cn(defaults, getDataTableClassNames(false)?.base)).toBe(defaults);
  });
  it("leaves non-resizable tables full-width without changing stacking", () => {
    expect(getDataTableClassNames(false)).toBeUndefined();
    expect(getDataTableClassNames()).toBeUndefined();
    expect(getDataTableClassNames(true)?.base).toContain("min-w-0");
    expect(getDataTableClassNames(true)?.base).not.toContain(":z-");
  });
});
