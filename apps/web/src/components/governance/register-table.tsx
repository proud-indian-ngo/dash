import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  boardOn,
  isEvidenced,
  lastDayOf,
  type RegisterInput,
  TRUSTEE_OFFICE_LABELS,
  TRUSTEE_TERM_BASIS_LABELS,
} from "@pi-dash/shared/governance";
import { useState } from "react";

import { useCompactTable } from "@/components/data-table/data-table-compact";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { selectField } from "@/components/data-table/filter-fields";
import { Calendar } from "@/components/shared/calendar";
import { ResponsivePicker } from "@/components/shared/responsive-picker";
import { StatusBadge, Tag } from "@/components/shared/status-badge";

import {
  dateToIso,
  formatIso,
  isoToDate,
  type RegisterTrustee,
} from "./register-data";

interface RegisterRow {
  id: string;
  offices: string[];
  standing: "board" | "off";
  term: RegisterTrustee["terms"][number] | null;
  trustee: RegisterTrustee;
  unevidenced: number;
}

const FILTER_FIELDS = [
  selectField("standing", "Board", [
    { label: "On the board", value: "board" },
    { label: "Not on the board", value: "off" },
  ]),
  selectField("evidence", "Evidence", [
    { label: "Unevidenced dates", value: "missing" },
    { label: "Evidenced", value: "complete" },
  ]),
];

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-28" />;
const SKELETON_BADGE = <Skeleton className="h-5 w-24" />;

/** The deed was registered on this day; the register starts here. */
const REGISTER_START = new Date(2019, 2, 16);

function termText(term: RegisterTrustee["terms"][number]): string {
  const last = lastDayOf(term);
  if (last) {
    return `${formatIso(term.startsOn)} to ${formatIso(last)}`;
  }
  return `From ${formatIso(term.startsOn)}, for life`;
}

function unevidencedCount(trustee: RegisterTrustee): number {
  return [...trustee.terms, ...trustee.offices].filter((row) => {
    const evidence = isEvidenced(row);
    return !(evidence.start && evidence.end);
  }).length;
}

function getValue(row: RegisterRow, path: string[]): unknown {
  const [key] = path;
  if (key === "standing") {
    return row.standing;
  }
  if (key === "evidence") {
    return row.unevidenced > 0 ? "missing" : "complete";
  }
  return;
}

function searchRow(row: RegisterRow, query: string): boolean {
  return [row.trustee.legalName, ...row.offices]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function getRowId(row: RegisterRow): string {
  return row.id;
}

// A phone card leaves out the offices of a trustee who holds none.
function OfficesCell({ offices }: { offices: string[] }) {
  const compact = useCompactTable();
  if (offices.length === 0) {
    return compact ? null : <span className="text-sm">—</span>;
  }
  return <span className="text-sm">{offices.join(", ")}</span>;
}

const columns: DataGridColumnDef<RegisterRow>[] = [
  {
    accessorFn: (row) => row.trustee.legalName,
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">
          {row.original.trustee.legalName}
        </span>
        {row.original.trustee.isCoFounder ? <Tag>Co-Founder</Tag> : null}
      </span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Name" visibility={true} />
    ),
    id: "name",
    meta: {
      compact: "primary",
      headerTitle: "Name",
      kind: "text",
      skeleton: SKELETON_NAME,
    },
    size: 200,
  },
  {
    accessorFn: (row) => row.standing,
    cell: ({ row }) =>
      row.original.standing === "board" ? (
        <StatusBadge tone="success">On the board</StatusBadge>
      ) : (
        <StatusBadge>Not on the board</StatusBadge>
      ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Board" visibility={true} />
    ),
    id: "standing",
    meta: {
      compact: "primary",
      headerTitle: "Board",
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 150,
  },
  {
    accessorFn: (row) => row.offices.join(", "),
    cell: ({ row }) => <OfficesCell offices={row.original.offices} />,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Offices" visibility={true} />
    ),
    id: "offices",
    meta: {
      compact: "primary",
      headerTitle: "Offices",
      kind: "text",
      skeleton: SKELETON_TEXT,
    },
    size: 220,
  },
  {
    accessorFn: (row) => row.term?.startsOn ?? "",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.term ? termText(row.original.term) : "—"}
      </span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Term" visibility={true} />
    ),
    id: "term",
    meta: { headerTitle: "Term", kind: "text", skeleton: SKELETON_TEXT },
    size: 200,
  },
  {
    accessorFn: (row) =>
      row.term ? TRUSTEE_TERM_BASIS_LABELS[row.term.basis] : "",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.term
          ? TRUSTEE_TERM_BASIS_LABELS[row.original.term.basis]
          : "—"}
      </span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Basis" visibility={true} />
    ),
    id: "basis",
    meta: { headerTitle: "Basis", kind: "text", skeleton: SKELETON_TEXT },
    size: 160,
  },
  {
    accessorFn: (row) => row.unevidenced,
    cell: ({ row }) => {
      const missing = row.original.unevidenced;
      if (missing === 0) {
        return <StatusBadge tone="success">Evidenced</StatusBadge>;
      }
      return <StatusBadge tone="warning">{missing} unevidenced</StatusBadge>;
    },
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Evidence"
        visibility={true}
      />
    ),
    id: "evidence",
    meta: {
      compact: "primary",
      headerTitle: "Evidence",
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 140,
  },
];

