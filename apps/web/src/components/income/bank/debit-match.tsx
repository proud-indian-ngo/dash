import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { ScrollArea } from "@pi-dash/design-system/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { StatementDocumentAllocationKind } from "@pi-dash/shared/constants";
import { epochDayToIso } from "@pi-dash/shared/income";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { formatPaise, tryRupeesToPaise } from "@pi-dash/shared/money";
import type {
  Reimbursement,
  StatementAllocation,
  User,
  Vendor,
  VendorPayment,
  VendorPaymentTransaction,
} from "@pi-dash/zero/schema";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { formatIsoDate } from "@/components/income/bank/statement-line-dialogs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { searchDebitMatches } from "@/functions/bank-statements";
import {
  type DebitDifference,
  planDebitAllocation,
  remainingOf,
} from "@/lib/bank-statement/debit-match";
import {
  ALLOCATION_KIND_LABELS,
  DEBIT_REASON_LABELS,
} from "@/lib/bank-statement/labels";
import type {
  BankStatementSummaryResponse,
  DebitDocumentView,
  DebitSuggestionsResponse,
} from "@/lib/bank-statement/types";

/**
 * Bank debit matching on the Bank statements page (finance layer 3-3b):
 * what a debit pays, its suggested match (Revolut's single card with
 * "Confirm match"), "Find other match" (QuickBooks: filters, a checkbox
 * list and the total selected) and the reconciliation summary (Square:
 * "All debits are matched").
 */

export type DebitAllocationRow = StatementAllocation & {
  reimbursement?: (Reimbursement & { user?: User | null }) | null;
  vendorPaymentTransaction?:
    | (VendorPaymentTransaction & {
        vendorPayment?: (VendorPayment & { vendor?: Vendor | null }) | null;
      })
    | null;
};

export type LineSuggestions = DebitSuggestionsResponse["lines"][string];

const KIND_LABELS: Record<StatementDocumentAllocationKind, string> = {
  reimbursement: "Reimbursement",
  vendor_payment_transaction: "Vendor payment",
};

/** Where a matched document opens. */
function documentLink(kind: string, requestId: string) {
  return kind === "reimbursement"
    ? `/reimbursements/${requestId}`
    : `/vendor-payments/${requestId}`;
}

/** One thing a debit pays, in a line: kind, title, payee, amount. */
function AllocationItem({ allocation }: { allocation: DebitAllocationRow }) {
  const claim = allocation.reimbursement;
  const payment = allocation.vendorPaymentTransaction;
  const request = payment?.vendorPayment;
  let body: React.ReactNode = ALLOCATION_KIND_LABELS[allocation.kind];
  if (claim) {
    body = (
      <Link
        className="underline-offset-4 hover:underline"
        to={documentLink("reimbursement", claim.id) as never}
      >
        {claim.title}
        {claim.user?.name ? ` · ${claim.user.name}` : ""}
      </Link>
    );
  } else if (request) {
    body = (
      <Link
        className="underline-offset-4 hover:underline"
        to={documentLink("vendor_payment_transaction", request.id) as never}
      >
        {request.title}
        {request.vendor?.name ? ` · ${request.vendor.name}` : ""}
      </Link>
    );
  }
  return (
    <li
      className="flex min-w-0 items-baseline gap-2"
      data-testid="debit-allocation"
    >
      <Tag className="shrink-0">{ALLOCATION_KIND_LABELS[allocation.kind]}</Tag>
      {claim || request ? (
        <span className="min-w-0 truncate">{body}</span>
      ) : null}
      <span className="ml-auto shrink-0 font-mono tabular-nums">
        {formatPaise(allocation.amountPaise)}
      </span>
    </li>
  );
}

export function AllocationList({
  allocations,
}: {
  allocations: readonly DebitAllocationRow[];
}) {
  return (
    <ul className="mt-1 grid gap-1 text-sm">
      {allocations.map((a) => (
        <AllocationItem allocation={a} key={a.id} />
      ))}
    </ul>
  );
}

export interface DebitLineView {
  allocations?: readonly DebitAllocationRow[];
  amountPaise: number;
  id: string;
  matchKind: string | null;
  matchStatus: string | null;
  needsClaimAt?: number | null;
  valueOn: number;
}

