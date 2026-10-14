import {
  BankIcon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  FileImportIcon,
  MoneyExchange03Icon,
  Search01Icon,
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
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import type { StatementLineIgnoreReason } from "@pi-dash/shared/constants";
import { epochDayToIso } from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { log } from "evlog";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  IgnoreLineDialog,
  LineNoteDialog,
  LinkLineDialog,
} from "@/components/income/bank/statement-line-dialogs";
import {
  type LineActions,
  StatementLineItem,
  type StatementLineRow,
} from "@/components/income/bank/statement-line-row";
import { formatReceivedOn } from "@/components/income/contribution-detail-sheet";
import {
  ContributionFormDialog,
  type StatementLinePrefill,
} from "@/components/income/contribution-form-dialog";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { StatsCards, type StatItem } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import {
  findBankStatementMatches,
  getBankStatementSummary,
  updateStatementLine,
} from "@/functions/bank-statements";
import { guessChannel } from "@/lib/bank-statement/labels";
import type {
  BankStatementSummaryResponse,
  StatementLineAction,
} from "@/lib/bank-statement/types";
import { assertAnyPermission } from "@/lib/route-guards";

const LINE_TABS = ["review", "matched", "ignored", "all"] as const;
type LineTab = (typeof LINE_TABS)[number];

const ALL_MONTHS = "all";
const PAGE = 100;

export const Route = createFileRoute("/_app/income/bank/")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, "finance.view", "finance.manage"),
  component: BankStatementsPage,
  head: () => ({
    meta: [{ title: `Bank statements | ${env.VITE_APP_NAME}` }],
  }),
});

const inTab = (line: StatementLineRow, tab: LineTab) => {
  if (tab === "review") {
    return line.matchStatus === "unmatched";
  }
  if (tab === "matched") {
    return line.matchStatus === "matched";
  }
  if (tab === "ignored") {
    return line.matchStatus === "ignored";
  }
  return true;
};

const monthOf = (line: StatementLineRow) =>
  epochDayToIso(line.valueOn).slice(0, 7);
const monthLabel = (month: string) =>
  format(new Date(`${month}-01T00:00:00`), "MMM yyyy");

/** Changes whenever a line is added, matched, ignored or reopened. */
const linesSignature = (lines: readonly StatementLineRow[]) =>
  lines.map((l) => `${l.id}:${l.matchStatus}:${l.updatedAt}`).join("|");

