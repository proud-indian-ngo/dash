import {
  Book02Icon,
  FileValidationIcon,
  SquareLock01Icon,
  SquareUnlock01Icon,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { env } from "@pi-dash/env/web";
import {
  accountBalances,
  type BalanceLine,
  balanceSummary,
  BOOKS_VIEW_PERMISSIONS,
  booksAsOf,
  LEDGER_CUTOVER_ON,
} from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";

import { AccountsRail } from "@/components/books/accounts-rail";
import { BalanceSummaryTab } from "@/components/books/balance-summary-tab";
import { CashBookTab } from "@/components/books/cash-book-tab";
import { IncomeExpenditureTab } from "@/components/books/income-expenditure-tab";
import { formatDay } from "@/components/books/labels";
import {
  booksAccounts,
  defaultYear,
  useBooks,
} from "@/components/books/use-books";
import {
  CloseYearDialog,
  ReopenYearDialog,
} from "@/components/books/year-close-dialogs";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { DATE_TIME } from "@/lib/date-formats";
import { assertAnyPermission } from "@/lib/route-guards";

const BOOK_TABS = ["cash", "income", "balance"] as const;
type BookTab = (typeof BOOK_TABS)[number];

export const Route = createFileRoute("/_app/finance/books/")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...BOOKS_VIEW_PERMISSIONS),
  component: BooksPage,
  head: () => ({
    meta: [{ title: `Books | ${env.VITE_APP_NAME}` }],
  }),
});

