import {
  MoreVerticalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { percentUsed } from "@pi-dash/shared/budgets";
import { formatPaise } from "@pi-dash/shared/money";

import { DataTableExpandButton } from "@/components/data-table/data-table-compact";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { Tag } from "@/components/shared/status-badge";

import type {
  BudgetDialogTarget,
  BudgetScopeChoice,
} from "./budget-form-dialog";

/** One head, or one programme and head in the Unbudgeted group. */
export interface BudgetBreakdownLine {
  actualPaise: number;
  budgetPaise: number | null;
  key: string;
  label: string;
}

/** A programme budget, a project budget nested under it, or the Unbudgeted group. */
export interface BudgetRow {
  actualPaise: number;
  budgetPaise: number | null;
  hasBudget: boolean;
  id: string;
  kind: "programme" | "project" | "unbudgeted";
  label: string;
  lines: BudgetBreakdownLine[];
  scope: BudgetScopeChoice | null;
}

const SKELETON = <Skeleton className="h-5 w-24" />;
const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_EXPAND = <Skeleton className="size-7" />;

function searchRow(row: BudgetRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    row.label.toLowerCase().includes(q) ||
    row.lines.some((l) => l.label.toLowerCase().includes(q))
  );
}

const remainingOf = (actualPaise: number, budgetPaise: number | null) =>
  budgetPaise === null ? null : budgetPaise - actualPaise;

function Remaining({
  actualPaise,
  budgetPaise,
}: {
  actualPaise: number;
  budgetPaise: number | null;
}) {
  const remaining = remainingOf(actualPaise, budgetPaise);
  if (remaining === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(remaining < 0 && "text-destructive")}
      data-over={remaining < 0 ? "true" : undefined}
    >
      {formatPaise(remaining)}
    </span>
  );
}

/** A slim "spent of budget" bar with the share spent; red past 100%. */
export function SpentBar({
  actualPaise,
  budgetPaise,
}: {
  actualPaise: number;
  budgetPaise: number | null;
}) {
  const percent = percentUsed(actualPaise, budgetPaise);
  if (percent === null) {
    return <span className="text-muted-foreground text-xs">No budget</span>;
  }
  const over = percent > 100;
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div
        aria-hidden="true"
        className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-destructive" : "bg-chart-1"
          )}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "w-11 shrink-0 text-right font-mono text-xs tabular-nums",
          over ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

