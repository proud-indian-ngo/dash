import {
  FileValidationIcon,
  Undo02Icon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { env } from "@pi-dash/env/web";
import {
  type BalanceSheetLine,
  balanceSheetLines,
} from "@pi-dash/shared/audited-figures";
import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";
import { epochDayToIso } from "@pi-dash/shared/income";
import {
  BOOKS_VIEW_PERMISSIONS,
  LEDGER_CUTOVER_ON,
} from "@pi-dash/shared/ledger";
import { createFileRoute } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";

import {
  type AuditedFormLine,
  AuditedFiguresForm,
} from "@/components/books/audited-figures-form";
import {
  AuditedFiguresView,
  type AuditedViewSection,
  ReverseAuditedDialog,
  SkipAuditedDialog,
} from "@/components/books/audited-figures-view";
import { formatDay } from "@/components/books/labels";
import {
  type Books,
  type BooksYear,
  booksAccounts,
  useBooks,
} from "@/components/books/use-books";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/finance/books/audited")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...BOOKS_VIEW_PERMISSIONS, "finance.adjust"),
  component: AuditedFiguresPage,
  head: () => ({
    meta: [{ title: `Audited figures | ${env.VITE_APP_NAME}` }],
  }),
});

const CONTAINER = "app-container mx-auto max-w-7xl px-2 py-6 sm:px-4";

/** The year shown: the one asked for, else the latest ended year, else the latest. */
function pickYear(books: Books, label: string | null): BooksYear | undefined {
  return (
    books.years.find((y) => y.label === label) ??
    books.years.find((y) => y.endsOn < books.today) ??
    books.years[0]
  );
}

/** Each balance sheet line at the year end, named, in the order the page lists them. */
function formLines(books: Books, year: BooksYear): AuditedFormLine[] {
  const accounts = booksAccounts(books);
  const accountKinds = new Map(accounts.map((a) => [a.id, a.kind]));
  const lines = balanceSheetLines({
    accountIds: accounts.map((a) => a.id),
    asOf: year.endsOn,
    entries: books.entries,
    fundIds: books.funds.filter((f) => f.active).map((f) => f.id),
    movements: books.movements,
  });
  const label = lineLabeller(books);
  const named = lines.map((l) => ({
    ...l,
    accountKind: l.orgAccountId ? accountKinds.get(l.orgAccountId) : undefined,
    label: label(l),
  }));
  const accountLines = named.filter((l) => l.kind === "account");
  const rest = named
    .filter((l) => l.kind !== "account")
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.label.localeCompare(b.label)
    );
  return [...accountLines, ...rest];
}

const KIND_ORDER = ["asset", "liability", "fund"];

function lineLabeller(books: Books) {
  const accountNames = new Map(books.accounts.map((a) => [a.id, a.name]));
  const headNames = new Map(books.heads.map((h) => [h.id, h.name]));
  const fundNames = new Map(books.funds.map((f) => [f.id, f.name]));
  return (
    l: Pick<
      BalanceSheetLine,
      "accountHeadId" | "fundId" | "kind" | "memo" | "orgAccountId"
    >
  ) => {
    if (l.kind === "account") {
      return accountNames.get(l.orgAccountId ?? "") ?? "Account";
    }
    if (l.kind === "fund") {
      return fundNames.get(l.fundId ?? "") ?? "Fund";
    }
    const head = headNames.get(l.accountHeadId ?? "") ?? "Account head";
    if (l.memo) {
      return l.memo;
    }
    return l.kind === "asset" &&
      l.accountHeadId === LEDGER_ACCOUNT_HEAD_IDS.fixedAssets
      ? `${head} — other`
      : head;
  };
}

type AuditedDocument = Books["auditedFigures"][number];