/** What is left of a debit for documents: its amount less live allocations. */
export const debitOpenPaise = (line: DebitLineView) =>
  line.amountPaise -
  (line.allocations ?? []).reduce((sum, a) => sum + a.amountPaise, 0);

export const isBeforeCutover = (line: Pick<DebitLineView, "valueOn">) =>
  epochDayToIso(line.valueOn) < LEDGER_CUTOVER_ON;

export interface DebitActions {
  onConfirm: (
    line: DebitLineView,
    suggestion: LineSuggestions["suggestions"][number]
  ) => void;
  onDismissSuggestion: (line: DebitLineView, documentId: string) => void;
  onFind: (line: DebitLineView) => void;
}

function SuggestedMatch({
  actions,
  canManage,
  line,
  suggestions,
}: {
  actions: DebitActions;
  canManage: boolean;
  line: DebitLineView;
  suggestions: LineSuggestions["suggestions"];
}) {
  const [first] = suggestions;
  if (!first) {
    return null;
  }
  const others = suggestions.length - 1;
  return (
    <div
      className="bg-info/5 ring-info/25 grid gap-2 rounded-lg p-3 text-sm ring-1 ring-inset"
      data-testid="debit-suggestion"
    >
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">Suggested match</div>
        <div className="truncate font-medium">
          {first.title} · {first.payee || "—"}
        </div>
        <div className="text-muted-foreground text-xs">
          {KIND_LABELS[first.kind]} ·{" "}
          {first.kind === "reimbursement" ? "approved" : "paid"}{" "}
          {formatIsoDate(first.on)} · {formatPaise(remainingOf(first))} ·{" "}
          {DEBIT_REASON_LABELS[first.reason]}
        </div>
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => actions.onConfirm(line, first)}
            size="sm"
            type="button"
          >
            Confirm match
          </Button>
          <Button
            onClick={() => actions.onDismissSuggestion(line, first.id)}
            size="sm"
            type="button"
            variant="outline"
          >
            Not this
          </Button>
          <Button
            onClick={() => actions.onFind(line)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {others > 0
              ? `Find other match (${others} more)`
              : "Find other match"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The right-hand side of a debit line: what it pays, or how to explain it. */
export function DebitOutcome({
  actions,
  canManage,
  line,
  suggestions,
}: {
  actions: DebitActions;
  canManage: boolean;
  line: DebitLineView;
  suggestions: LineSuggestions | undefined;
}) {
  const allocations = line.allocations ?? [];
  const open = debitOpenPaise(line);
  const evidence = isBeforeCutover(line) ? (
    <div className="text-muted-foreground text-xs">
      Before 1 Apr 2026: matching is evidence only, nothing is posted
    </div>
  ) : null;
  if (line.matchStatus === "matched" && line.matchKind === "expense") {
    return (
      <div className="min-w-0 text-sm">
        <StatusBadge tone="success">Matched</StatusBadge>
        <AllocationList allocations={allocations} />
        {evidence}
      </div>
    );
  }
  return (
    <div className="grid min-w-0 gap-2 text-sm">
      {allocations.length > 0 ? (
        <div data-testid="debit-part-matched">
          <StatusBadge tone="warning">Part matched</StatusBadge>
          <AllocationList allocations={allocations} />
          <div className="text-muted-foreground text-xs">
            {formatPaise(open)} left to explain
          </div>
        </div>
      ) : null}
      {line.needsClaimAt ? (
        <div>
          <StatusBadge tone="warning">Needs a claim</StatusBadge>
        </div>
      ) : null}
      {suggestions && suggestions.suggestions.length > 0 ? (
        <SuggestedMatch
          actions={actions}
          canManage={canManage}
          line={line}
          suggestions={suggestions.suggestions}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {allocations.length > 0 ? "" : "No match found yet."}
          </span>
          {canManage ? (
            <Button
              onClick={() => actions.onFind(line)}
              size="sm"
              type="button"
              variant="outline"
            >
              Find match
            </Button>
          ) : null}
        </div>
      )}
      {evidence}
    </div>
  );
}

// ── Find other match ────────────────────────────────────────────────────────

const ALL_KINDS = "all";

interface Filters {
  from: string;
  kind: StatementDocumentAllocationKind | typeof ALL_KINDS;
  max: string;
  min: string;
  query: string;
  to: string;
}

const shiftDay = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Thirty days either side of the debit, QuickBooks-style; any of it can be cleared. */
const defaultFilters = (valueOn: string): Filters => ({
  from: shiftDay(valueOn, -30),
  kind: ALL_KINDS,
  max: "",
  min: "",
  query: "",
  to: shiftDay(valueOn, 30),
});

const DIFFERENCE_LABELS: Record<DebitDifference, string> = {
  bank_charges: "Record it as bank charges",
  leave: "Leave it to match later",
  none: "",
  part_pay: "",
};

function useDebitSearch(open: boolean, filters: Filters) {
  const search = useServerFn(searchDebitMatches);
  const [state, setState] = useState<{
    documents: DebitDocumentView[];
    error: string | null;
    loading: boolean;
  }>({ documents: [], error: null, loading: false });
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, error: null, loading: true }));
    const timer = setTimeout(() => {
      search({
        data: {
          from: filters.from || null,
          kind: filters.kind === ALL_KINDS ? null : filters.kind,
          maxPaise: filters.max ? tryRupeesToPaise(filters.max) : null,
          minPaise: filters.min ? tryRupeesToPaise(filters.min) : null,
          query: filters.query.trim() || null,
          to: filters.to || null,
        },
      })
        .then((documents) => {
          if (!cancelled) {
            setState({ documents, error: null, loading: false });
          }
        })
        .catch((error: unknown) => {
          log.error({
            action: "income.searchDebitMatches",
            caughtError: error instanceof Error ? error.message : String(error),
            component: "FindDebitMatchDialog",
          });
          if (!cancelled) {
            setState({
              documents: [],
              error: "Records couldn't be loaded. Try again.",
              loading: false,
            });
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, filters, search]);
  return state;
}

function CandidateRow({
  doc,
  onToggle,
  selected,
}: {
  doc: DebitDocumentView;
  onToggle: (doc: DebitDocumentView) => void;
  selected: boolean;
}) {
  const handleToggle = useEventCallback(() => onToggle(doc));
  const remaining = remainingOf(doc);
  return (
    <button
      className={cn(
        "hover:bg-accent flex w-full cursor-pointer items-start gap-3 rounded-md p-2 text-left",
        selected && "bg-accent"
      )}
      data-testid="debit-candidate"
      onClick={handleToggle}
      type="button"
    >
      <Checkbox
        checked={selected}
        className="mt-0.5"
        onCheckedChange={handleToggle}
        tabIndex={-1}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{doc.title}</span>
        <span className="text-muted-foreground truncate text-xs max-md:break-words max-md:whitespace-normal">
          {KIND_LABELS[doc.kind]} · {doc.payee || "—"} · {formatIsoDate(doc.on)}
          {doc.reference ? ` · ${doc.reference}` : ""}
        </span>
      </div>
      <span className="shrink-0 text-right font-mono text-sm tabular-nums">
        {formatPaise(remaining)}
        {remaining === doc.amountPaise ? null : (
          <span className="text-muted-foreground block text-xs">
            of {formatPaise(doc.amountPaise)}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * "Find other match": pick one or more approved claims and vendor payments
 * this debit paid. Matching is confirmed only when the total selected
 * equals what is left of the debit, or the difference is recorded: left to
 * match later or as bank charges when less, the last record paid in part
 * when more.
 */
export function FindDebitMatchDialog({
  line,
  onOpenChange,
  onSubmit,
}: {
  line: DebitLineView | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    items: { id: string; kind: StatementDocumentAllocationKind }[],
    difference: DebitDifference
  ) => Promise<boolean>;
}) {
  const open = line !== null;
  const valueOn = line ? epochDayToIso(line.valueOn) : "";
  const [filters, setFilters] = useState<Filters>(() =>
    defaultFilters(valueOn || LEDGER_CUTOVER_ON)
  );
  const [selected, setSelected] = useState<DebitDocumentView[]>([]);
  const [difference, setDifference] = useState<DebitDifference>("leave");
  const [submitting, setSubmitting] = useState(false);
  const lineId = line?.id ?? null;
  useEffect(() => {
    if (lineId) {
      setFilters(defaultFilters(valueOn));
      setSelected([]);
      setDifference("leave");
    }
  }, [lineId, valueOn]);
  const { documents, error, loading } = useDebitSearch(open, filters);

  const openPaise = line ? debitOpenPaise(line) : 0;
  let plan: ReturnType<typeof planDebitAllocation> | null = null;
  let planError: string | null = null;
  try {
    plan = planDebitAllocation(
      openPaise,
      selected.map((d) => ({
        id: d.id,
        kind: d.kind,
        remainingPaise: remainingOf(d),
      }))
    );
  } catch (caught) {
    planError = caught instanceof Error ? caught.message : "Pick again";
  }
  const chosenDifference: DebitDifference | null = plan
    ? plan.differences.length === 1
      ? (plan.differences[0] as DebitDifference)
      : plan.differences.includes(difference)
        ? difference
        : null
    : null;
  const partialDoc = plan?.partial
    ? selected.find((d) => d.id === plan?.partial?.id)
    : undefined;

  const toggle = useEventCallback((doc: DebitDocumentView) => {
    setSelected((current) =>
      current.some((d) => d.id === doc.id)
        ? current.filter((d) => d.id !== doc.id)
        : [...current, doc]
    );
  });
  const set = (key: keyof Filters) => (event: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [key]: event.target.value }));
  const submit = useEventCallback(async () => {
    if (!(plan && chosenDifference) || selected.length === 0) {
      return;
    }
    setSubmitting(true);
    await onSubmit(
      selected.map((d) => ({ id: d.id, kind: d.kind })),
      chosenDifference
    )
      .then((done) => {
        if (done) {
          onOpenChange(false);
        }
      })
      .finally(() => setSubmitting(false));
  });

  // Selected records stay listed, even when a filter hides them.
  const listed = [
    ...selected.filter((s) => !documents.some((d) => d.id === s.id)),
    ...documents,
  ];
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Find match</DialogTitle>
          <DialogDescription>
            {line
              ? `${formatPaise(openPaise)} left the bank on ${formatIsoDate(valueOn)}. Pick the approved claims and vendor payments it paid.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            <div className="relative sm:col-span-2">
              <HugeiconsIcon
                className="text-muted-foreground absolute top-2.5 left-2.5 size-4"
                icon={Search01Icon}
                strokeWidth={2}
              />
              <Input
                aria-label="Payee or title"
                className="pl-8"
                onChange={set("query")}
                placeholder="Search payee or title…"
                value={filters.query}
              />
            </div>
            <Select
              onValueChange={(value) =>
                setFilters((f) => ({ ...f, kind: value as Filters["kind"] }))
              }
              value={filters.kind}
            >
              <SelectTrigger aria-label="Type">
                <SelectValue>
                  {filters.kind === ALL_KINDS
                    ? "All types"
                    : KIND_LABELS[filters.kind]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_KINDS}>All types</SelectItem>
                <SelectItem value="reimbursement">Reimbursements</SelectItem>
                <SelectItem value="vendor_payment_transaction">
                  Vendor payments
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Amount from"
                inputMode="decimal"
                onChange={set("min")}
                placeholder="Min ₹"
                value={filters.min}
              />
              <Input
                aria-label="Amount to"
                inputMode="decimal"
                onChange={set("max")}
                placeholder="Max ₹"
                value={filters.max}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <Input
                aria-label="Dated from"
                onChange={set("from")}
                type="date"
                value={filters.from}
              />
              <Input
                aria-label="Dated to"
                onChange={set("to")}
                type="date"
                value={filters.to}
              />
            </div>
          </div>
          <ScrollArea className="max-h-72 min-w-0">
            {loading && documents.length === 0 ? (
              <div className="grid gap-2">
                {["a", "b", "c"].map((k) => (
                  <Skeleton className="h-10 w-full" key={k} />
                ))}
              </div>
            ) : null}
            {error ? (
              <p className="text-destructive py-4 text-center text-sm">
                {error}
              </p>
            ) : null}
            {!(loading || error) && listed.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No approved claims or vendor payments match these filters.
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              {listed.map((doc) => (
                <CandidateRow
                  doc={doc}
                  key={doc.id}
                  onToggle={toggle}
                  selected={selected.some((s) => s.id === doc.id)}
                />
              ))}
            </div>
          </ScrollArea>
          <div
            className="grid gap-2 rounded-lg border p-3 text-sm"
            data-testid="debit-selection-total"
          >
            <div className="flex justify-between gap-2">
              <span>Total selected</span>
              <span className="font-mono tabular-nums">
                {formatPaise(plan?.selectedPaise ?? 0)}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-between gap-2">
              <span>Bank debit</span>
              <span className="font-mono tabular-nums">
                {formatPaise(openPaise)}
              </span>
            </div>
            {planError ? <p className="text-destructive">{planError}</p> : null}
            {plan &&
            selected.length > 0 &&
            plan.differences.includes("leave") ? (
              <fieldset className="grid gap-1">
                <legend className="mb-1">
                  {formatPaise(plan.debitLeftPaise)} of the debit is not
                  explained by the selection:
                </legend>
                {(["leave", "bank_charges"] as const).map((value) => (
                  <Label
                    className="flex items-center gap-2 font-normal"
                    key={value}
                  >
                    <input
                      checked={difference === value}
                      name="debit-difference"
                      onChange={() => setDifference(value)}
                      type="radio"
                    />
                    {DIFFERENCE_LABELS[value]}
                  </Label>
                ))}
              </fieldset>
            ) : null}
            {plan?.partial && partialDoc ? (
              <p className="text-warning-foreground flex items-start gap-2">
                <HugeiconsIcon
                  className="mt-0.5 size-4 shrink-0"
                  icon={Alert02Icon}
                  strokeWidth={2}
                />
                {formatPaise(plan.partial.unpaidPaise)} of “{partialDoc.title}”
                stays unpaid by this debit; match the rest to another debit.
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={
              submitting ||
              selected.length === 0 ||
              plan === null ||
              chosenDifference === null
            }
            onClick={submit}
            type="button"
          >
            {submitting ? "Matching..." : "Match debit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reconciliation summary ──────────────────────────────────────────────────

/**
 * "N debits matched · M need attention · ₹X unexplained", or "All debits
 * are matched" with a check, Square-style.
 */
export function DebitReconciliation({
  summary,
}: {
  summary: BankStatementSummaryResponse["debits"] | null;
}) {
  if (!summary || summary.debitCount === 0) {
    return null;
  }
  const done = summary.attentionCount === 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm",
        done
          ? ""
          : "border-warning/30 bg-warning/10 dark:bg-warning-foreground/10"
      )}
      data-testid="debit-reconciliation"
      role="status"
    >
      <HugeiconsIcon
        className={cn(
          "size-4",
          done ? "text-success-foreground" : "text-warning-foreground"
        )}
        icon={done ? CheckmarkCircle02Icon : Alert02Icon}
        strokeWidth={2}
      />
      {done ? (
        <span>All debits are matched</span>
      ) : (
        <span>
          {summary.debitsMatchedCount.toLocaleString("en-IN")}{" "}
          {summary.debitsMatchedCount === 1 ? "debit" : "debits"} matched ·{" "}
          {summary.attentionCount.toLocaleString("en-IN")} need attention ·{" "}
          {formatPaise(summary.unexplainedPaise)} unexplained
          {summary.needsClaimCount > 0
            ? ` · ${summary.needsClaimCount.toLocaleString("en-IN")} waiting for a claim`
            : ""}
        </span>
      )}
    </div>
  );
}

// ── Paid per approval, not seen in the bank ─────────────────────────────────

export function UnseenPaymentsList({
  documents,
}: {
  documents: readonly DebitDocumentView[];
}) {
  return (
    <ul className="divide-y rounded-lg border" data-testid="unseen-payments">
      {documents.map((doc) => (
        <li
          className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-4"
          data-testid="unseen-payment"
          key={doc.id}
        >
          <span className="text-muted-foreground font-mono whitespace-nowrap">
            {formatIsoDate(doc.on)}
          </span>
          <div className="min-w-0">
            <Link
              className="truncate font-medium underline-offset-4 hover:underline"
              to={documentLink(doc.kind, doc.requestId) as never}
            >
              {doc.title}
            </Link>
            <div className="text-muted-foreground truncate text-xs">
              {KIND_LABELS[doc.kind]} · {doc.payee || "—"}
              {doc.allocatedPaise > 0
                ? ` · ${formatPaise(doc.allocatedPaise)} matched so far`
                : ""}
            </div>
          </div>
          <span className="font-mono tabular-nums md:text-right">
            {formatPaise(remainingOf(doc))}
          </span>
        </li>
      ))}
    </ul>
  );
}
