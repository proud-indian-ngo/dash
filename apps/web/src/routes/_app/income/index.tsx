import {
  Alert02Icon,
  BankIcon,
  Coins01Icon,
  FileImportIcon,
  FileValidationIcon,
  Invoice03Icon,
  MoneyAdd01Icon,
  MoneyReceive01Icon,
  PlusSignIcon,
  UserLove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PermissionId } from "@pi-dash/db/permissions";
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
import { canReadReceipts } from "@pi-dash/shared/receipts";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useEffect, useState } from "react";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { MISSING_DETAILS_VALUE } from "@/components/income/contribution-filters";
import { ContributionFormDialog } from "@/components/income/contribution-form-dialog";
import {
  computeContributionYearStats,
  contributionsSignature,
} from "@/components/income/contribution-stats";
import { ContributionsTable } from "@/components/income/contributions-table";
import type { ContributionRow } from "@/components/income/income-types";
import { useReceiptCandidates } from "@/components/income/receipts/use-receipt-candidates";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { PendingDialog } from "@/components/shared/pending-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shared/responsive-sheet";
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
  "receipts",
] as const;
type IncomeTab = (typeof INCOME_TABS)[number];

const loadContributionDetailSheet = () =>
  import("@/components/income/contribution-detail-sheet");
const ContributionDetailSheet = lazy(() =>
  loadContributionDetailSheet().then((module) => ({
    default: module.ContributionDetailSheet,
  }))
);
const loadOtherIncomeFormDialog = () =>
  import("@/components/income/other-income-form-dialog");
const OtherIncomeFormDialog = lazy(() =>
  loadOtherIncomeFormDialog().then((module) => ({
    default: module.OtherIncomeFormDialog,
  }))
);
const loadOtherIncomeTab = () => import("@/components/income/other-income-tab");
const OtherIncomeTab = lazy(() =>
  loadOtherIncomeTab().then((module) => ({
    default: module.OtherIncomeTab,
  }))
);
const loadImportsTab = () => import("@/components/income/imports-tab");
const ImportsTab = lazy(() =>
  loadImportsTab().then((module) => ({
    default: module.ImportsTab,
  }))
);
const loadReceiptsTab = () =>
  import("@/components/income/receipts/receipts-tab");
const ReceiptsTab = lazy(() =>
  loadReceiptsTab().then((module) => ({
    default: module.ReceiptsTab,
  }))
);
const loadIssueReceiptsDialog = () =>
  import("@/components/income/receipts/issue-receipts-dialog");
const IssueReceiptsDialog = lazy(() =>
  loadIssueReceiptsDialog().then((module) => ({
    default: module.IssueReceiptsDialog,
  }))
);
const loadSettlementsTab = () =>
  import("@/components/income/settlements/settlements-tab");
const SettlementsTab = lazy(() =>
  loadSettlementsTab().then((module) => ({
    default: module.SettlementsTab,
  }))
);

