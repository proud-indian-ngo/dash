import type {
  DataGridRow,
  DataGridTableInstance,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";

import { formatINR } from "@/lib/form-schemas";

import { DATA_FONT_CLASS } from "./column-kinds";

/** Sums each listed column over `rows`, skipping values that are not numbers. */
export function sumColumns<TData extends object>(
  rows: readonly DataGridRow<TData>[],
  columnIds: readonly string[]
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const id of columnIds) {
    let sum = 0;
    for (const row of rows) {
      const value = Number(row.getValue(id));
      if (Number.isFinite(value)) {
        sum += value;
      }
    }
    sums.set(id, sum);
  }
  return sums;
}

interface MeasuredCell {
  pinned: boolean;
  style: CSSProperties;
}

/**
 * Reads the rendered header cells so the totals row matches widths and pinned
 * offsets whether the browser or the resize model sized the columns.
 */
function measureHeader(area: HTMLElement): {
  cells: MeasuredCell[];
  width: number;
} | null {
  const headerTable = area.querySelector<HTMLTableElement>("table");
  const headers = headerTable?.querySelectorAll<HTMLTableCellElement>(
    "thead tr:last-child > th"
  );
  if (!(headerTable && headers?.length)) {
    return null;
  }
  return {
    cells: [...headers].map((th) => ({
      pinned: Boolean(th.dataset.pinned),
      style: {
        insetInlineEnd: th.style.insetInlineEnd || undefined,
        insetInlineStart: th.style.insetInlineStart || undefined,
        position: th.dataset.pinned ? "sticky" : undefined,
        width: th.getBoundingClientRect().width,
        zIndex: th.dataset.pinned ? 1 : undefined,
      },
    })),
    width: headerTable.getBoundingClientRect().width,
  };
}

/**
 * A one-row table under the grid with the row count and ₹ sums, aligned to the
 * grid's columns. Lives in the grid's scroll area so it scrolls with it.
 */
export function DataTableTotals<TData extends object>({
  areaRef,
  rows,
  table,
  totals,
}: {
  areaRef: RefObject<HTMLElement | null>;
  rows: readonly DataGridRow<TData>[];
  table: DataGridTableInstance<TData>;
  totals: readonly string[];
}) {
  const [layout, setLayout] = useState<ReturnType<typeof measureHeader>>(null);
  const columnIds = table.getVisibleLeafColumns().map((column) => column.id);
  const layoutKey = columnIds.join(",");

  useEffect(() => {
    const area = areaRef.current;
    const head = area?.querySelector("thead");
    if (!(area && head)) {
      return;
    }
    const update = () => setLayout(measureHeader(area));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    return () => observer.disconnect();
  }, [areaRef, layoutKey]);

  if (!layout || layout.cells.length !== columnIds.length) {
    return null;
  }

  const sums = sumColumns(rows, totals);
  const labelIndex = columnIds.findIndex(
    (id) => id !== "select" && !totals.includes(id)
  );
  const content = (id: string, index: number): ReactNode => {
    const sum = sums.get(id);
    if (sum !== undefined) {
      return formatINR(sum);
    }
    if (index === labelIndex) {
      return `${rows.length} ${rows.length === 1 ? "row" : "rows"}`;
    }
    return null;
  };

  return (
    <table
      className="table-fixed border-separate border-spacing-0 text-sm"
      data-slot="data-grid-totals"
      // Not a second table or an extra row for locators and screen readers;
      // the text still reads.
      role="presentation"
      style={{ width: layout.width }}
    >
      <tbody>
        <tr>
          {columnIds.map((id, index) => (
            <td
              className={cn(
                "text-muted-foreground h-9 truncate border-t px-3 py-1",
                layout.cells[index]?.pinned ? "bg-muted" : "bg-muted/40",
                sums.has(id) &&
                  cn(DATA_FONT_CLASS, "text-foreground font-semibold")
              )}
              key={id}
              style={layout.cells[index]?.style}
            >
              {content(id, index)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
