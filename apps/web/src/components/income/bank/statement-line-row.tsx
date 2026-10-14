import {
  ArrowDataTransferHorizontalIcon,
  Link01Icon,
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

import { formatReceivedOn } from "@/components/income/contribution-detail-sheet";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DEBIT_MATCHING_NOTE,
  IGNORE_REASON_LABELS,
  matchKindLabel,
  matchReasonLabel,
} from "@/lib/bank-statement/labels";

export type StatementLineRow = StatementLine & {
  matchedContribution?: (Contribution & { party?: Party | null }) | null;
  matchedSettlement?: GatewaySettlement | null;
  suggestedContribution?: (Contribution & { party?: Party | null }) | null;
  suggestedSettlement?: GatewaySettlement | null;
};

export interface LineActions {
  onAccept: (line: StatementLineRow) => void;
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
  return `Razorpay settlement ${formatReceivedOn(settlement.settledOn)} · ${formatPaise(settlement.amountPaise)}`;
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
  return (
    <ResponsiveActionMenu
      actions={[
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
        open && {
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
        open && {
          icon: ViewOffSlashIcon,
          id: "ignore",
          label: "Ignore",
          onSelect: () => actions.onIgnore(line),
        },
        !open && {
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
}: {
  actions: LineActions;
  canManage: boolean;
  canRecord: boolean;
  line: StatementLineRow;
}) {
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
  if (line.direction === "debit") {
    return (
      <p className="text-muted-foreground text-sm">{DEBIT_MATCHING_NOTE}</p>
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
}: {
  actions: LineActions;
  canManage: boolean;
  /** donors.manage as well: recording a donation creates a contribution. */
  canRecord: boolean;
  line: StatementLineRow;
}) {
  const credit = line.direction === "credit";
  return (
    <li
      className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start md:gap-6"
      data-line-id={line.id}
      data-testid="statement-line"
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="text-muted-foreground font-mono text-sm whitespace-nowrap">
          {formatReceivedOn(line.valueOn)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm" title={line.narration ?? undefined}>
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
      <Outcome
        actions={actions}
        canManage={canManage}
        canRecord={canRecord}
        line={line}
      />
      <div className="flex justify-end">
        {canManage ? (
          <LineMenu actions={actions} canRecord={canRecord} line={line} />
        ) : null}
      </div>
    </li>
  );
}
