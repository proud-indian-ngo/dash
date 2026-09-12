// ReUI's separator extends eight pixels into the next header. Its center can
// therefore hit that header's stacking context instead of starting a resize.
// Keep the hit area inside its own header and the visible line at the boundary.
// Resizable tables must honor modeled widths rather than stretch their cells:
// resizing and sticky pin offsets both use those same modeled pixel sizes.
export function getDataTableClassNames(columnsResizable?: boolean) {
  if (!columnsResizable) return undefined;
  return {
    base: "min-w-0 [&_thead_.cursor-col-resize]:end-0 [&_thead_.cursor-col-resize]:before:end-0 [&_thead_.cursor-col-resize]:before:translate-x-0",
  };
}
