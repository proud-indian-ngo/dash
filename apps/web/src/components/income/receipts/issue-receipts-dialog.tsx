import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReceiptCandidate } from "@pi-dash/db/queries/contribution-receipts";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { todayInKolkata } from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import {
  MAX_RECEIPTS_PER_ISSUE,
  RECEIPT_BLOCK_LABELS,
  RECEIPT_SKIP_LABELS,
  receiptAssessmentLabel,
} from "@pi-dash/shared/receipts";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { Tag } from "@/components/shared/status-badge";
import { issueContributionReceipts } from "@/functions/contribution-receipts";

import { formatReceivedOn } from "../income-date";

const ISSUE_SKIP_LABELS: Record<string, string> = {
  ...RECEIPT_SKIP_LABELS,
  ...RECEIPT_BLOCK_LABELS,
  external: "Receipted by the gateway",
  not_found: "Gift not found",
  receipted: "Already receipted",
};

/** Why the server skipped gifts: its reason codes, in words, once each. */
function issueSkipReasons(skipped: readonly { reason: string }[]): string {
  const reasons = skipped.flatMap(({ reason }) =>
    reason.split(",").map((code) => ISSUE_SKIP_LABELS[code] ?? code)
  );
  return [...new Set(reasons)].join("; ");
}
import { useReceiptCandidates } from "./use-receipt-candidates";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/** yyyy-MM-dd to the epoch the table formatter takes. */
const dayEpoch = (isoDay: string) => Date.parse(`${isoDay}T00:00:00Z`);

function CandidateRow({
  candidate,
  reasons,
}: {
  candidate: ReceiptCandidate;
  reasons?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="truncate">
          {candidate.donorName || "Unnamed donor"}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatReceivedOn(dayEpoch(candidate.receivedOn))}
          {reasons ? ` · ${reasons}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {!(reasons || candidate.with80G) ? <Tag>No 80G line</Tag> : null}
        <span className="font-mono tabular-nums">
          {formatPaise(candidate.amountPaise)}
        </span>
      </span>
    </li>
  );
}

/**
 * Review before issuing: what will be receipted and what is blocked and
 * why. Issuing numbers the receipts in date order and marks the gifts
 * Receipted; nothing is emailed.
 */
export function IssueReceiptsDialog({
  contributionIds,
  onIssued,
  onOpenChange,
  open,
}: {
  /** Null for every eligible gift. */
  contributionIds: string[] | null;
  onIssued?: (receiptIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const candidates = useReceiptCandidates(open, contributionIds, "");
  const issue = useServerFn(issueContributionReceipts);
  const [issuing, setIssuing] = useState(false);
  // "Received up to": issue in tranches, such as one month at a time.
  const [upTo, setUpTo] = useState("");
  const inRange = (gift: ReceiptCandidate) => !upTo || gift.receivedOn <= upTo;
  const eligible = (candidates?.eligible ?? []).filter(inRange);
  const blocked = (candidates?.blocked ?? []).filter(inRange);
  const other = candidates?.other ?? [];
  const gaps = candidates?.configGaps ?? [];
  // One issue covers at most MAX_RECEIPTS_PER_ISSUE gifts, oldest first;
  // the rest stay ready for the next run.
  const batch = eligible.slice(0, MAX_RECEIPTS_PER_ISSUE);
  const canIssue = batch.length > 0 && gaps.length === 0 && !issuing;

  const confirm = async () => {
    setIssuing(true);
    await issue({
      data: {
        giftIds: batch.map((gift) => gift.contributionId),
      },
    })
      .then((result) => {
        const [first] = result.issued;
        if (result.issued.length === 1 && first) {
          toast.success(`Receipt ${first.number} issued`);
        } else if (result.issued.length > 0) {
          toast.success(`${result.issued.length} receipts issued`);
        }
        if (result.skipped.length > 0) {
          toast.warning(
            `${result.skipped.length} ${result.skipped.length === 1 ? "gift was" : "gifts were"} skipped because they changed since the review`,
            { description: issueSkipReasons(result.skipped) }
          );
        }
        onOpenChange(false);
        onIssued?.(result.issued.map((receipt) => receipt.id));
      })
      .catch((error: unknown) => {
        toast.error("Couldn't issue the receipts", {
          description: errorMessage(error),
        });
      })
      .finally(() => setIssuing(false));
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setUpTo("");
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Issue receipts</DialogTitle>
          <DialogDescription>
            Direct gifts (UPI, NEFT/IMPS, cheque) are receipted here. Razorpay
            and give.do send their own receipts. Numbers follow the date the
            gifts were received; nothing is emailed until you choose to.
          </DialogDescription>
        </DialogHeader>
        {contributionIds === null ? (
          <div className="flex items-center gap-3">
            <Label className="shrink-0" htmlFor="receipts-received-up-to">
              Received up to
            </Label>
            <Input
              className="w-44"
              id="receipts-received-up-to"
              max={todayInKolkata()}
              onChange={(event) => setUpTo(event.target.value)}
              type="date"
              value={upTo}
            />
            {upTo ? (
              <Button
                onClick={() => setUpTo("")}
                size="sm"
                type="button"
                variant="ghost"
              >
                All dates
              </Button>
            ) : null}
          </div>
        ) : null}
        {candidates ? (
          <div
            className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto"
            data-testid="issue-receipts-review"
          >
            {gaps.length > 0 ? (
              <div
                className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 flex gap-2 rounded-md border p-3 text-sm"
                role="status"
              >
                <HugeiconsIcon
                  className="mt-0.5 size-4 shrink-0"
                  icon={Alert02Icon}
                  strokeWidth={2}
                />
                <span className="flex flex-col gap-1">
                  {gaps.map((gap) => (
                    <span key={gap}>{gap}</span>
                  ))}
                </span>
              </div>
            ) : null}
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                Will be issued ({eligible.length})
              </h3>
              {eligible.length > 0 ? (
                <ul
                  className="divide-y rounded-lg border"
                  data-testid="receipts-to-issue"
                >
                  {eligible.map((gift) => (
                    <CandidateRow candidate={gift} key={gift.contributionId} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No gift is ready for a receipt.
                </p>
              )}
            </section>
            {blocked.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  Blocked ({blocked.length})
                </h3>
                <ul
                  className="divide-y rounded-lg border"
                  data-testid="receipts-blocked"
                >
                  {blocked.map((gift) => (
                    <CandidateRow
                      candidate={gift}
                      key={gift.contributionId}
                      reasons={gift.blocks
                        .map((block) => RECEIPT_BLOCK_LABELS[block])
                        .join("; ")}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {other.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Not receipted here</h3>
                <ul className="divide-y rounded-lg border">
                  {other.map((gift) => (
                    <CandidateRow
                      candidate={gift}
                      key={gift.contributionId}
                      reasons={receiptAssessmentLabel(gift.assessment)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="flex justify-center py-6">
            <Loader />
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={!canIssue} onClick={confirm} type="button">
            {batch.length === 1
              ? "Issue 1 receipt"
              : `Issue ${batch.length} receipts`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