function useSummary(orgAccountId: string | null, refreshKey: string) {
  const load = useServerFn(getBankStatementSummary);
  const [state, setState] = useState<BankStatementSummaryResponse | null>(null);
  useEffect(() => {
    if (!orgAccountId) {
      setState(null);
      return;
    }
    let cancelled = false;
    load({ data: { orgAccountId } })
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "income.bankStatementSummary",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "BankStatementsPage",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [orgAccountId, refreshKey, load]);
  return state;
}

function summaryItems(
  summary: BankStatementSummaryResponse | null
): StatItem[] {
  const dash = "—";
  return [
    {
      hint: "The balance the bank printed on the latest imported line that shows one.",
      icon: BankIcon,
      label: summary?.closing
        ? `Closing balance ${formatReceivedOn(new Date(`${summary.closing.valueOn}T00:00:00Z`).getTime())}`
        : "Closing balance",
      value: summary?.closing
        ? formatPaise(summary.closing.balancePaise)
        : dash,
    },
    {
      icon: CheckmarkCircle02Icon,
      label: "Credits matched",
      value: summary
        ? `${summary.creditsMatchedCount.toLocaleString("en-IN")} / ${summary.creditCount.toLocaleString("en-IN")}`
        : dash,
    },
    {
      icon: Search01Icon,
      label: "To review",
      tone: summary && summary.unmatchedCount > 0 ? "warning" : "neutral",
      value: summary ? summary.unmatchedCount : dash,
    },
    {
      hint: "Imported Razorpay gifts, less fees, GST and refunds, less what Razorpay has paid out.",
      icon: MoneyExchange03Icon,
      label: "Razorpay clearing",
      value:
        summary && summary.razorpayClearingPaise !== null
          ? formatPaise(summary.razorpayClearingPaise)
          : dash,
    },
    {
      hint: "give.do gifts received, less give.do payouts matched to bank lines. Payouts are not split across gifts yet.",
      icon: Coins01Icon,
      label: "give.do clearing",
      value: summary ? formatPaise(summary.giveDoClearingPaise) : dash,
    },
  ];
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function BankStatementsPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const canRecord = canManage && hasPermission("donors.manage");
  const navigate = useNavigate();
  const act = useServerFn(updateStatementLine);
  const findMatches = useServerFn(findBankStatementMatches);

  const [accounts, accountsResult] = useQuery(queries.orgAccount.active());
  const banks = accounts.filter((account) => account.kind === "bank");
  const [requestedAccount, setAccount] = useQueryState(
    "account",
    parseAsString
  );
  const accountId =
    banks.find((b) => b.id === requestedAccount)?.id ?? banks[0]?.id ?? null;
  const [month, setMonth] = useQueryState(
    "month",
    parseAsString.withDefault(ALL_MONTHS)
  );
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(LINE_TABS).withDefault("review")
  );

  const [lineRows, linesResult] = useQuery(
    queries.statementLine.byAccount({ orgAccountId: accountId ?? "" }),
    { enabled: accountId !== null }
  );
  const lines = lineRows as StatementLineRow[];
  const loading = lines.length === 0 && linesResult.type !== "complete";
  const summary = useSummary(accountId, linesSignature(lines));

  const months = [...new Set(lines.map(monthOf))].sort().reverse();
  const inMonth = lines.filter(
    (line) => month === ALL_MONTHS || monthOf(line) === month
  );
  const counts = Object.fromEntries(
    LINE_TABS.map((t) => [t, inMonth.filter((line) => inTab(line, t)).length])
  ) as Record<LineTab, number>;
  const visible = inMonth.filter((line) => inTab(line, tab));
  const [shown, setShown] = useState(PAGE);

  const [recording, setRecording] = useState<StatementLinePrefill | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [noting, setNoting] = useState<StatementLineRow | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  const run = useEventCallback(
    async (input: StatementLineAction, success: string): Promise<boolean> => {
      try {
        await act({ data: input });
        toast.success(success);
        return true;
      } catch (error) {
        toast.error("Couldn't update the line", {
          description: errorMessage(error),
        });
        return false;
      }
    }
  );

  const actions: LineActions = {
    onAccept: (line) => {
      run({ action: "accept", lineId: line.id }, "Line matched");
    },
    onDismiss: (line) => {
      run({ action: "dismiss", lineId: line.id }, "Suggestion dismissed");
    },
    onGiveIndia: (line) => {
      run({ action: "giveindia", lineId: line.id }, "Marked as give.do payout");
    },
    onIgnore: (line) => setIgnoring(line.id),
    onLink: (line) => setLinking(line.id),
    onNote: (line) => setNoting(line),
    onRecord: (line) =>
      setRecording({
        amountPaise: line.amountPaise,
        channel: guessChannel(line.narration ?? ""),
        id: line.id,
        orgAccountId: line.orgAccountId,
        reference: line.reference ?? null,
        valueOn: epochDayToIso(line.valueOn),
      }),
    onTransfer: (line) => setTransferring(line.id),
    onUnmatch: (line) => {
      run({ action: "unmatch", lineId: line.id }, "Line reopened");
    },
  };

  const runFindMatches = useEventCallback(async () => {
    if (!accountId) {
      return;
    }
    setFinding(true);
    try {
      const result = await findMatches({ data: { orgAccountId: accountId } });
      toast.success(
        `${result.matched.toLocaleString("en-IN")} matched, ${result.suggested.toLocaleString("en-IN")} with a suggestion`
      );
    } catch (error) {
      toast.error("Couldn't find matches", {
        description: errorMessage(error),
      });
    } finally {
      setFinding(false);
    }
  });
  const openImport = useEventCallback(() =>
    navigate({
      search: accountId ? { account: accountId } : {},
      to: "/income/bank/import",
    })
  );

  const noBanks = banks.length === 0 && accountsResult.type === "complete";

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <>
              <Button onClick={openImport} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={FileImportIcon}
                  strokeWidth={2}
                />
                Import statement
              </Button>
              <PageHeaderMenu
                actions={[
                  accountId !== null && {
                    disabled: finding,
                    icon: Search01Icon,
                    id: "find-matches",
                    label: "Find matches",
                    onSelect: runFindMatches,
                  },
                ]}
                title="Bank statement actions"
              />
            </>
          ) : null
        }
        description="Lines imported from bank statements, matched to Razorpay settlements, donations and give.do payouts. A line never becomes a donation by itself."
        title="Bank statements"
      />
      {noBanks ? (
        <NotFoundState
          description="Add a bank account in Settings → Organisation accounts, then import its statement here."
          icon={BankIcon}
          title="No bank accounts"
        />
      ) : (
        <div className="mt-4 grid gap-4 *:min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              onValueChange={(value) => {
                setAccount(value as string);
                setMonth(null);
                setShown(PAGE);
              }}
              value={accountId ?? ""}
            >
              <SelectTrigger aria-label="Bank account" className="w-64">
                <SelectValue placeholder="Bank account">
                  {banks.find((b) => b.id === accountId)?.name ??
                    "Bank account"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                setMonth(value === ALL_MONTHS ? null : (value as string));
                setShown(PAGE);
              }}
              value={month}
            >
              <SelectTrigger aria-label="Month" className="w-40">
                <SelectValue placeholder="All months">
                  {month === ALL_MONTHS ? "All months" : monthLabel(month)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MONTHS}>All months</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <StatsCards items={summaryItems(summary)} />
          <Tabs
            onValueChange={(value) => {
              setTab(value as LineTab);
              setShown(PAGE);
            }}
            value={tab}
          >
            <TabsList>
              <TabsTrigger value="review">
                To review {counts.review}
              </TabsTrigger>
              <TabsTrigger value="matched">
                Matched {counts.matched}
              </TabsTrigger>
              <TabsTrigger value="ignored">
                Ignored {counts.ignored}
              </TabsTrigger>
              <TabsTrigger value="all">All {counts.all}</TabsTrigger>
            </TabsList>
          </Tabs>
          {!loading && visible.length === 0 ? (
            <NotFoundState
              actions={
                canManage && lines.length === 0 ? (
                  <Button onClick={openImport} type="button">
                    Import statement
                  </Button>
                ) : null
              }
              description={
                lines.length === 0
                  ? "Import this account's statement as CSV to see its lines here."
                  : "Nothing here for this month."
              }
              icon={
                tab === "review" && lines.length > 0
                  ? CheckmarkCircle02Icon
                  : BankIcon
              }
              title={
                lines.length === 0
                  ? "No statement lines yet"
                  : tab === "review"
                    ? "All lines are matched or ignored"
                    : "No lines"
              }
            />
          ) : (
            <ul
              className="divide-y rounded-lg border"
              data-testid="statement-lines"
            >
              {visible.slice(0, shown).map((line) => (
                <StatementLineItem
                  actions={actions}
                  canManage={canManage}
                  canRecord={canRecord}
                  key={line.id}
                  line={line}
                />
              ))}
            </ul>
          )}
          {visible.length > shown ? (
            <div>
              <Button
                onClick={() => setShown((n) => n + PAGE)}
                type="button"
                variant="outline"
              >
                Show more
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <ContributionFormDialog
        contribution={null}
        fromLine={recording}
        onOpenChange={(open) => {
          if (!open) {
            setRecording(null);
          }
        }}
        open={recording !== null}
      />
      <LinkLineDialog
        lineId={linking}
        onOpenChange={(open) => {
          if (!open) {
            setLinking(null);
          }
        }}
        onSubmit={async (kind, targetId) => {
          if (
            linking &&
            (await run(
              { action: "link", kind, lineId: linking, targetId },
              "Line matched"
            ))
          ) {
            setLinking(null);
          }
        }}
      />
      <IgnoreLineDialog
        onOpenChange={(open) => {
          if (!open) {
            setIgnoring(null);
          }
        }}
        onSubmit={async (reason: StatementLineIgnoreReason, note: string) => {
          if (
            ignoring &&
            (await run(
              {
                action: "ignore",
                lineId: ignoring,
                note: note || null,
                reason,
              },
              "Line ignored"
            ))
          ) {
            setIgnoring(null);
          }
        }}
        open={ignoring !== null}
      />
      <LineNoteDialog
        description="Money moved between the trust's own accounts. It needs no other match."
        initial=""
        onOpenChange={(open) => {
          if (!open) {
            setTransferring(null);
          }
        }}
        onSubmit={async (note) => {
          if (
            transferring &&
            (await run(
              { action: "transfer", lineId: transferring, note: note || null },
              "Marked as transfer"
            ))
          ) {
            setTransferring(null);
          }
        }}
        open={transferring !== null}
        submitLabel="Mark as transfer"
        title="Mark as transfer"
      />
      <LineNoteDialog
        description="A short note for whoever reviews this line next."
        initial={noting?.note ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setNoting(null);
          }
        }}
        onSubmit={async (note) => {
          if (
            noting &&
            (await run(
              { action: "note", lineId: noting.id, note: note || null },
              "Note saved"
            ))
          ) {
            setNoting(null);
          }
        }}
        open={noting !== null}
        submitLabel="Save note"
        title={noting?.note ? "Edit note" : "Add note"}
      />
    </div>
  );
}
