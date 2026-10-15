import { Undo02Icon, FileValidationIcon } from "@hugeicons/core-free-icons";
import { env } from "@pi-dash/env/web";
import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";
import { epochDayToIso } from "@pi-dash/shared/income";
import {
  BOOKS_VIEW_PERMISSIONS,
  LEDGER_CUTOVER_ON,
} from "@pi-dash/shared/ledger";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { formatDay } from "@/components/books/labels";
import { OpeningBalanceForm } from "@/components/books/opening-balance-form";
import {
  OpeningBalanceView,
  type OpeningViewSection,
  ReverseOpeningDialog,
} from "@/components/books/opening-balance-view";
import { type Books, useBooks } from "@/components/books/use-books";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/finance/books/opening")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(
      context,
      ...BOOKS_VIEW_PERMISSIONS,
      "finance.post_opening"
    ),
  component: OpeningBalancesPage,
  head: () => ({
    meta: [{ title: `Opening balances | ${env.VITE_APP_NAME}` }],
  }),
});

/** The posted document's lines, read back from its posting. */
function postedSections(books: Books, postingId: string): OpeningViewSection[] {
  const accountNames = new Map(books.accounts.map((a) => [a.id, a.name]));
  const headNames = new Map(books.heads.map((h) => [h.id, h.name]));
  const fundNames = new Map(books.funds.map((f) => [f.id, f.name]));
  const entries = books.entries.filter((e) => e.postingId === postingId);
  const byType = (type: string) =>
    entries
      .filter((e) => e.headType === type)
      .map((e) => ({
        id: e.id,
        label:
          type === "fund"
            ? (fundNames.get(e.fundId) ?? "Fund")
            : (e.memo ?? headNames.get(e.accountHeadId) ?? "Line"),
        paise: e.amountPaise,
      }));
  return [
    {
      lines: books.movements
        .filter((m) => m.postingId === postingId)
        .map((m) => ({
          id: m.id,
          label: accountNames.get(m.orgAccountId) ?? "Account",
          paise: m.amountPaise,
        })),
      title: "Money in the accounts",
    },
    { lines: byType("asset"), title: "Fixed assets" },
    { lines: byType("liability"), title: "Liabilities" },
    { lines: byType("fund"), title: "Funds" },
  ];
}

function OpeningBalancesPage() {
  const { hasPermission } = useApp();
  const books = useBooks();
  const [reversing, setReversing] = useState(false);
  const canPost = hasPermission("finance.post_opening");
  const year = books.years.find((y) => y.startsOn === LEDGER_CUTOVER_ON);
  const live = year
    ? books.openingBalances.find(
        (o) => o.fiscalYearId === year.id && !o.reversalPostingId
      )
    : undefined;
  const reversedCount = year
    ? books.openingBalances.filter(
        (o) => o.fiscalYearId === year.id && o.reversalPostingId
      ).length
    : 0;
  const container = "app-container mx-auto max-w-7xl px-2 py-6 sm:px-4";

  if (books.isLoading) {
    return (
      <div className={container}>
        <PageHeader title="Opening balances" />
        <TableSkeleton />
      </div>
    );
  }
  if (!year) {
    return (
      <div className={container}>
        <PageHeader title="Opening balances" />
        <NotFoundState
          description="The financial year the books start in isn't set up yet."
          icon={FileValidationIcon}
          title="No starting year"
        />
      </div>
    );
  }

  if (live) {
    return (
      <div className={container}>
        <PageHeader
          actions={
            canPost && year.closedAt === null ? (
              <PageHeaderMenu
                actions={[
                  {
                    destructive: true,
                    group: "destructive",
                    icon: Undo02Icon,
                    id: "reverse",
                    label: "Reverse opening balances",
                    onSelect: () => setReversing(true),
                  },
                ]}
                title="Opening balance actions"
              />
            ) : null
          }
          badge={<StatusBadge tone="success">Posted</StatusBadge>}
          meta={[
            `As at ${formatDay(epochDayToIso(live.asOn))}`,
            `Confirmed by ${live.caName} on ${formatDay(epochDayToIso(live.caConfirmedOn))}`,
            reversedCount > 0
              ? `${reversedCount} earlier version reversed`
              : null,
          ]}
          title="Opening balances"
        />
        <div className="mt-6">
          <OpeningBalanceView
            sections={postedSections(books, live.postingId)}
          />
        </div>
        <ReverseOpeningDialog
          id={live.id}
          onOpenChange={setReversing}
          open={reversing}
        />
      </div>
    );
  }

  const headTypes = new Map(books.heads.map((h) => [h.id, h.type]));
  const referenceDataMissing = [
    [LEDGER_ACCOUNT_HEAD_IDS.fixedAssets, "asset"],
    [LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable, "liability"],
    [LEDGER_ACCOUNT_HEAD_IDS.fundBalance, "fund"],
  ].some(([id, type]) => headTypes.get(id as string) !== type);
  if (referenceDataMissing) {
    return (
      <div className={container}>
        <PageHeader title="Opening balances" />
        <NotFoundState
          description="The Fixed assets, Audit fees payable or Fund balance account head couldn't be created, usually because another head already uses its code. Ask an administrator to check the server log."
          icon={FileValidationIcon}
          title="Books reference data missing"
        />
      </div>
    );
  }

  const formAccounts = books.accounts
    .filter((a) => a.active && a.kind !== "cash")
    .sort((a, b) => a.name.localeCompare(b.name));
  const formFunds = books.funds
    .filter((f) => f.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className={container}>
      <PageHeader
        description={`The balances the books start from on ${formatDay(year.startsOn)}, from the CA-confirmed audited statements. Posted once; a correction reverses them and posts again.`}
        title="Opening balances"
      />
      <div className="mt-6">
        {canPost && year.closedAt === null ? (
          <OpeningBalanceForm
            accounts={formAccounts}
            fiscalYearId={year.id}
            funds={formFunds}
            label={year.label}
          />
        ) : (
          <NotFoundState
            description="A finance admin enters them from the audited statements."
            icon={FileValidationIcon}
            title="No opening balances yet"
          />
        )}
      </div>
    </div>
  );
}
