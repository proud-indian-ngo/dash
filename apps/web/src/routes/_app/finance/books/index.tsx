import {
  Book02Icon,
  BookUploadIcon,
  Audit01Icon,
  FileDownloadIcon,
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
  BOOKS_PAGE_PERMISSIONS,
  booksAsOf,
  LEDGER_CUTOVER_ON,
} from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useState } from "react";

import { AccountsRail } from "@/components/books/accounts-rail";
import { auditedDriftCount } from "@/components/books/audited-lines";
import { BalanceSummaryPanel } from "@/components/books/balance-summary-tab";
import {
  CaWorkbookLabel,
  caWorkbookBlocker,
  useCaWorkbookDownload,
} from "@/components/books/ca-workbook";
import { CashBookTab } from "@/components/books/cash-book-tab";
import { IncomeExpenditureTab } from "@/components/books/income-expenditure-tab";
import { formatDay } from "@/components/books/labels";
import {
  booksAccounts,
  defaultYear,
  useBooks,
} from "@/components/books/use-books";
import {
  usePostPending,
  WaitingToPost,
} from "@/components/books/waiting-to-post";
import { Loader } from "@/components/loader";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { DATE_TIME } from "@/lib/date-formats";
import { assertAnyPermission } from "@/lib/route-guards";

const BOOK_TABS = ["cash", "income", "balance"] as const;
type BookTab = (typeof BOOK_TABS)[number];

const loadYearCloseDialogs = () =>
  import("@/components/books/year-close-dialogs");
const CloseYearDialog = lazy(() =>
  loadYearCloseDialogs().then((module) => ({
    default: module.CloseYearDialog,
  }))
);
const ReopenYearDialog = lazy(() =>
  loadYearCloseDialogs().then((module) => ({
    default: module.ReopenYearDialog,
  }))
);

function PendingDialog({
  description,
  onOpenChange,
  title,
}: {
  description: string;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-24 items-center justify-center">
          <Loader />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_app/finance/books/")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...BOOKS_PAGE_PERMISSIONS),
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
  // ?close=1 (from Audited figures, after a match) opens the close dialog.
  const [closeParam, setCloseParam] = useQueryState("close", parseAsString);
  const [closing, setClosing] = useState(closeParam === "1");
  const { post: postPending, posting } = usePostPending();
  const canPostPending = hasPermission("finance.post_pending");
  const [reopening, setReopening] = useState(false);
  const workbook = useCaWorkbookDownload();

  const year =
    books.years.find((y) => y.label === yearParam) ??
    defaultYear(books.years, books.today);
  const accounts = booksAccounts(books);

  if (books.cashLoading) {
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

  // The workbook starts from the cutover year's opening balances.
  const openingPosted = books.openingBalances.some(
    (o) =>
      !o.reversalPostingId &&
      books.years.some(
        (y) => y.id === o.fiscalYearId && y.startsOn === LEDGER_CUTOVER_ON
      )
  );
  const workbookBlocker = caWorkbookBlocker({
    openingPosted,
    startsBeforeCutover: year.startsOn < LEDGER_CUTOVER_ON,
  });

  const lastEvent = yearEvents.find((e) => e.fiscalYearId === year.id);
  const driftCount = books.auditedLoading ? 0 : auditedDriftCount(books, year);
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
                canPostPending && {
                  disabled: posting,
                  icon: BookUploadIcon,
                  id: "post-pending",
                  label: posting ? "Posting..." : "Post pending",
                  onSelect: postPending,
                },
                {
                  disabled: workbook.downloading || workbookBlocker !== null,
                  icon: FileDownloadIcon,
                  id: "ca-workbook",
                  label: workbook.downloading ? (
                    "Building workbook..."
                  ) : (
                    <CaWorkbookLabel blocker={workbookBlocker} />
                  ),
                  onSelect: () => workbook.download(year.id),
                },
                {
                  icon: FileValidationIcon,
                  id: "opening",
                  label: "Opening balances",
                  onSelect: openOpening,
                },
                {
                  icon: Audit01Icon,
                  id: "audited",
                  label: "Audited figures",
                  onSelect: () =>
                    navigate({
                      search: { year: year.label } as never,
                      to: "/finance/books/audited",
                    }),
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
      {driftCount > 0 ? (
        <p
          className="text-warning-foreground mt-3 rounded-lg border px-3 py-2.5 text-sm"
          data-testid="audited-drift-banner"
          role="status"
        >
          The books changed since FY {year.label}'s audited figures were
          matched: {driftCount} line{driftCount === 1 ? "" : "s"} no longer
          equal them.{" "}
          <Link
            className="underline underline-offset-4"
            search={{ year: year.label } as never}
            to="/finance/books/audited"
          >
            Open the audited figures
          </Link>
        </p>
      ) : null}
      <WaitingToPost canPost={canPostPending} />
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
                isLoading={books.cashLoading}
                movements={books.movements}
                orgAccountId={account.id}
                postings={books.postings}
                range={range}
              />
            ) : null}
          </TabsContent>
          {tab === "income" ? (
            <TabsContent className="mt-4" value="income">
              <IncomeExpenditureTab
                entries={books.entries}
                headNames={
                  new Map(books.heads.map((head) => [head.id, head.name]))
                }
                isLoading={books.isLoading}
                postings={books.postings}
                programmeNames={
                  new Map(
                    books.programmes.map((programme) => [
                      programme.id,
                      programme.name,
                    ])
                  )
                }
                range={range}
              />
            </TabsContent>
          ) : null}
          {tab === "balance" ? (
            <TabsContent className="mt-4" value="balance">
              {books.isLoading ? (
                <TableSkeleton />
              ) : (
                <BalanceSummaryPanel
                  accountIds={accounts.map((item) => item.id)}
                  asOf={asOf}
                  books={books}
                  startsOn={year.startsOn}
                />
              )}
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
      {closing &&
      !closed &&
      year.startsOn <= books.today &&
      hasPermission("finance.close_year") ? (
        <Suspense
          fallback={
            <PendingDialog
              description="Loading the year close checklist"
              onOpenChange={(open) => {
                setClosing(open);
                if (!open && closeParam) {
                  setCloseParam(null);
                }
              }}
              title={`Close ${year.label}`}
            />
          }
        >
          <CloseYearDialog
            fiscalYearId={year.id}
            label={year.label}
            onOpenChange={(open) => {
              setClosing(open);
              if (!open && closeParam) {
                setCloseParam(null);
              }
            }}
            open
          />
        </Suspense>
      ) : null}
      {reopening ? (
        <Suspense
          fallback={
            <PendingDialog
              description="Loading the reopen year form"
              onOpenChange={setReopening}
              title={`Reopen ${year.label}`}
            />
          }
        >
          <ReopenYearDialog
            fiscalYearId={year.id}
            label={year.label}
            onOpenChange={setReopening}
            open
          />
        </Suspense>
      ) : null}
    </div>
  );
}