/** The register on any day since the deed. */
function AsOfPicker({
  isToday,
  on,
  onChange,
}: {
  isToday: boolean;
  on: string;
  onChange: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = isoToDate(on);
  const handleSelect = useEventCallback((date: Date | undefined) => {
    onChange(date ? dateToIso(date) : null);
    setOpen(false);
  });
  const reset = useEventCallback(() => onChange(null));
  return (
    <span className="flex items-center gap-1">
      <ResponsivePicker
        onOpenChange={setOpen}
        open={open}
        title="Register as of"
        trigger={
          <Button size="sm" type="button" variant="outline">
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
            {isToday ? "As of today" : `As of ${formatIso(on)}`}
          </Button>
        }
      >
        <Calendar
          autoFocus
          captionLayout="dropdown"
          defaultMonth={selected}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
          mode="single"
          onSelect={handleSelect}
          selected={selected}
          startMonth={REGISTER_START}
        />
      </ResponsivePicker>
      {isToday ? null : (
        <Button onClick={reset} size="sm" type="button" variant="ghost">
          Today
        </Button>
      )}
    </span>
  );
}

/** Everyone on the register: the board on a date first, then the rest. */
export function RegisterTable({
  input,
  isLoading,
  isToday,
  on,
  onDateChange,
  onView,
}: {
  input: RegisterInput<RegisterTrustee>;
  isLoading: boolean;
  isToday: boolean;
  on: string;
  onDateChange: (iso: string | null) => void;
  onView: (trustee: RegisterTrustee) => void;
}) {
  const board = boardOn(input, on);
  const onBoard = new Set(board.map((m) => m.trustee.id));
  const rows: RegisterRow[] = [
    ...board.map((member) => ({
      id: member.trustee.id,
      offices: member.offices.map((o) => TRUSTEE_OFFICE_LABELS[o]),
      standing: "board" as const,
      term: member.trustee.terms.find((t) => t.id === member.term.id) ?? null,
      trustee: member.trustee,
      unevidenced: unevidencedCount(member.trustee),
    })),
    ...input.trustees
      .filter((t) => !onBoard.has(t.id))
      .map((trustee) => ({
        id: trustee.id,
        offices: [],
        standing: "off" as const,
        term: trustee.terms.at(-1) ?? null,
        trustee,
        unevidenced: unevidencedCount(trustee),
      })),
  ];
  const unevidenced = rows.filter((row) => row.unevidenced > 0).length;
  const handleRowClick = useEventCallback((row: RegisterRow) =>
    onView(row.trustee)
  );

  return (
    <DataTableWrapper<RegisterRow>
      columns={columns}
      compactOnMobile
      data={rows}
      emptyMessage="No trustees match."
      filter={{
        attentionViews: [
          {
            count: unevidenced,
            id: "unevidenced",
            label: "Unevidenced",
            rule: { path: "evidence", value: "missing" },
          },
        ],
        fields: FILTER_FIELDS,
        getValue,
        viewField: "standing",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchRow}
      searchPlaceholder="Search trustees..."
      storageKey="governance_register_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={
        <AsOfPicker isToday={isToday} on={on} onChange={onDateChange} />
      }
    />
  );
}