/** A matched document's lines beside the books as they stand now. */
function viewSections(
  books: Books,
  year: BooksYear,
  document: AuditedDocument
): {
  sections: AuditedViewSection[];
  transfers: Parameters<typeof AuditedFiguresView>[0]["transfers"];
} {
  const label = lineLabeller(books);
  const now = new Map(formLines(books, year).map((l) => [l.key, l.booksPaise]));
  const headNames = new Map(books.heads.map((h) => [h.id, h.name]));
  const fundNames = new Map(books.funds.map((f) => [f.id, f.name]));
  const stored = document.lines.filter((l) => l.kind !== "fund_transfer");
  const section = (title: string, kind: string): AuditedViewSection => ({
    lines: stored
      .filter((l) => l.kind === kind)
      .map((l) => ({
        adjustmentPaise: l.kind === "fund" ? 0 : l.auditedPaise - l.booksPaise,
        auditedPaise: l.auditedPaise,
        booksPaise: l.booksPaise,
        counterHeadName: l.counterHeadId
          ? (headNames.get(l.counterHeadId) ?? null)
          : null,
        key: l.lineKey,
        label: label({
          accountHeadId: l.accountHeadId ?? null,
          fundId: l.fundId ?? null,
          kind: l.kind as BalanceSheetLine["kind"],
          memo: l.memo ?? null,
          orgAccountId: l.orgAccountId ?? null,
        }),
        nowPaise: now.get(l.lineKey) ?? 0,
      })),
    title,
  });
  return {
    sections: [
      section("Money in the accounts", "account"),
      section("Assets", "asset"),
      section("Liabilities", "liability"),
      section("Funds", "fund"),
    ],
    transfers: document.lines
      .filter((l) => l.kind === "fund_transfer")
      .map((l) => ({
        amountPaise: l.auditedPaise,
        from: fundNames.get(l.fundId ?? "") ?? "Fund",
        id: l.id,
        reason: l.memo ?? "",
        to: fundNames.get(l.toFundId ?? "") ?? "Fund",
      })),
  };
}

