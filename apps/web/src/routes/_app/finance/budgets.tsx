import {
  MoneySend01Icon,
  PercentCircleIcon,
  PiggyBankIcon,
  PlusSignIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { env } from "@pi-dash/env/web";
import {
  budgetableHeadIds,
  budgetUse,
  budgetYearView,
} from "@pi-dash/shared/budgets";
import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { epochDayToIso, todayInKolkata } from "@pi-dash/shared/income";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";

import { type BooksYear, defaultYear } from "@/components/books/use-books";
import {
  type BudgetDialogTarget,
  BudgetFormDialog,
  type StoredBudget,
} from "@/components/budgets/budget-form-dialog";
import {
  type BudgetRow,
  BudgetsTable,
} from "@/components/budgets/budgets-table";
import { useBudgetActuals } from "@/components/budgets/use-budget-actuals";
import { ErrorState } from "@/components/shared/error-state";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import { assertPermission } from "@/lib/route-guards";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/finance/budgets")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.view"),
  component: BudgetsPage,
  head: () => ({
    meta: [{ title: `Budgets | ${env.VITE_APP_NAME}` }],
  }),
});

function BudgetsPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const [yearParam, setYearParam] = useQueryState("year", parseAsString);
  const [target, setTarget] = useState<BudgetDialogTarget | null>(null);

  const [yearRows, yearsResult] = useQuery(queries.fiscalYear.all());
  const [budgetRows, budgetsResult] = useQuery(queries.budget.all());
  const [programmes, programmesResult] = useQuery(queries.programme.all());
  const [projects] = useQuery(queries.project.all());
  const [heads, headsResult] = useQuery(queries.accountHead.all());
  const [categories, categoriesResult] = useQuery(
    queries.expenseCategory.all()
  );

  // Years before the cutover have nothing in the books to measure against.
  const years: BooksYear[] = yearRows
    .map((y) => ({
      closedAt: y.closedAt ?? null,
      endsOn: epochDayToIso(y.endsOn),
      id: y.id,
      label: y.label,
      startsOn: epochDayToIso(y.startsOn),
    }))
    .filter((y) => y.endsOn >= LEDGER_CUTOVER_ON)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const year =
    years.find((y) => y.label === yearParam) ??
    defaultYear(years, todayInKolkata());
  const previousYear =
    years.find((y) => year && y.endsOn < year.startsOn) ?? null;
  const { actuals, error: actualsError, retry } = useBudgetActuals(year?.id);

  const isLoading =
    (yearRows.length === 0 && isAwaitingResult(yearsResult)) ||
    (budgetRows.length === 0 && isAwaitingResult(budgetsResult)) ||
    (programmes.length === 0 && isAwaitingResult(programmesResult)) ||
    (heads.length === 0 && isAwaitingResult(headsResult)) ||
    (categories.length === 0 && isAwaitingResult(categoriesResult));

  if (isLoading || !year) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <PageHeader title="Budgets" />
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <NotFoundState
            description="Financial years appear here once they are set up."
            icon={PiggyBankIcon}
            title="No financial years"
          />
        )}
      </div>
    );
  }

  const budgets: StoredBudget[] = budgetRows.map((b) => ({
    fiscalYearId: b.fiscalYearId,
    id: b.id,
    lines: b.lines.map((l) => ({
      accountHeadId: l.accountHeadId,
      amountPaise: l.amountPaise,
      id: l.id,
    })),
    note: b.note ?? null,
    programmeId: b.programmeId,
    projectId: b.projectId ?? null,
  }));
  const yearBudgets = budgets.filter((b) => b.fiscalYearId === year.id);
  const view = budgetYearView(
    yearBudgets,
    actuals ?? [],
    programmes.map((p) => p.id)
  );

  const headNames = new Map(heads.map((h) => [h.id, h.name]));
  const programmeNames = new Map(programmes.map((p) => [p.id, p.name]));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const headName = (id: string) => headNames.get(id) ?? "Account head";
  const retired = new Set(
    programmes
      .filter((p) => !p.active || p.id === PROGRAMME_IDS.unallocated)
      .map((p) => p.id)
  );
  const programmeName = (id: string | null) =>
    id ? (programmeNames.get(id) ?? "Programme") : "No programme";

  const rows: BudgetRow[] = view.scopes.map((s) => ({
    actualPaise: s.actualPaise,
    budgetPaise: s.budgetPaise,
    hasBudget: s.budget !== null,
    id: s.projectId ? `project:${s.projectId}` : `programme:${s.programmeId}`,
    kind: s.projectId ? "project" : "programme",
    label: s.projectId
      ? (projectNames.get(s.projectId) ?? "Project")
      : programmeName(s.programmeId),
    lines: s.heads.map((h) => ({
      actualPaise: h.actualPaise,
      budgetPaise: h.budgetPaise,
      key: h.accountHeadId,
      label: headName(h.accountHeadId),
    })),
    retired: retired.has(s.programmeId),
    scope: { programmeId: s.programmeId, projectId: s.projectId },
  }));
  if (view.unbudgeted.length > 0) {
    rows.push({
      actualPaise: view.summary.unbudgetedPaise,
      budgetPaise: null,
      hasBudget: false,
      id: "unbudgeted",
      kind: "unbudgeted",
      label: "Unbudgeted",
      lines: view.unbudgeted.map((l) => ({
        actualPaise: l.paise,
        budgetPaise: null,
        key: `${l.programmeId ?? ""}:${l.accountHeadId}`,
        label: `${programmeName(l.programmeId)} · ${headName(l.accountHeadId)}`,
      })),
      retired: false,
      scope: null,
    });
  }

  const budgetable = budgetableHeadIds(categories, heads);
  const formOptions = {
    heads: heads.map((h) => ({
      budgetable: budgetable.has(h.id) && Boolean(h.active),
      id: h.id,
      name: h.name,
    })),
    programmes: programmes.map((p) => ({
      active: Boolean(p.active),
      id: p.id,
      name: p.name,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      programmeId: p.programmeId,
      status: p.status,
    })),
  };

  const { summary } = view;
  const used = budgetUse(summary.spentPaise, summary.budgetedPaise);
  const setBudget = () => setTarget({ kind: "pick", programmeId: null });
  const setBudgetButton = canManage ? (
    <Button onClick={setBudget} type="button">
      <HugeiconsIcon className="size-4" icon={PlusSignIcon} strokeWidth={2} />
      Set budget
    </Button>
  ) : null;

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            <Select
              onValueChange={(value) => {
                setYearParam(value as string);
              }}
              value={year.label}
            >
              <SelectTrigger aria-label="Financial year" className="w-36">
                <SelectValue>{`FY ${year.label}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.label}>
                    FY {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {setBudgetButton}
          </>
        }
        description={`Budget against what the books recognise as spent in FY ${year.label}, by programme and account head.`}
        title="Budgets"
      />
      {actualsError && yearBudgets.length > 0 ? (
        <div className="mt-6">
          <ErrorState
            actions={
              <Button onClick={retry} type="button">
                Try again
              </Button>
            }
            error={actualsError}
          />
        </div>
      ) : yearBudgets.length === 0 ? (
        <NotFoundState
          actions={setBudgetButton}
          className="mt-6"
          description={`No budgets are set for FY ${year.label} yet.`}
          icon={PiggyBankIcon}
          title="No budgets"
        />
      ) : (
        <div className="mt-4 grid gap-3 *:min-w-0">
          <StatsCards
            isLoading={actuals === null}
            items={[
              {
                icon: Wallet01Icon,
                label: "Budgeted",
                value: formatPaise(summary.budgetedPaise),
              },
              {
                icon: MoneySend01Icon,
                label: "Spent",
                value: formatPaise(summary.spentPaise),
              },
              {
                icon: PiggyBankIcon,
                label: "Remaining",
                tone: summary.remainingPaise < 0 ? "danger" : "neutral",
                value: (
                  <span
                    className={
                      summary.remainingPaise < 0 ? "text-destructive" : ""
                    }
                  >
                    {formatPaise(summary.remainingPaise)}
                  </span>
                ),
              },
              {
                icon: PercentCircleIcon,
                label: "Used",
                tone: used.over ? "danger" : "neutral",
                value:
                  used.percent === null
                    ? used.over
                      ? "Over"
                      : "—"
                    : `${used.percent}%`,
              },
            ]}
          />
          {actuals === null ? null : (
            <p
              className="text-muted-foreground text-sm"
              data-testid="budget-reconciliation"
            >
              Expenditure in the books for FY {year.label}:{" "}
              {formatPaise(summary.expenditurePaise)}, of which{" "}
              {formatPaise(summary.unbudgetedPaise)} has no programme budget.
            </p>
          )}
          <BudgetsTable
            canManage={canManage}
            isLoading={actuals === null}
            onEdit={setTarget}
            rows={rows}
          />
        </div>
      )}
      <BudgetFormDialog
        budgets={budgets}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
          }
        }}
        options={formOptions}
        previousYear={previousYear}
        target={target}
        year={year}
      />
    </div>
  );
}
