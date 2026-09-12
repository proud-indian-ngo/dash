import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { useEffect, useRef, useState } from "react";

import type { SizingColumn } from "./column-fill";

export function getSizingColumns<T extends object>(
  columns: readonly DataGridColumnDef<T>[]
): SizingColumn[] {
  return columns.flatMap((column) => {
    if ("columns" in column && column.columns?.length)
      return getSizingColumns(column.columns);
    const id =
      column.id ??
      ("accessorKey" in column && typeof column.accessorKey === "string"
        ? column.accessorKey.replaceAll(".", "_")
        : typeof column.header === "string"
          ? column.header
          : undefined);
    return id
      ? [
          {
            id,
            size: column.size,
            minSize: column.minSize,
            maxSize: column.maxSize,
          },
        ]
      : [];
  });
}
export function useTableViewportWidth(enabled: boolean) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]"
    );
    if (!viewport) return;
    // Observe available space, never table/scrollWidth (which includes our fill).
    const measure = () => {
      const next = viewport.clientWidth;
      setWidth((previous) => (previous === next ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [enabled]);
  return { scrollAreaRef, viewportWidth: enabled ? width : 0 };
}