function AuditedFiguresPage() {
  const { hasPermission } = useApp();
  const books = useBooks();
  const [yearParam, setYearParam] = useQueryState("year", parseAsString);
  const [reversing, setReversing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const canAdjust = hasPermission("finance.adjust");

  if (books.isLoading || books.auditedLoading) {
    return (
      <div className={CONTAINER}>
        <PageHeader title="Audited figures" />
        <TableSkeleton />
      </div>
    );
  }
  const year = pickYear(books, yearParam);
  if (!year) {
    return (
      <div className={CONTAINER}>
        <PageHeader title="Audited figures" />
        <NotFoundState
          description="Financial years appear here once they are set up."
          icon={FileValidationIcon}
          title="No financial years"
        />
      </div>
    );
  }

  const yearSelect = (
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
        {books.years.map((y) => (
          <SelectItem key={y.id} value={y.label}>
            FY {y.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const ended = year.endsOn < books.today;
  const closed = year.closedAt !== null;
  const documents = books.auditedFigures.filter(
    (d) => d.fiscalYearId === year.id
  );
  const live = documents.find((d) => !d.reversedAt);
  const reversedCount = documents.length - (live ? 1 : 0);
  const description = `The CA's signed balance sheet at ${formatDay(year.endsOn)}, line by line against the books. The differences post once, dated that day, so FY ${year.label} closes, and the next year opens, at the audited figures.`;

  if (live) {
    const canReverse = canAdjust && !(closed && live.postingId);
    const meta = [
      `As at ${formatDay(epochDayToIso(live.asOn))}`,
      live.status === "matched" && live.signedOn
        ? `Signed by ${live.caName} on ${formatDay(epochDayToIso(live.signedOn))}`
        : null,
      closed && live.postingId && canAdjust
        ? `Reopen FY ${year.label} to correct them`
        : null,
      reversedCount > 0 ? `${reversedCount} earlier version reversed` : null,
    ];
    const view = viewSections(books, year, live);
    return (
      <div className={CONTAINER}>
        <PageHeader
          actions={
            <>
              {yearSelect}
              {canReverse ? (
                <PageHeaderMenu
                  actions={[
                    {
                      destructive: true,
                      group: "destructive",
                      icon: Undo02Icon,
                      id: "reverse",
                      label:
                        live.status === "skipped"
                          ? "Reverse the skip"
                          : "Reverse audited figures",
                      onSelect: () => setReversing(true),
                    },
                  ]}
                  title="Audited figures actions"
                />
              ) : null}
            </>
          }
          badge={
            live.status === "skipped" ? (
              <StatusBadge data-testid="audited-status" tone="neutral">
                Skipped
              </StatusBadge>
            ) : (
              <StatusBadge data-testid="audited-status" tone="success">
                Matched
              </StatusBadge>
            )
          }
          meta={meta}
          title="Audited figures"
        />
        <div className="mt-6">
          {live.status === "skipped" ? (
            <p
              className="max-w-2xl rounded-lg border px-3 py-2.5 text-sm"
              data-testid="audited-skip-reason"
            >
              Skipped: {live.skipReason}
            </p>
          ) : (
            <AuditedFiguresView
              sections={view.sections}
              transfers={view.transfers}
            />
          )}
        </div>
        <ReverseAuditedDialog
          id={live.id}
          onOpenChange={setReversing}
          open={reversing}
        />
      </div>
    );
  }

  const started = year.startsOn <= books.today;
  const openingPosted = books.openingBalances.some(
    (o) =>
      !o.reversalPostingId &&
      books.years.some(
        (y) => y.id === o.fiscalYearId && y.startsOn === LEDGER_CUTOVER_ON
      )
  );
  let postBlocker: string | null = null;
  if (!openingPosted) {
    postBlocker = "Post the opening balances first.";
  } else if (!ended) {
    postBlocker = `FY ${year.label} ends on ${formatDay(year.endsOn)}: you can compare figures now, and post them once the year has ended and the CA has signed the statements.`;
  } else if (closed) {
    postBlocker = `Reopen FY ${year.label} to match its audited figures.`;
  }
  const activeHeads = books.heads.filter((h) => h.active !== false);
  return (
    <div className={CONTAINER}>
      <PageHeader
        actions={
          <>
            {yearSelect}
            {canAdjust && ended ? (
              <PageHeaderMenu
                actions={[
                  {
                    icon: UnavailableIcon,
                    id: "skip",
                    label: "Skip for this year",
                    onSelect: () => setSkipping(true),
                  },
                ]}
                title="Audited figures actions"
              />
            ) : null}
          </>
        }
        badge={
          <StatusBadge data-testid="audited-status" tone="warning">
            Not matched
          </StatusBadge>
        }
        description={description}
        meta={[
          reversedCount > 0
            ? `${reversedCount} earlier version reversed`
            : null,
        ]}
        title="Audited figures"
      />
      <div className="mt-6">
        {canAdjust && started ? (
          <AuditedFiguresForm
            balanceHeads={activeHeads.filter(
              (h) => h.type === "asset" || h.type === "liability"
            )}
            booksLines={formLines(books, year)}
            counterHeads={activeHeads.filter(
              (h) => h.type === "income" || h.type === "expense"
            )}
            fiscalYearId={year.id}
            funds={books.funds
              .filter((f) => f.active)
              .sort((a, b) => a.name.localeCompare(b.name))}
            key={year.id}
            postBlocker={postBlocker}
            yearLabel={year.label}
          />
        ) : (
          <NotFoundState
            description={
              started
                ? "A finance admin enters them from the CA's signed statements after the year ends."
                : `FY ${year.label} hasn't started yet.`
            }
            icon={FileValidationIcon}
            title="Not matched yet"
          />
        )}
      </div>
      <SkipAuditedDialog
        fiscalYearId={year.id}
        label={year.label}
        onOpenChange={setSkipping}
        open={skipping}
      />
    </div>
  );
}