function PendingContributionSheet({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Contribution</SheetTitle>
          <SheetDescription className="sr-only">
            Loading contribution details
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-24">
          <Loader />
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
 * Donors whose details hold up this year's donations return (see
 * `getMissingDonorDetails`);
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

  // In the URL, so the books can link to a gift (or to a refund's gift).
  const [viewingId, setViewingId] = useQueryState(
    "contribution",
    parseAsString
  );
  const [refundId, setRefundId] = useQueryState("refund", parseAsString);
  const [editing, setEditing] = useState<ContributionRow | null>(null);
  const viewing = viewingId
    ? (rows.find((row) => row.id === viewingId) ?? null)
    : refundId
      ? (rows.find((row) =>
          (row.refunds ?? []).some((refund) => refund.id === refundId)
        ) ?? null)
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
  const handleDetailOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setViewingId(null);
      setRefundId(null);
    }
  });
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setEditing(null);
    }
  });
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
      actionLabel: "Show donors missing details for the donations return",
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
        isSynced={result.type === "complete"}
        missingPartyIds={missingIds}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onView={handleView}
      />
      {viewing ? (
        <Suspense
          fallback={
            <PendingContributionSheet onOpenChange={handleDetailOpenChange} />
          }
        >
          <ContributionDetailSheet
            canDelete={
              canManage &&
              isContributionDeletable(
                viewing.status ?? "received",
                viewing.refunds,
                viewing.receipts
              )
            }
            canEdit={
              canManage && isContributionEditable(viewing.status ?? "received")
            }
            contribution={viewing}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onOpenChange={handleDetailOpenChange}
          />
        </Suspense>
      ) : null}
      <ContributionFormDialog
        contribution={editing}
        onOpenChange={handleEditOpenChange}
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
  const canSeeReceipts = canReadReceipts((permission) =>
    hasPermission(permission as PermissionId)
  );
  const canIssueReceipts = hasPermission("donors.receipt");
  const tab =
    (requestedTab === "settlements" && !canSeeSettlements) ||
    (requestedTab === "receipts" && !canSeeReceipts)
      ? "contributions"
      : requestedTab;
  const [issueOpen, setIssueOpen] = useState(false);
  // "Issue receipts (N)": direct gifts ready for a receipt, loaded only on
  // the Receipts tab (the dialog loads its own on open) and refreshed as
  // contributions change (issuing marks them Receipted).
  const [contributionRows] = useQuery(queries.contribution.list());
  const candidates = useReceiptCandidates(
    canIssueReceipts && tab === "receipts" && !issueOpen,
    null,
    contributionsSignature(contributionRows as ContributionRow[])
  );
  const issueLabel =
    candidates === null
      ? "Issue receipts"
      : `Issue receipts (${candidates.eligible.length})`;
  const openIssue = useEventCallback(() => setIssueOpen(true));
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
  const openPayoutImport = useEventCallback(() => {
    navigate({ to: "/income/payout/import" });
  });
  const openBank = useEventCallback(() => {
    navigate({ to: "/income/bank" });
  });
  const openReturn = useEventCallback(() => {
    navigate({ to: "/income/return" });
  });
  const menuActions = [
    canManageContributions &&
      canManageOtherIncome && {
        icon: FileImportIcon,
        id: "import-payout",
        label: "Import give.do payout",
        onSelect: openPayoutImport,
      },
    {
      icon: FileValidationIcon,
      id: "donations-return",
      label: "Donations return",
      onSelect: openReturn,
    },
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
    canIssueReceipts &&
      tab !== "receipts" && {
        icon: Invoice03Icon,
        id: "issue-receipts",
        label: issueLabel,
        onSelect: openIssue,
      },
  ].filter((action) => action !== false);

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {tab === "receipts" && canIssueReceipts ? (
              <Button
                data-testid="issue-receipts"
                onClick={openIssue}
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Invoice03Icon}
                  strokeWidth={2}
                />
                {issueLabel}
              </Button>
            ) : tab === "settlements" &&
              canManageContributions &&
              canManageOtherIncome ? (
              <Button onClick={openPayoutImport} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={FileImportIcon}
                  strokeWidth={2}
                />
                Import give.do payout
              </Button>
            ) : canManageContributions ? (
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
        description="Donations and other money the trust has received, with the receipts Proud Indian issues for direct gifts."
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
          {canSeeReceipts ? (
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
          ) : null}
        </TabsList>
        {tab === "contributions" ? (
          <TabsContent
            className="mt-4 grid gap-6 *:min-w-0"
            value="contributions"
          >
            <ContributionsTab
              canManage={canManageContributions}
              onRecord={openContribution}
            />
          </TabsContent>
        ) : null}
        {tab === "other" ? (
          <TabsContent className="mt-4 grid gap-6 *:min-w-0" value="other">
            <Suspense fallback={<TableSkeleton />}>
              <OtherIncomeTab
                canManage={canManageOtherIncome}
                onRecord={openOther}
              />
            </Suspense>
          </TabsContent>
        ) : null}
        {tab === "imports" ? (
          <TabsContent className="mt-4 grid gap-6 *:min-w-0" value="imports">
            <Suspense fallback={<TableSkeleton />}>
              <ImportsTab
                canImport={canManageContributions}
                onImport={openImport}
              />
            </Suspense>
          </TabsContent>
        ) : null}
        {canSeeSettlements && tab === "settlements" ? (
          <TabsContent
            className="mt-4 grid gap-6 *:min-w-0"
            value="settlements"
          >
            <Suspense fallback={<TableSkeleton />}>
              <SettlementsTab />
            </Suspense>
          </TabsContent>
        ) : null}
        {canSeeReceipts && tab === "receipts" ? (
          <TabsContent className="mt-4 grid gap-6 *:min-w-0" value="receipts">
            <Suspense fallback={<TableSkeleton />}>
              <ReceiptsTab canIssue={canIssueReceipts} onIssue={openIssue} />
            </Suspense>
          </TabsContent>
        ) : null}
      </Tabs>
      {canIssueReceipts && issueOpen ? (
        <Suspense
          fallback={
            <PendingDialog
              description="Loading receipt details"
              onOpenChange={setIssueOpen}
              title="Issue receipts"
            />
          }
        >
          <IssueReceiptsDialog
            contributionIds={null}
            onOpenChange={setIssueOpen}
            open
          />
        </Suspense>
      ) : null}
      <ContributionFormDialog
        contribution={null}
        onOpenChange={setContributionOpen}
        open={contributionOpen}
      />
      {otherOpen ? (
        <Suspense
          fallback={
            <PendingDialog
              description="Loading income form"
              onOpenChange={setOtherOpen}
              title="Record other income"
            />
          }
        >
          <OtherIncomeFormDialog
            income={null}
            onOpenChange={setOtherOpen}
            open
          />
        </Suspense>
      ) : null}
    </div>
  );
}
