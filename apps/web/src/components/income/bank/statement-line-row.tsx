import {
  ArrowDataTransferHorizontalIcon,
  BankIcon,
  Flag01Icon,
  Invoice03Icon,
  Link01Icon,
  Search01Icon,
  MoneyReceive01Icon,
  MoreHorizontalIcon,
  NoteEditIcon,
  Undo02Icon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { StatementLineIgnoreReason } from "@pi-dash/shared/constants";
import { formatPaise } from "@pi-dash/shared/money";
import type {
  Contribution,
  GatewaySettlement,
  Party,
  StatementLine,
} from "@pi-dash/zero/schema";

import {
  type DebitActions,
  type DebitAllocationRow,
  DebitOutcome,
  isBeforeCutover,
  type LineSuggestions,
} from "@/components/income/bank/debit-match";
import { formatReceivedOn } from "@/components/income/contribution-detail-sheet";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  IGNORE_REASON_LABELS,
  matchKindLabel,
  matchReasonLabel,
  settlementProviderLabel,
} from "@/lib/bank-statement/labels";

export type StatementLineRow = StatementLine & {
  allocations?: readonly DebitAllocationRow[];
  matchedContribution?: (Contribution & { party?: Party | null }) | null;
  matchedSettlement?: GatewaySettlement | null;
  suggestedContribution?: (Contribution & { party?: Party | null }) | null;
  suggestedSettlement?: GatewaySettlement | null;
};

export interface LineActions extends DebitActions {
  onAccept: (line: StatementLineRow) => void;
  onBankCharges: (line: StatementLineRow) => void;
  onClearNeedsClaim: (line: StatementLineRow) => void;
  onNeedsClaim: (line: StatementLineRow) => void;
  onTaxPayment: (line: StatementLineRow) => void;
  onDismiss: (line: StatementLineRow) => void;
  onGiveIndia: (line: StatementLineRow) => void;
  onIgnore: (line: StatementLineRow) => void;
  onLink: (line: StatementLineRow) => void;
  onNote: (line: StatementLineRow) => void;
  onRecord: (line: StatementLineRow) => void;
  onTransfer: (line: StatementLineRow) => void;
  onUnmatch: (line: StatementLineRow) => void;
}

function settlementLabel(settlement: GatewaySettlement): string {
  return `${settlementProviderLabel(settlement.provider)} settlement ${formatReceivedOn(settlement.settledOn)} · ${formatPaise(settlement.amountPaise)}`;
}

function contributionLabel(
  contribution: Contribution & { party?: Party | null }
): string {
  return `Donation from ${contribution.party?.displayName ?? "a donor"} · ${formatReceivedOn(contribution.receivedOn)} · ${formatPaise(contribution.amountPaise)}`;
}

/** What a line is matched to or suggested for, in one line. */
function targetLabel(
  kind: string | null | undefined,
  settlement: GatewaySettlement | null | undefined,
  contribution: (Contribution & { party?: Party | null }) | null | undefined
): string {
  if (kind === "settlement" && settlement) {
    return settlementLabel(settlement);
  }
  if (kind === "contribution" && contribution) {
    return contributionLabel(contribution);
  }
  return matchKindLabel(kind);
}