/** The heads under a row: budget, actual, remaining and the bar for each. */
function Breakdown({ row }: { row: BudgetRow }) {
  if (row.lines.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-3 text-sm">
        No budget lines or spending yet.
      </p>
    );
  }
  return (
    <ul className="divide-y px-4 py-1 text-sm" data-testid="budget-breakdown">
      {row.lines.map((line) => (
        <li
          className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_10rem]"
          data-testid="budget-line"
          key={line.key}
        >
          <span className="min-w-0 truncate">
            {line.label}
            {line.budgetPaise === null && row.kind !== "unbudgeted" ? (
              <Tag className="ml-2">Unbudgeted</Tag>
            ) : null}
          </span>
          <span className="text-muted-foreground font-mono tabular-nums sm:text-right">
            <span className="sm:hidden">Budget </span>
            {line.budgetPaise === null ? "—" : formatPaise(line.budgetPaise)}
          </span>
          <span className="font-mono tabular-nums max-sm:col-start-2 max-sm:row-start-1 sm:text-right">
            {formatPaise(line.actualPaise)}
          </span>
          <span className="font-mono tabular-nums max-sm:hidden sm:text-right">
            <Remaining
              actualPaise={line.actualPaise}
              budgetPaise={line.budgetPaise}
            />
          </span>
          <span className="max-sm:col-span-2">
            <SpentBar
              actualPaise={line.actualPaise}
              budgetPaise={line.budgetPaise}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Finance → Budgets: programmes, each followed by its project budgets, then
 * the Unbudgeted group. Each row expands to its heads. Sorting is off so
 * projects stay under their programme.
 */
export function BudgetsTable({
  canManage,
  isLoading,
  onEdit,
  rows,
}: {
  canManage: boolean;
  isLoading: boolean;
  onEdit: (target: BudgetDialogTarget) => void;
  rows: BudgetRow[];
}) {
  const getRowId = useEventCallback((row: BudgetRow) => row.id);
  const getRowCanExpand = useEventCallback(() => true);

  const columns: DataGridColumnDef<BudgetRow>[] = [
    {
      cell: ({ row }) => (
        <div className="flex size-full items-center justify-center">
          <DataTableExpandButton
            expanded={row.getIsExpanded()}
            onToggle={row.getToggleExpandedHandler()}
          />
        </div>
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "expand",
      maxSize: 40,
      meta: {
        cellClassName: "px-0",
        compact: "always",
        enableColumnOrdering: false,
        expandedContent: (row: BudgetRow) => <Breakdown row={row} />,
        headerClassName: "px-0",
        skeleton: SKELETON_EXPAND,
        stopRowClick: true,
      },
      minSize: 40,
      size: 40,
    },
    {
      accessorFn: (row) => row.label,
      cell: ({ row }) => {
        const { kind, label } = row.original;
        if (kind === "project") {
          return (
            <span className="flex min-w-0 items-center gap-2 pl-4">
              <span aria-hidden="true" className="text-muted-foreground">
                ↳
              </span>
              <span className="truncate">{label}</span>
              <Tag>Project</Tag>
            </span>
          );
        }
        return (
          <span
            className={cn(
              "truncate font-medium",
              kind === "unbudgeted" && "text-muted-foreground"
            )}
          >
            {label}
          </span>
        );
      },
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "name",
      meta: {
        compact: "primary",
        headerTitle: "Name",
        skeleton: SKELETON_NAME,
      },
      size: 280,
    },
    {
      accessorFn: (row) => row.budgetPaise,
      cell: ({ row }) =>
        row.original.budgetPaise === null ? (
          <span className="text-muted-foreground">
            {row.original.kind === "unbudgeted" ? "—" : "Not set"}
          </span>
        ) : (
          formatPaise(row.original.budgetPaise)
        ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Budget"
          visibility={true}
        />
      ),
      id: "budget",
      meta: { headerTitle: "Budget", kind: "amount", skeleton: SKELETON },
      size: 140,
    },
    {
      accessorFn: (row) => row.actualPaise,
      cell: ({ row }) => formatPaise(row.original.actualPaise),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Actual"
          visibility={true}
        />
      ),
      id: "actual",
      meta: {
        compact: "trailing",
        headerTitle: "Actual",
        kind: "amount",
        skeleton: SKELETON,
      },
      size: 140,
    },
    {
      accessorFn: (row) => remainingOf(row.actualPaise, row.budgetPaise),
      cell: ({ row }) => (
        <Remaining
          actualPaise={row.original.actualPaise}
          budgetPaise={row.original.budgetPaise}
        />
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Remaining"
          visibility={true}
        />
      ),
      id: "remaining",
      meta: { headerTitle: "Remaining", kind: "amount", skeleton: SKELETON },
      size: 140,
    },
    {
      accessorFn: (row) => percentUsed(row.actualPaise, row.budgetPaise),
      cell: ({ row }) =>
        row.original.kind === "unbudgeted" ? null : (
          <SpentBar
            actualPaise={row.original.actualPaise}
            budgetPaise={row.original.budgetPaise}
          />
        ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Spent of Budget"
          visibility={true}
        />
      ),
      id: "used",
      meta: {
        compact: "primary",
        headerTitle: "Spent of Budget",
        skeleton: SKELETON,
      },
      size: 200,
    },
  ];
  if (canManage) {
    columns.push({
      cell: ({ row }) => <RowActions onEdit={onEdit} row={row.original} />,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: <Skeleton className="size-7" />,
        stopRowClick: true,
      },
      minSize: 52,
      size: 52,
    });
  }

  return (
    <DataTableWrapper<BudgetRow>
      columns={columns}
      compactOnMobile
      data={rows}
      emptyMessage="Nothing matches."
      getRowCanExpand={getRowCanExpand}
      getRowId={getRowId}
      isLoading={isLoading}
      searchFn={searchRow}
      searchPlaceholder="Search programmes and heads..."
      searchQueryKey="budgetSearch"
      storageKey="budgets_table_state_v1"
      tableLayout={{ columnsResizable: true, columnsVisibility: true }}
    />
  );
}

function RowActions({
  onEdit,
  row,
}: {
  onEdit: (target: BudgetDialogTarget) => void;
  row: BudgetRow;
}) {
  const { scope } = row;
  if (!scope) {
    return null;
  }
  return (
    <ResponsiveActionMenu
      actions={[
        {
          icon: PencilEdit01Icon,
          id: "edit",
          label: row.hasBudget ? "Edit budget" : "Set budget",
          onSelect: () => onEdit({ kind: "scope", scope }),
        },
        row.kind === "programme" && {
          icon: PlusSignIcon,
          id: "project",
          label: "Set project budget",
          onSelect: () =>
            onEdit({ kind: "pick", programmeId: scope.programmeId }),
        },
      ]}
      title={row.label}
      trigger={
        <Button
          aria-label={`Actions for ${row.label}`}
          data-testid="row-actions"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={MoreVerticalIcon}
            strokeWidth={2}
          />
        </Button>
      }
    />
  );
}
