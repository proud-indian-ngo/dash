import {
  ChartIncreaseIcon,
  MoneyReceive01Icon,
  MoneySend01Icon,
} from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type DateRange,
  incomeExpenditure,
  signedPaise,
} from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { NotFoundState } from "@/components/shared/not-found-state";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { Tag } from "@/components/shared/status-badge";
import { StatsCards } from "@/components/stats/stats-cards";

import { formatDay } from "./labels";
import { SourceLink } from "./source-link";
import type { BooksEntryRow, BooksPosting } from "./use-books";

const VIEWS = ["head", "programme"] as const;
type View = (typeof VIEWS)[number];

interface SummaryRow {
  count: number;
  id: string;
  key: string;
  label: string;
  paise: number;
  type: "income" | "expense";
}

const TYPE_LABELS = { expense: "Expenditure", income: "Income" } as const;
const SKELETON = <Skeleton className="h-5 w-32" />;

function searchSummary(row: SummaryRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || row.label.toLowerCase().includes(q);
}

/** The year's income and expenditure by account head or programme, with each line's entries. */
export function IncomeExpenditureTab({
  entries,
  headNames,
  isLoading,
  postings,
  programmeNames,
  range,
}: {
  entries: readonly BooksEntryRow[];
  headNames: ReadonlyMap<string, string>;
  isLoading: boolean;
  postings: ReadonlyMap<string, BooksPosting>;
  programmeNames: ReadonlyMap<string, string>;
  range: DateRange;
}) {
  const [view, setView] = useQueryState(
    "by",
    parseAsStringLiteral(VIEWS).withDefault("head")
  );
  const [open, setOpen] = useState<SummaryRow | null>(null);
  const getRowId = useEventCallback((row: SummaryRow) => row.id);
  const summary = incomeExpenditure(entries, range, view);
  const labelOf = (key: string) =>
    view === "head"
      ? (headNames.get(key) ?? "Unknown head")
      : key
        ? (programmeNames.get(key) ?? "Unknown programme")
        : "No programme";
  const rows: SummaryRow[] = [
    ...summary.income.map((l) => ({ ...l, type: "income" as const })),
    ...summary.expense.map((l) => ({ ...l, type: "expense" as const })),
  ].map((l) => ({ ...l, id: `${l.type}:${l.key}`, label: labelOf(l.key) }));

  const columns: DataGridColumnDef<SummaryRow>[] = [
    {
      accessorFn: (row) => row.type,
      cell: ({ row }) => <Tag>{TYPE_LABELS[row.original.type]}</Tag>,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      id: "type",
      meta: { headerTitle: "Type", skeleton: SKELETON },
      size: 130,
    },
    {
      accessorFn: (row) => row.label,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.label}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title={view === "head" ? "Account Head" : "Programme"}
          visibility={true}
        />
      ),
      id: "label",
      meta: { compact: "primary", headerTitle: "Name", skeleton: SKELETON },
      size: 260,
    },
    {
      accessorFn: (row) => row.count,
      cell: ({ row }) => row.original.count.toLocaleString("en-IN"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Entries"
          visibility={true}
        />
      ),
      id: "count",
      meta: { headerTitle: "Entries", kind: "count", skeleton: SKELETON },
      size: 100,
    },
    {
      accessorFn: (row) => row.paise,
      cell: ({ row }) => formatPaise(row.original.paise),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Amount"
          visibility={true}
        />
      ),
      id: "amount",
      meta: {
        compact: "trailing",
        headerTitle: "Amount",
        kind: "amount",
        skeleton: SKELETON,
      },
      size: 150,
    },
  ];

  const drill = open
    ? entries.filter(
        (e) =>
          e.headType === open.type &&
          e.economicOn >= range.startsOn &&
          e.economicOn <= range.endsOn &&
          (view === "head" ? e.accountHeadId : (e.programmeId ?? "")) ===
            open.key
      )
    : [];

  return (
    <div className="grid gap-4 *:min-w-0" data-testid="income-expenditure">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatsCards
          isLoading={isLoading}
          items={[
            {
              icon: MoneyReceive01Icon,
              label: "Income",
              value: formatPaise(summary.incomeTotalPaise),
            },
            {
              icon: MoneySend01Icon,
              label: "Expenditure",
              value: formatPaise(summary.expenseTotalPaise),
            },
            {
              icon: ChartIncreaseIcon,
              label: summary.surplusPaise < 0 ? "Deficit" : "Surplus",
              value: formatPaise(Math.abs(summary.surplusPaise)),
            },
          ]}
        />
        <Tabs onValueChange={(value) => setView(value as View)} value={view}>
          <TabsList>
            <TabsTrigger value="head">By account head</TabsTrigger>
            <TabsTrigger value="programme">By programme</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!isLoading && rows.length === 0 ? (
        <NotFoundState
          description="Donations, other income and expenses appear here once they post to the books."
          icon={ChartIncreaseIcon}
          title="No income or expenditure this year"
        />
      ) : (
        <DataTableWrapper<SummaryRow>
          columns={columns}
          compactOnMobile
          data={rows}
          emptyMessage="Nothing matches."
          getRowId={getRowId}
          groupBy={{
            columnId: "type",
            formatValue: (value) =>
              TYPE_LABELS[value as SummaryRow["type"]] ?? value,
            getValue: (row) => row.type,
            label: "type",
            order: ["income", "expense"],
          }}
          isLoading={isLoading}
          onRowClick={setOpen}
          searchFn={searchSummary}
          searchPlaceholder="Search..."
          searchQueryKey="ieSearch"
          storageKey="books_income_expenditure_table_state_v1"
          tableLayout={{ columnsResizable: true, columnsVisibility: true }}
        />
      )}
      <Sheet
        onOpenChange={(next) => (next ? null : setOpen(null))}
        open={open !== null}
      >
        <SheetContent>
          {open ? (
            <>
              <DetailSheetHeader
                badge={<Tag>{TYPE_LABELS[open.type]}</Tag>}
                meta={[
                  formatPaise(open.paise),
                  `${open.count.toLocaleString("en-IN")} entries`,
                ]}
                title={open.label}
              />
              <ul className="mx-6 mb-6 divide-y rounded-lg border">
                {drill.map((e) => {
                  const source = postings.get(e.postingId);
                  return (
                    <li
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                      key={e.id}
                    >
                      <span className="min-w-0">
                        <span className="block">
                          {formatDay(e.economicOn)}
                          {" · "}
                          <SourceLink
                            sourceId={source?.sourceId}
                            sourceType={source?.sourceType}
                          />
                        </span>
                        <span className="text-muted-foreground block truncate">
                          {e.memo ?? (e.reversal ? "Reversal" : "—")}
                          {e.memo && e.reversal ? " (reversal)" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {formatPaise(signedPaise(e.effect, e.amountPaise))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