function SuggestionCard({
  actions,
  canManage,
  line,
}: {
  actions: LineActions;
  canManage: boolean;
  line: StatementLineRow;
}) {
  // A settlement whose UTR the line carries but whose amount differs can't
  // be matched whole: the card says so and offers no Match.
  const amountDiffers =
    line.suggestedKind === "settlement" &&
    line.suggestedSettlement !== null &&
    line.suggestedSettlement !== undefined &&
    line.suggestedSettlement.amountPaise !== line.amountPaise;
  const reason = amountDiffers
    ? `UTR matches, amount differs: ${formatPaise(line.suggestedSettlement?.amountPaise ?? 0)} vs ${formatPaise(line.amountPaise)} in the bank`
    : matchReasonLabel(line.suggestionReason);
  return (
    <div
      className="bg-info/5 ring-info/25 grid gap-2 rounded-lg p-3 text-sm ring-1 ring-inset"
      data-testid="statement-suggestion"
    >
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">
          {amountDiffers ? "Possibly related" : "Suggested match"}
        </div>
        <div className="truncate font-medium">
          {targetLabel(
            line.suggestedKind,
            line.suggestedSettlement,
            line.suggestedContribution
          )}
        </div>
        {reason ? (
          <div className="text-muted-foreground text-xs">{reason}</div>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {amountDiffers ? null : (
            <Button
              onClick={() => actions.onAccept(line)}
              size="sm"
              type="button"
            >
              Match
            </Button>
          )}
          <Button
            onClick={() => actions.onDismiss(line)}
            size="sm"
            type="button"
            variant="outline"
          >
            Not this
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LineMenu({
  actions,
  canRecord,
  line,
}: {
  actions: LineActions;
  canRecord: boolean;
  line: StatementLineRow;
}) {
  const open = line.matchStatus === "unmatched";
  const credit = line.direction === "credit";
  const debit = !credit;
  const partMatched = (line.allocations ?? []).length > 0;
  // Money out from the cutover is in the books: never set aside.
  const mayIgnore = credit || isBeforeCutover(line);
  return (
    <ResponsiveActionMenu
      actions={[
        open &&
          debit && {
            icon: Search01Icon,
            id: "find-match",
            label: "Find match…",
            onSelect: () => actions.onFind(line),
          },
        open &&
          debit && {
            icon: BankIcon,
            id: "bank-charges",
            label: "Bank charges",
            onSelect: () => actions.onBankCharges(line),
          },
        open &&
          debit && {
            icon: Invoice03Icon,
            id: "tax-payment",
            label: "Tax payment",
            onSelect: () => actions.onTaxPayment(line),
          },
        open &&
          debit &&
          !line.needsClaimAt && {
            icon: Flag01Icon,
            id: "needs-claim",
            label: "Needs a claim",
            onSelect: () => actions.onNeedsClaim(line),
          },
        open &&
          debit &&
          Boolean(line.needsClaimAt) && {
            icon: Flag01Icon,
            id: "clear-needs-claim",
            label: "Claim no longer needed",
            onSelect: () => actions.onClearNeedsClaim(line),
          },
        open &&
          credit &&
          canRecord && {
            icon: MoneyReceive01Icon,
            id: "record",
            label: "Record as donation",
            onSelect: () => actions.onRecord(line),
          },
        open &&
          credit && {
            icon: Link01Icon,
            id: "link",
            label: "Link to…",
            onSelect: () => actions.onLink(line),
          },
        open &&
          credit && {
            icon: MoneyReceive01Icon,
            id: "giveindia",
            label: "Mark as give.do payout",
            onSelect: () => actions.onGiveIndia(line),
          },
        open &&
          !partMatched && {
            icon: ArrowDataTransferHorizontalIcon,
            id: "transfer",
            label: "Mark as transfer",
            onSelect: () => actions.onTransfer(line),
          },
        {
          icon: NoteEditIcon,
          id: "note",
          label: line.note ? "Edit note" : "Add note",
          onSelect: () => actions.onNote(line),
        },
        open &&
          mayIgnore &&
          !partMatched && {
            icon: ViewOffSlashIcon,
            id: "ignore",
            label: "Ignore",
            onSelect: () => actions.onIgnore(line),
          },
        (!open || partMatched) && {
          destructive: true,
          icon: Undo02Icon,
          id: "unmatch",
          label: line.matchStatus === "ignored" ? "Stop ignoring" : "Unmatch",
          onSelect: () => actions.onUnmatch(line),
        },
      ]}
      title="Line actions"
      trigger={
        <Button
          aria-label="Line actions"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={MoreHorizontalIcon}
            strokeWidth={2}
          />
        </Button>
      }
    />
  );
}

function Outcome({
  actions,
  canManage,
  canRecord,
  line,
  suggestions,
}: {
  actions: LineActions;
  canManage: boolean;
  canRecord: boolean;
  line: StatementLineRow;
  suggestions: LineSuggestions | undefined;
}) {
  // Money out (layer 3-3b): what it pays, or how to explain it.
  if (
    line.direction === "debit" &&
    (line.matchStatus === "unmatched" || line.matchKind === "expense")
  ) {
    return (
      <DebitOutcome
        actions={actions}
        canManage={canManage}
        line={line}
        suggestions={suggestions}
      />
    );
  }
  if (line.matchStatus === "matched") {
    return (
      <div className="min-w-0 text-sm">
        <StatusBadge tone="success">Matched</StatusBadge>
        <div className="mt-1 truncate" data-testid="statement-match">
          {targetLabel(
            line.matchKind,
            line.matchedSettlement,
            line.matchedContribution
          )}
        </div>
        {line.matchReason ? (
          <div className="text-muted-foreground text-xs">
            {matchReasonLabel(line.matchReason)}
          </div>
        ) : null}
      </div>
    );
  }
  if (line.matchStatus === "ignored") {
    return (
      <div className="min-w-0 text-sm">
        <StatusBadge tone="neutral">Ignored</StatusBadge>
        <div className="text-muted-foreground mt-1 text-xs">
          {IGNORE_REASON_LABELS[
            line.ignoredReason as StatementLineIgnoreReason
          ] ?? ""}
        </div>
      </div>
    );
  }
  if (line.suggestedKind) {
    return (
      <SuggestionCard actions={actions} canManage={canManage} line={line} />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">We didn't find a match yet.</span>
      {canManage && canRecord ? (
        <Button
          onClick={() => actions.onRecord(line)}
          size="sm"
          type="button"
          variant="outline"
        >
          Record as donation
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One statement line, Xero-style: the bank's line on the left, what explains
 * it (or the suggestion, or the actions) on the right; stacked on phones.
 */
export function StatementLineItem({
  actions,
  canManage,
  canRecord,
  line,
  suggestions,
}: {
  actions: LineActions;
  canManage: boolean;
  /** donors.manage as well: recording a donation creates a contribution. */
  canRecord: boolean;
  line: StatementLineRow;
  /** A debit's suggested claims and payments, for finance.manage. */
  suggestions?: LineSuggestions;
}) {
  const credit = line.direction === "credit";
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start md:gap-6"
      data-line-id={line.id}
      data-testid="statement-line"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-3">
        {/* Phones put the date on its own small line so the narration, the
            main matching clue, gets the width. */}
        <span className="text-muted-foreground font-mono text-sm whitespace-nowrap max-md:col-span-full max-md:text-xs">
          {formatReceivedOn(line.valueOn)}
        </span>
        <div className="min-w-0">
          <div
            className="truncate text-sm max-md:line-clamp-2 max-md:break-words max-md:whitespace-normal"
            title={line.narration ?? undefined}
          >
            {line.narration || "—"}
          </div>
          {line.reference ? (
            <div className="text-muted-foreground truncate font-mono text-xs">
              {line.reference}
            </div>
          ) : null}
          {line.note ? (
            <div className="text-muted-foreground truncate text-xs">
              Note: {line.note}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "font-mono text-sm whitespace-nowrap tabular-nums",
            credit && "text-success-foreground"
          )}
        >
          {credit ? "+" : "−"}
          {formatPaise(line.amountPaise)}
        </span>
      </div>
      <div className="min-w-0 max-md:col-span-full max-md:row-start-2">
        <Outcome
          actions={actions}
          canManage={canManage}
          canRecord={canRecord}
          line={line}
          suggestions={suggestions}
        />
      </div>
      {/* Phones keep the menu beside the line, not on a row of its own. */}
      <div className="flex justify-end max-md:-mt-1 max-md:-mr-2">
        {canManage ? (
          <LineMenu actions={actions} canRecord={canRecord} line={line} />
        ) : null}
      </div>
    </li>
  );
}
