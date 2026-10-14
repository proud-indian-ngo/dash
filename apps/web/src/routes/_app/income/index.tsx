import {
  Alert02Icon,
  BankIcon,
  Coins01Icon,
  FileImportIcon,
  MoneyAdd01Icon,
  MoneyReceive01Icon,
  PlusSignIcon,
  UserLove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  currentFinancialYear,
  INCOME_PERMISSIONS,
  isContributionDeletable,
  isContributionEditable,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { ContributionDetailSheet } from "@/components/income/contribution-detail-sheet";
import { MISSING_DETAILS_VALUE } from "@/components/income/contribution-filters";
import { ContributionFormDialog } from "@/components/income/contribution-form-dialog";
import {
  computeContributionYearStats,
  contributionsSignature,
} from "@/components/income/contribution-stats";
import { ContributionsTable } from "@/components/income/contributions-table";
import {
  type ImportBatchRow,
  ImportBatchesTable,
} from "@/components/income/import-batches-table";
import type {
  ContributionRow,
  OtherIncomeRow,
} from "@/components/income/income-types";
import { OtherIncomeFormDialog } from "@/components/income/other-income-form-dialog";
import { OtherIncomeTable } from "@/components/income/other-income-table";
import { SettlementsTab } from "@/components/income/settlements/settlements-tab";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { StatsCards, type StatItem } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import {
  getMissingDonorDetails,
  type MissingDonorDetailsResponse,
} from "@/functions/income";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { preloadRouteQuery } from "@/lib/route-preload";

const INCOME_TABS = [
  "contributions",
  "other",
  "imports",
  "settlements",
] as const;
type IncomeTab = (typeof INCOME_TABS)[number];

export const Route = createFileRoute("/_app/income/")({
  component: IncomeRouteComponent,
  head: () => ({
    meta: [{ title: `Income | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.contribution.list(),
      abortController.signal
    );
  },
});

/**
 * Donors with money received this year who lack an ID number or address;
 * server-only, so a server function. Refetched when the contributions change
 * (`refreshKey`) and when the window regains focus, since donor details are
 * edited elsewhere.
 */
function useMissingDonorDetails(enabled: boolean, refreshKey: string) {
  const load = useServerFn(getMissingDonorDetails);
  const [state, setState] = useState<MissingDonorDetailsResponse | null>(null);
  const [focusCount, setFocusCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onFocus = () => setFocusCount((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "income.missingDonorDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "IncomeRoute",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, focusCount, load]);
  return state;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

function ContributionsTab({
  canManage,
  onRecord,
}: {
  canManage: boolean;
  onRecord: () => void;
}) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const [contributions, result] = useQuery(queries.contribution.list());
  const rows = contributions as ContributionRow[];
  const isLoading = rows.length === 0 && result.type !== "complete";
  const fy = currentFinancialYear();
  const stats = computeContributionYearStats(rows, fy);
  const missing = useMissingDonorDetails(
    INCOME_PERMISSIONS.some((permission) => hasPermission(permission)),
    contributionsSignature(rows)
  );
  const missingIds = missing ? new Set(missing.partyIds) : EMPTY_SET;
  const { setQuery } = useDataTableFilters();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContributionRow | null>(null);
  const viewing = viewingId
    ? (rows.find((row) => row.id === viewingId) ?? null)
    : null;

  const deleteAction = useConfirmAction<ContributionRow>({
    mutationMeta: {
      entityId: (row) => row.id,
      errorMsg: "Couldn't delete contribution",
      mutation: "contribution.delete",
      successMsg: "Contribution deleted",
    },
    onConfirm: async (row) => {
      const res = await zero.mutate(
        mutators.contribution.delete({ id: row.id })
      ).server;
      if (res.type !== "error") {
        setViewingId((current) => (current === row.id ? null : current));
      }
      return res;
    },
  });

  const handleView = useEventCallback((row: ContributionRow) =>
    setViewingId(row.id)
  );
  const handleEdit = useEventCallback((row: ContributionRow) =>
    setEditing(row)
  );
  const handleDelete = useEventCallback((row: ContributionRow) =>
    deleteAction.trigger(row)
  );
  const filterMissing = useEventCallback(() => {
    setQuery(
      createFilterQuery([
        createFilterRule({
          id: "missing-details",
          operator: "is",
          path: ["details"],
          value: MISSING_DETAILS_VALUE,
        }),
      ])
    );
  });

  const items: StatItem[] = [
    {
      icon: MoneyReceive01Icon,
      label: `Received ${fy.label}`,
      value: formatPaise(stats.receivedPaise),
    },
    { icon: Coins01Icon, label: "Contributions", value: stats.count },
    { icon: UserLove01Icon, label: "Donors", value: stats.donorCount },
  ];
  if (missing) {
    items.push({
      actionLabel: "Show donors missing ID or address",
      icon: Alert02Icon,
      label: "Missing donor details",
      onClick: filterMissing,
      tone: missing.count > 0 ? "warning" : "neutral",
      value: missing.count,
    });
  }

  if (!isLoading && rows.length === 0) {
    return (
      <NotFoundState
        actions={
          canManage ? (
            <Button onClick={onRecord} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Record contribution
            </Button>
          ) : null
        }
        description="Donations you record or import appear here, with this year's totals."
        icon={MoneyReceive01Icon}
        title="No contributions yet"
      />
    );
  }

  return (
    <>
      <StatsCards isLoading={isLoading} items={items} />
      <ContributionsTable
        canManage={canManage}
        data={rows}
        isLoading={isLoading}
        missingPartyIds={missingIds}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onView={handleView}
      />
      <ContributionDetailSheet
        canDelete={
          canManage &&
          viewing !== null &&
          isContributionDeletable(viewing.status ?? "received", viewing.refunds)
        }
        canEdit={
          canManage &&
          viewing !== null &&
          isContributionEditable(viewing.status ?? "received")
        }
        contribution={viewing}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onOpenChange={(open) => {
          if (!open) {
            setViewingId(null);
          }
        }}
      />
      <ContributionFormDialog
        contribution={editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        open={editing !== null}
      />
      <ConfirmDialog
        confirmLabel="Delete contribution"
        description="The contribution is removed from the donor's giving history. This cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete contribution?"
        variant="destructive"
      />
    </>
  );
}

function OtherIncomeTab({
  canManage,
  onRecord,
}: {
  canManage: boolean;
  onRecord: () => void;
}) {
  const zero = useZero();
  const [incomes, result] = useQuery(queries.otherIncome.list());
  const rows = incomes as OtherIncomeRow[];
  const isLoading = rows.length === 0 && result.type !== "complete";
  const [editing, setEditing] = useState<OtherIncomeRow | null>(null);
  const deleteAction = useConfirmAction<OtherIncomeRow>({
    mutationMeta: {
      entityId: (row) => row.id,
      errorMsg: "Couldn't delete income",
      mutation: "otherIncome.delete",
      successMsg: "Income deleted",
    },
    onConfirm: async (row) =>
      await zero.mutate(mutators.otherIncome.delete({ id: row.id })).server,
  });
  const handleEdit = useEventCallback((row: OtherIncomeRow) => setEditing(row));
  const handleDelete = useEventCallback((row: OtherIncomeRow) =>
    deleteAction.trigger(row)
  );

  if (!isLoading && rows.length === 0) {
    return (
      <NotFoundState
        actions={
          canManage ? (
            <Button onClick={onRecord} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Record other income
            </Button>
          ) : null
        }
        description="Bank interest, returned grants and other money that is not a donation. It never enters donation filings."
        icon={MoneyAdd01Icon}
        title="No other income yet"
      />
    );
  }

  return (
    <>
      <OtherIncomeTable
        canManage={canManage}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
      <OtherIncomeFormDialog
        income={editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        open={editing !== null}
      />
      <ConfirmDialog
        confirmLabel="Delete income"
        description="This cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete this income?"
        variant="destructive"
      />
    </>
  );
}

function ImportsTab({
  canImport,
  onImport,
}: {
  canImport: boolean;
  onImport: () => void;
}) {
  const navigate = useNavigate();
  const [batches, result] = useQuery(queries.importBatch.list());
  const rows = batches as ImportBatchRow[];
  const isLoading = rows.length === 0 && result.type !== "complete";
  const open = useEventCallback((row: ImportBatchRow) => {
    // A bank statement's lines live on the Bank statements page.
    if (row.source === "bank_csv") {
      navigate({
        search: row.orgAccountId ? { account: row.orgAccountId } : {},
        to: "/income/bank",
      });
      return;
    }
    navigate({ params: { batchId: row.id }, to: "/income/imports/$batchId" });
  });

  if (!isLoading && rows.length === 0) {
    return (
      <NotFoundState
        actions={
          canImport ? (
            <Button onClick={onImport} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={FileImportIcon}
                strokeWidth={2}
              />
              Import contributions
            </Button>
          ) : null
        }
        description="Upload a spreadsheet of donations; each upload is listed here with what it imported."
        icon={FileImportIcon}
        title="No imports yet"
      />
    );
  }
  const pending = rows.reduce((sum, row) => sum + (row.pendingCount ?? 0), 0);
  const waitingBatches = rows.filter((row) => (row.pendingCount ?? 0) > 0);
  // Newest first, so the last is the oldest still waiting.
  const oldestWaiting = waitingBatches.at(-1);
  return (
    <>
      {pending > 0 ? (
        <div
          className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          data-testid="imports-needs-review"
          role="status"
        >
          <span>
            <span className="font-semibold">
              Waiting: {pending.toLocaleString("en-IN")}
            </span>{" "}
            {pending === 1 ? "row waits" : "rows wait"} to sync or for a
            decision in{" "}
            {waitingBatches.length === 1
              ? "1 import"
              : `${waitingBatches.length} imports`}
            .
          </span>
          {oldestWaiting ? (
            <Button
              onClick={() => open(oldestWaiting)}
              size="sm"
              type="button"
              variant="outline"
            >
              Open the oldest
            </Button>
          ) : null}
        </div>
      ) : null}
      <ImportBatchesTable data={rows} isLoading={isLoading} onOpen={open} />
    </>
  );
}

function IncomeRouteComponent() {
  const { hasPermission } = useApp();
  const canManageContributions = hasPermission("donors.manage");
  const canManageOtherIncome = hasPermission("finance.manage");
  // Settlements are finance records: not shown to donors.view alone.
  const canSeeSettlements =
    hasPermission("finance.view") || hasPermission("finance.manage");
  const [requestedTab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(INCOME_TABS).withDefault("contributions")
  );
  const tab =
    requestedTab === "settlements" && !canSeeSettlements
      ? "contributions"
      : requestedTab;
  const handleTabChange = useEventCallback((value: string | null) =>
    setTab(value as IncomeTab)
  );
  const [contributionOpen, setContributionOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const openContribution = useEventCallback(() => setContributionOpen(true));
  const openOther = useEventCallback(() => {
    setTab("other");
    setOtherOpen(true);
  });
  const navigate = useNavigate();
  const openImport = useEventCallback(() => {
    navigate({ to: "/income/import" });
  });
  const openBank = useEventCallback(() => {
    navigate({ to: "/income/bank" });
  });
  const menuActions = [
    canManageContributions && {
      icon: FileImportIcon,
      id: "import",
      label: "Import contributions",
      onSelect: openImport,
    },
    canManageOtherIncome && {
      icon: MoneyAdd01Icon,
      id: "other-income",
      label: "Record other income",
      onSelect: openOther,
    },
    canSeeSettlements && {
      icon: BankIcon,
      id: "bank-statements",
      label: "Bank statements",
      onSelect: openBank,
    },
  ].filter((action) => action !== false);

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {canManageContributions ? (
              <Button onClick={openContribution} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Record contribution
              </Button>
            ) : null}
            {menuActions.length > 0 ? (
              <PageHeaderMenu actions={menuActions} title="Income actions" />
            ) : null}
          </>
        }
        description="Donations and other money the trust has received. Receipts and filings come later; these are the staging records they will be built from."
        title="Income"
      />
      <Tabs className="mt-4" onValueChange={handleTabChange} value={tab}>
        <TabsList>
          <TabsTrigger value="contributions">Contributions</TabsTrigger>
          <TabsTrigger value="other">Other income</TabsTrigger>
          <TabsTrigger value="imports">Imports</TabsTrigger>
          {canSeeSettlements ? (
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent
          className="mt-4 grid gap-6 *:min-w-0"
          value="contributions"
        >
          <ContributionsTab
            canManage={canManageContributions}
            onRecord={openContribution}
          />
        </TabsContent>
        <TabsContent className="mt-4 grid gap-6 *:min-w-0" value="other">
          <OtherIncomeTab
            canManage={canManageOtherIncome}
            onRecord={openOther}
          />
        </TabsContent>
        <TabsContent className="mt-4 grid gap-6 *:min-w-0" value="imports">
          <ImportsTab
            canImport={canManageContributions}
            onImport={openImport}
          />
        </TabsContent>
        {canSeeSettlements ? (
          <TabsContent
            className="mt-4 grid gap-6 *:min-w-0"
            value="settlements"
          >
            <SettlementsTab />
          </TabsContent>
        ) : null}
      </Tabs>
      <ContributionFormDialog
        contribution={null}
        onOpenChange={setContributionOpen}
        open={contributionOpen}
      />
      <OtherIncomeFormDialog
        income={null}
        onOpenChange={setOtherOpen}
        open={otherOpen}
      />
    </div>
  );
}
