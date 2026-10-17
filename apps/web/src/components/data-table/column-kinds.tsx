import {
  BarCode01Icon,
  Calendar03Icon,
  Call02Icon,
  DashedLineCircleIcon,
  HashtagIcon,
  IndianRupeeIcon,
  Link01Icon,
  Location01Icon,
  Mail01Icon,
  Tag01Icon,
  TextIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type {
  DataGridColumnDef,
  DataGridColumnKind,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { cn } from "@pi-dash/design-system/lib/utils";
import { cloneElement, isValidElement } from "react";

const KIND_ICON: Record<DataGridColumnKind, typeof TextIcon> = {
  amount: IndianRupeeIcon,
  count: HashtagIcon,
  date: Calendar03Icon,
  email: Mail01Icon,
  id: BarCode01Icon,
  link: Link01Icon,
  location: Location01Icon,
  person: UserIcon,
  phone: Call02Icon,
  status: DashedLineCircleIcon,
  tag: Tag01Icon,
  text: TextIcon,
};

/** The column's header icon: its own `meta.icon`, else its kind's. */
export function columnIcon<TData extends object>(
  column: DataGridColumnDef<TData>
): IconSvgElement | undefined {
  const kind = column.meta?.kind;
  return column.meta?.icon ?? (kind ? KIND_ICON[kind] : undefined);
}

/** Kinds set in Paper Mono, the data font. */
const DATA_FONT_KINDS = new Set<DataGridColumnKind>([
  "amount",
  "count",
  "date",
  "email",
  "id",
  "phone",
]);

export const DATA_FONT_CLASS = "font-mono text-xs tabular-nums **:text-xs";

function withHeaderIcon<TData extends object>(
  header: DataGridColumnDef<TData>["header"],
  svg: IconSvgElement
): DataGridColumnDef<TData>["header"] {
  if (typeof header !== "function") {
    return header;
  }
  const icon = <HugeiconsIcon icon={svg} strokeWidth={2} />;
  return (context) => {
    const rendered = header(context);
    if (
      isValidElement<{ icon?: unknown }>(rendered) &&
      rendered.props.icon === undefined
    ) {
      return cloneElement(rendered, { icon });
    }
    return rendered;
  };
}

/**
 * Turns `meta.icon` or `meta.kind` into a header icon and, for numbers, dates,
 * IDs and contact details, the data font on the cell.
 */
export function applyColumnKinds<TData extends object>(
  columns: DataGridColumnDef<TData>[]
): DataGridColumnDef<TData>[] {
  return columns.map((column) => {
    const icon = columnIcon(column);
    if (!icon) {
      return column;
    }
    const kind = column.meta?.kind;
    return {
      ...column,
      header: withHeaderIcon(column.header, icon),
      meta: {
        ...column.meta,
        cellClassName: cn(
          kind && DATA_FONT_KINDS.has(kind) && DATA_FONT_CLASS,
          column.meta?.cellClassName
        ),
      },
    } as DataGridColumnDef<TData>;
  });
}
