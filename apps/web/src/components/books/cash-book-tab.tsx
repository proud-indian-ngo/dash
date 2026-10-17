import {
  ArrowDataTransferHorizontalIcon,
  MoneyReceive01Icon,
  MoneySend01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  cashBook,
  type DateRange,
  MOVEMENT_KIND_LABELS,
} from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";
import { useEffect, useRef } from "react";

import { useDataTableGroupBy } from "@/components/data-table/data-table-group";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { Tag } from "@/components/shared/status-badge";
import { StatsCards } from "@/components/stats/stats-cards";

import { formatDay, formatMonth } from "./labels";
import { SourceLink } from "./source-link";
import type { BooksMovementRow, BooksPosting } from "./use-books";

type CashBookRow = ReturnType<
  typeof cashBook<BooksMovementRow>
>["rows"][number];

const SKELETON = <Skeleton className="h-5 w-24" />;

function searchMovement(row: CashBookRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [row.memo ?? "", row.paymentReference ?? "", MOVEMENT_KIND_LABELS[row.kind]]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

function SourceCell({ posting }: { posting: BooksPosting | undefined }) {
  return (
    <SourceLink sourceId={posting?.sourceId} sourceType={posting?.sourceType} />
  );
}

/**
 * One account's money in and out for the year, oldest first and grouped by
 * month, with the running balance carried in from earlier years.
 */
export function CashBookTab({
  accountName,
  isLoading,
  movements,
  orgAccountId,
  postings,
  range,
}: {
  accountName: string;
  isLoading: boolean;
  movements: readonly BooksMovementRow[];
  orgAccountId: string;
  postings: ReadonlyMap<string, BooksPosting>;
  range: DateRange;
}) {
  const book = cashBook(movements, orgAccountId, range);
  const getRowId = useEventCallback((row: CashBookRow) => row.id);

  // Month groups are the cash book's natural view; set once, then the
  // toggle is the reader's.
  const [group, setGroup] = useDataTableGroupBy();
  const grouped = useRef(false);
  useEffect(() => {
    if (!grouped.current) {
      grouped.current = true;
      if (group === null) {
        setGroup("month");
      }
    }
  }, [group, setGroup]);

  const columns: DataGridColumnDef<CashBookRow>[] = [
    {
      accessorFn: (row) => row.month,
      cell: ({ row }) => formatMonth(row.original.month),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Month" visibility={true} />
      ),
      id: "month",
      meta: { compact: "hidden", headerTitle: "Month", skeleton: SKELETON },
      size: 110,
    },
    {
      accessorFn: (row) => row.occurredOn,
      cell: ({ row }) => formatDay(row.original.occurredOn),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Date" visibility={true} />
      ),
      id: "date",
      meta: {
        compact: "primary",
        headerTitle: "Date",
        kind: "date",
        skeleton: SKELETON,
      },
      size: 110,
    },
    {
      accessorFn: (row) => row.kind,
      cell: ({ row }) => (
        <span className="flex gap-1">
          <Tag>{MOVEMENT_KIND_LABELS[row.original.kind]}</Tag>
          {row.original.reversal ? <Tag>Reversal</Tag> : null}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Kind" visibility={true} />
      ),
      id: "kind",
      meta: { compact: "primary", headerTitle: "Kind", skeleton: SKELETON },
      size: 130,
    },
    {
      accessorFn: (row) => postings.get(row.postingId)?.sourceType ?? "",
      cell: ({ row }) => (
        <SourceCell posting={postings.get(row.original.postingId)} />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Source"
          visibility={true}
        />
      ),
      id: "source",
      meta: { headerTitle: "Source", skeleton: SKELETON },
      size: 150,
    },
    {
      accessorFn: (row) => row.memo ?? row.paymentReference ?? "",
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.memo ?? row.original.paymentReference ?? "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Details"
          visibility={true}
        />
      ),
      id: "details",
      meta: { headerTitle: "Details", skeleton: SKELETON },
      size: 200,
    },
    {
      accessorFn: (row) => (row.direction === "in" ? row.amountPaise : null),
      cell: ({ row }) =>
        row.original.direction === "in"
          ? formatPaise(row.original.amountPaise)
          : "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Money In"
          visibility={true}
        />
      ),
      id: "in",
      meta: {
        compact: "trailing",
        headerTitle: "Money In",
        kind: "amount",
        skeleton: SKELETON,
      },
      size: 120,
    },
    {
      accessorFn: (row) => (row.direction === "out" ? row.amountPaise : null),
      cell: ({ row }) =>
        row.original.direction === "out"
          ? formatPaise(row.original.amountPaise)
          : "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Money Out"
          visibility={true}
        />
      ),
      id: "out",
      meta: {
        compact: "trailing",
        headerTitle: "Money Out",
        kind: "amount",
        skeleton: SKELETON,
      },
      size: 120,
    },
    {
      accessorFn: (row) => row.balancePaise,
      cell: ({ row }) => formatPaise(row.original.balancePaise),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Balance"
          visibility={true}
        />
      ),
      enableSorting: false,
      id: "balance",
      meta: { headerTitle: "Balance", kind: "amount", skeleton: SKELETON },
      size: 130,
    },
  ];

  return (
    <div className="grid gap-4 *:min-w-0" data-testid="cash-book">
      <StatsCards
        isLoading={isLoading}
        items={[
          {
            hint: `${accountName} at the start of the year, carried in from earlier movements.`,
            icon: Wallet01Icon,
            label: "Opening balance",
            value: formatPaise(book.openingPaise),
          },
          {
            icon: MoneyReceive01Icon,
            label: "Money in",
            value: formatPaise(book.inPaise),
          },
          {
            icon: MoneySend01Icon,
            label: "Money out",
            value: formatPaise(book.outPaise),
          },
          {
            icon: ArrowDataTransferHorizontalIcon,
            label: "Net change",
            value: formatPaise(book.netPaise),
          },
        ]}
      />
      <DataTableWrapper<CashBookRow>
        columns={columns}
        compactOnMobile
        data={book.rows}
        defaultColumnVisibility={{ month: false }}
        emptyMessage="No money moved in this account this year."
        getRowId={getRowId}
        groupBy={{
          columnId: "month",
          formatValue: formatMonth,
          getValue: (row) => row.month,
          label: "month",
          renderValue: formatMonth,
        }}
        isLoading={isLoading}
        searchFn={searchMovement}
        searchPlaceholder="Search details or reference..."
        storageKey="books_cash_book_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsVisibility: true,
        }}
        totals={["in", "out"]}
      />
    </div>
  );
}
