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
import { HugeiconsIcon } from "@hugeicons/react";
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
  kind: DataGridColumnKind
): DataGridColumnDef<TData>["header"] {
  if (typeof header !== "function") {
    return header;
  }
  const icon = <HugeiconsIcon icon={KIND_ICON[kind]} strokeWidth={2} />;
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
 * Turns `meta.kind` into a header icon and, for numbers, dates, IDs and
 * contact details, the data font on the cell.
 */
export function applyColumnKinds<TData extends object>(
  columns: DataGridColumnDef<TData>[]
): DataGridColumnDef<TData>[] {
  return columns.map((column) => {
    const kind = column.meta?.kind;
    if (!kind) {
      return column;
    }
    return {
      ...column,
      header: withHeaderIcon(column.header, kind),
      meta: {
        ...column.meta,
        cellClassName: cn(
          DATA_FONT_KINDS.has(kind) && DATA_FONT_CLASS,
          column.meta?.cellClassName
        ),
      },
    } as DataGridColumnDef<TData>;
  });
}
