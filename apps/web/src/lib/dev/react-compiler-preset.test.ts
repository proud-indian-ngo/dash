import { describe, expect, it } from "bun:test";

import { reactCompilerPreset } from "@vitejs/plugin-react";

import { appReactCompilerPreset } from "./react-compiler-preset";

const excluded = (path: string) =>
  appReactCompilerPreset().rolldown.filter.id.exclude.some((pattern) =>
    pattern.test(path)
  );
describe("React Compiler mutable-grid compatibility boundary", () => {
  it("excludes only the two upstream imperative sizing renderers", () => {
    const directory =
      "/workspace/packages/design-system/components/reui/data-grid/";
    expect(excluded(`${directory}data-grid-table.tsx`)).toBe(true);
    expect(excluded(`${directory}data-grid-table-dnd.tsx?version=1`)).toBe(
      true
    );
    expect(
      excluded(
        "C:\\workspace\\packages\\design-system\\components\\reui\\data-grid\\data-grid-table.tsx"
      )
    ).toBe(true);
    for (const file of [
      "data-grid.tsx",
      "data-grid-column-header.tsx",
      "data-grid-pagination.tsx",
      "data-grid-table.test.tsx",
    ])
      expect(excluded(`${directory}${file}`)).toBe(false);
    expect(
      excluded(
        "/workspace/apps/web/src/components/data-table/data-table-wrapper.tsx"
      )
    ).toBe(false);
    expect(
      excluded("/workspace/packages/editor/components/ui/table-node.tsx")
    ).toBe(false);
  });
  it("preserves the normal compiler preset and code filter", () => {
    const preset = appReactCompilerPreset();
    const normal = reactCompilerPreset();
    expect(typeof preset.preset).toBe("function");
    expect(preset.rolldown.optimizeDeps).toEqual(normal.rolldown.optimizeDeps);
    expect(typeof preset.rolldown.applyToEnvironmentHook).toBe("function");
    expect(preset.rolldown.filter.code).toEqual(normal.rolldown.filter?.code);
  });
});
