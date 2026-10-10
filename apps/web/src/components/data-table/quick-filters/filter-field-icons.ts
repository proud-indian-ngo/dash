import {
  Calendar03Icon,
  HashtagIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";

import { resolveColumnDefId } from "@/lib/table-utils";

import { columnKindIcon } from "../column-kinds";
import { quickFilterKind } from "./quick-filter-model";

const KIND_FALLBACK = {
  date: Calendar03Icon,
  number: HashtagIcon,
  select: Tag01Icon,
} as const;

/**
 * Each filter field's icon: its column's header icon when a column shares the
 * field id, else one by filter type.
 */
export function filterFieldIcons<TData extends object>(
  fields: readonly FilterField[],
  columns: readonly DataGridColumnDef<TData>[]
): Map<string, IconSvgElement> {
  const columnKinds = new Map(
    columns.flatMap((column) => {
      const id = resolveColumnDefId(column);
      const kind = column.meta?.kind;
      return typeof id === "string" && kind ? [[id, kind] as const] : [];
    })
  );
  const icons = new Map<string, IconSvgElement>();
  for (const field of fields) {
    const kind = columnKinds.get(field.id);
    const type = quickFilterKind(field);
    const icon = kind
      ? columnKindIcon(kind)
      : type
        ? KIND_FALLBACK[type]
        : undefined;
    if (icon) {
      icons.set(field.id, icon);
    }
  }
  return icons;
}