function BooksPage() {
  const { hasPermission } = useApp();
  const navigate = useNavigate();
  const books = useBooks();
  const [yearParam, setYearParam] = useQueryState("year", parseAsString);
  const [accountParam, setAccountParam] = useQueryState(
    "account",
    parseAsString
  );
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(BOOK_TABS).withDefault("cash")
  );
  const [yearEvents] = useQuery(queries.ledger.yearEvents());
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const year =
    books.years.find((y) => y.label === yearParam) ??
    defaultYear(books.years, books.today);
  const accounts = booksAccounts(books);

  if (books.isLoading) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <PageHeader title="Books" />
        <TableSkeleton />
      </div>
    );
  }
  if (!year) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <PageHeader title="Books" />
        <NotFoundState
          description="Financial years appear here once they are set up."
          icon={Book02Icon}
          title="No financial years"
        />
      </div>
    );
  }

  const range = { endsOn: year.endsOn, startsOn: year.startsOn };
  const asOf = booksAsOf(range, books.today);
  const balances = accountBalances(books.movements, asOf);
  const railAccounts = accounts.map((a) => ({
    active: a.active !== false,
    balancePaise: balances.get(a.id) ?? 0,
    id: a.id,
    kind: a.kind,
    name: a.name,
  }));
  const account =
    accounts.find((a) => a.id === accountParam) ?? accounts[0] ?? null;
  const closed = year.closedAt !== null;
  const hasOpening = books.openingBalances.some(
    (o) => o.fiscalYearId === year.id && !o.reversalPostingId
  );

  const headNames = new Map(books.heads.map((h) => [h.id, h.name]));
  const fundNames = new Map(books.funds.map((f) => [f.id, f.name]));
  const accountNames = new Map(books.accounts.map((a) => [a.id, a.name]));
  const programmeNames = new Map(books.programmes.map((p) => [p.id, p.name]));
  const nameOf = (line: BalanceLine) => {
    if (line.kind === "account") {
      return accountNames.get(line.key) ?? "Account";
    }
    if (line.kind === "fund") {
      return fundNames.get(line.key) ?? "Fund";
    }
    if (line.kind === "surplus") {
      return "Income less expenditure";
    }
    return headNames.get(line.key) ?? "Account head";
  };
  const summary = balanceSummary({
    accountIds: accounts.map((a) => a.id),
    asOf,
    entries: books.entries,
    movements: books.movements,
  });

  const lastEvent = yearEvents.find((e) => e.fiscalYearId === year.id);
  const canPostOpening = hasPermission("finance.post_opening");
  const openOpening = () => navigate({ to: "/finance/books/opening" });

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
                {books.years.map((y) => (
                  <SelectItem key={y.id} value={y.label}>
                    FY {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canPostOpening &&
            !hasOpening &&
            year.startsOn === LEDGER_CUTOVER_ON ? (
              <Button onClick={openOpening} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={FileValidationIcon}
                  strokeWidth={2}
                />
                Enter opening balances
              </Button>
            ) : null}
            <PageHeaderMenu
              actions={[
                {
                  icon: FileValidationIcon,
                  id: "opening",
                  label: "Opening balances",
                  onSelect: openOpening,
                },
                !closed &&
                  year.startsOn <= books.today &&
                  hasPermission("finance.close_year") && {
                    icon: SquareLock01Icon,
                    id: "close",
                    label: `Close ${year.label}`,
                    onSelect: () => setClosing(true),
                  },
                closed &&
                  hasPermission("finance.reopen_year") && {
                    icon: SquareUnlock01Icon,
                    id: "reopen",
                    label: `Reopen ${year.label}`,
                    onSelect: () => setReopening(true),
                  },
              ]}
              title="Books actions"
            />
          </>
        }
        badge={
          closed ? (
            <StatusBadge data-testid="year-status" tone="neutral">
              Closed
            </StatusBadge>
          ) : (
            <StatusBadge data-testid="year-status" tone="success">
              Open
            </StatusBadge>
          )
        }
        description={`The trust's cash book and income and expenditure for FY ${year.label}, with balances as of ${formatDay(asOf)}.`}
        title="Books"
      />
      {lastEvent ? (
        <p
          className="text-muted-foreground mt-2 text-sm"
          data-testid="year-history"
        >
          {lastEvent.action === "close" ? "Closed" : "Reopened"}{" "}
          {format(lastEvent.occurredAt, DATE_TIME)}
          {lastEvent.actor ? ` by ${lastEvent.actor.name}` : ""}
          {lastEvent.reason ? `: ${lastEvent.reason}` : ""}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 *:min-w-0 xl:grid-cols-[16rem_1fr]">
        {accounts.length === 0 ? (
          <NotFoundState
            description="Add the current account and the fixed deposit in Settings → Organisation accounts."
            icon={Book02Icon}
            title="No accounts"
          />
        ) : (
          <AccountsRail
            accounts={railAccounts}
            onSelect={(id) => {
              setAccountParam(id);
              setTab("cash");
            }}
            selectedId={tab === "cash" ? (account?.id ?? null) : null}
          />
        )}
        <Tabs onValueChange={(value) => setTab(value as BookTab)} value={tab}>
          <TabsList>
            <TabsTrigger value="cash">Cash book</TabsTrigger>
            <TabsTrigger value="income">Income & expenditure</TabsTrigger>
            <TabsTrigger value="balance">Balance summary</TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="cash">
            {account ? (
              <CashBookTab
                accountName={account.name}
                isLoading={books.isLoading}
                movements={books.movements}
                orgAccountId={account.id}
                postings={books.postings}
                range={range}
              />
            ) : null}
          </TabsContent>
          <TabsContent className="mt-4" value="income">
            <IncomeExpenditureTab
              entries={books.entries}
              headNames={headNames}
              isLoading={books.isLoading}
              programmeNames={programmeNames}
              range={range}
            />
          </TabsContent>
          <TabsContent className="mt-4" value="balance">
            <BalanceSummaryTab asOf={asOf} nameOf={nameOf} summary={summary} />
          </TabsContent>
        </Tabs>
      </div>
      <CloseYearDialog
        fiscalYearId={year.id}
        label={year.label}
        onOpenChange={setClosing}
        open={closing}
      />
      <ReopenYearDialog
        fiscalYearId={year.id}
        label={year.label}
        onOpenChange={setReopening}
        open={reopening}
      />
    </div>
  );
}
