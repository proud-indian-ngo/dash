import { Button } from "@pi-dash/design-system/components/ui/button";
import type { ContributionChannel } from "@pi-dash/shared/constants";
import {
  RECEIPT_ISSUER_LABELS,
  RECEIPT_SKIP_LABELS,
  RECEIPTING_START_DAY,
  type ReceiptSkip,
  receiptAssessmentLabel,
  receiptIssuerFor,
} from "@pi-dash/shared/receipts";
import { lazy, Suspense, useState } from "react";

import { FilePreviewButton } from "@/components/shared/file-preview";
import { PendingDialog } from "@/components/shared/pending-dialog";

import type { ContributionRow } from "../income-types";
import { liveReceipt, receiptPdfUrl } from "./receipt-types";
import { useReceiptCandidates } from "./use-receipt-candidates";

const loadIssueReceiptsDialog = () => import("./issue-receipts-dialog");
const IssueReceiptsDialog = lazy(() =>
  loadIssueReceiptsDialog().then((module) => ({
    default: module.IssueReceiptsDialog,
  }))
);

/** yyyy-MM-dd of a date column's epoch. */
const isoDay = (epoch: number) => new Date(epoch).toISOString().slice(0, 10);

/** Why a direct gift isn't receiptable, from what the browser already knows. */
function localSkip(row: ContributionRow): ReceiptSkip | null {
  if (isoDay(row.receivedOn) < RECEIPTING_START_DAY) {
    return "before_start";
  }
  if (
    row.status === "pending" ||
    row.status === "refunded" ||
    row.status === "reversed"
  ) {
    return row.status;
  }
  return null;
}

/**
 * The contribution sheet's Receipt line: "PI/2026-27/0007 · Download",
 * "Receipted by Razorpay", or "Not receipted (reason)". Issuers can issue
 * from here; the reasons a gift is blocked come from the server, which
 * reads the donor's private details.
 */
export function ContributionReceiptFact({
  canIssue,
  row,
}: {
  canIssue: boolean;
  row: ContributionRow;
}) {
  const [issuing, setIssuing] = useState(false);
  const issuer = receiptIssuerFor(row.channel as ContributionChannel);
  const live = liveReceipt(row.receipts);
  const skip = issuer === "pi_dash" && !live ? localSkip(row) : null;
  const askServer = canIssue && issuer === "pi_dash" && !live && skip === null;
  const candidates = useReceiptCandidates(
    askServer,
    askServer ? [row.id] : null,
    `${row.status}:${row.updatedAt}`
  );

  if (issuer === "razorpay" || issuer === "give_do") {
    return (
      <span data-testid="contribution-receipt">
        Receipted by {RECEIPT_ISSUER_LABELS[issuer]}
      </span>
    );
  }
  if (issuer === null) {
    return (
      <span data-testid="contribution-receipt">
        Not receipted ({RECEIPT_SKIP_LABELS.in_kind})
      </span>
    );
  }
  if (live) {
    return (
      <span
        className="flex flex-wrap items-center gap-x-1"
        data-testid="contribution-receipt"
      >
        <span>Receipt</span>
        <span className="font-mono">{live.number}</span>
        {canIssue ? (
          <>
            <span aria-hidden>·</span>
            <FilePreviewButton
              className="underline underline-offset-2"
              src={receiptPdfUrl(live.id, "inline")}
              fileName={`Receipt ${live.number}`}
            >
              View
            </FilePreviewButton>
            <span aria-hidden>·</span>
            <a
              className="underline underline-offset-2"
              download
              href={receiptPdfUrl(live.id)}
            >
              Download
            </a>
          </>
        ) : null}
      </span>
    );
  }
  if (skip) {
    return (
      <span data-testid="contribution-receipt">
        Not receipted ({RECEIPT_SKIP_LABELS[skip]})
      </span>
    );
  }
  const assessment =
    candidates?.eligible[0]?.assessment ??
    candidates?.blocked[0]?.assessment ??
    candidates?.other[0]?.assessment;
  const label =
    assessment && assessment.kind !== "eligible"
      ? receiptAssessmentLabel(assessment)
      : "Not receipted";
  return (
    <span
      className="flex flex-wrap items-center gap-2"
      data-testid="contribution-receipt"
    >
      <span>{label}</span>
      {canIssue && assessment?.kind === "eligible" ? (
        <Button
          data-testid="contribution-issue-receipt"
          onClick={() => setIssuing(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Issue receipt
        </Button>
      ) : null}
      {canIssue && issuing ? (
        <Suspense
          fallback={
            <PendingDialog
              description="Loading receipt details"
              title="Issue receipt"
              onOpenChange={setIssuing}
            />
          }
        >
          <IssueReceiptsDialog
            contributionIds={[row.id]}
            onOpenChange={setIssuing}
            open
          />
        </Suspense>
      ) : null}
    </span>
  );
}
