import {
  Delete02Icon,
  Edit02Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PermissionId } from "@pi-dash/db/permissions";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type {
  ContributionChannel,
  ContributionReportingMode,
  ContributionSource,
  DeductionEligible,
  DonationType,
} from "@pi-dash/shared/constants";
import { donationTypeFundIssue } from "@pi-dash/shared/contribution-programme";
import { TAX_CERTIFICATE_LABELS } from "@pi-dash/shared/donations-return";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  CONTRIBUTION_SOURCE_LABELS,
  DONATION_TYPE_LABELS,
  razorpayPaymentUrl,
  REPORTING_MODE_LABELS,
  refundSummary,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { canReadReceipts } from "@pi-dash/shared/receipts";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { InTheBooks } from "@/components/books/in-the-books";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { DATE_TIME } from "@/lib/date-formats";

import { ContributionInBank } from "./bank/in-bank-fact";
import { ContributionGrantFact } from "./contribution-grant";
import {
  ContributionStatusBadge,
  refundedOfLabel,
} from "./contribution-status";
import { formatReceivedOn } from "./income-date";
import { type ContributionRow, donorName } from "./income-types";
import { ContributionReceiptFact } from "./receipts/contribution-receipt-fact";
import {
  type ContributionSettlement,
  isGatewayContribution,
  useContributionSettlement,
  useSettlementLock,
} from "./settlements/contribution-settlement";
import { shortId } from "./settlements/settlement-types";

function withDescription(label: string, description: string | null) {
  return description ? `${label}: ${description}` : label;
}

/**
 * The gift's fund, flagged when it was recorded before the corpus type
 * decided the fund: a corpus gift against another fund (the books credit
 * the Corpus Fund) or another type against the Corpus Fund.
 */
function FundFact({ row }: { row: ContributionRow }) {
  const donationType = (row.donationType ?? "voluntary") as DonationType;
  const issue = donationTypeFundIssue({ donationType, fundId: row.fundId });
  if (!issue) {
    return <>{row.fund?.name ?? "—"}</>;
  }
  return (
    <span className="flex flex-col gap-1">
      <span>{row.fund?.name ?? "—"}</span>
      <span
        className="text-destructive text-xs"
        data-testid="contribution-fund-mismatch"
      >
        {donationType === "corpus"
          ? `${issue}: the books credit the Corpus Fund. Edit the gift to move it, or change its type.`
          : `${issue}: the books count it as income of that fund. Edit the gift to change its fund, or make it a corpus gift.`}
      </span>
    </span>
  );
}

/** Refunds recorded against the contribution: date, amount and reference. */
function RefundsList({
  refunds,
}: {
  refunds: NonNullable<ContributionRow["refunds"]>;
}) {
  return (
    <section aria-label="Refunds" className="flex flex-col gap-2 px-6 pb-6">
      <h3 className="text-sm font-medium">Refunds</h3>
      <ul
        className="divide-y rounded-lg border"
        data-testid="contribution-refunds"
      >
        {refunds.map((refund) => (
          <li
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            key={refund.id}
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-mono tabular-nums">
                {formatPaise(refund.amountPaise)}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {formatReceivedOn(refund.refundedOn)}
                {refund.reference ? ` · ${refund.reference}` : ""}
              </span>
            </span>
            {refund.refundAfterReceipt || refund.amountChanged ? (
              <span className="flex shrink-0 gap-1">
                {refund.refundAfterReceipt ? (
                  <Tag>Refund after receipt</Tag>
                ) : null}
                {refund.amountChanged ? <Tag>Amount changed</Tag> : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Settled on 16 Oct 2026 · setl_…9xYz (UTR …)" for a processed
 * settlement, "Settlement pending" for one not processed yet, otherwise
 * "Not settled yet".
 */
export function settledLabel(state: ContributionSettlement): string {
  if (state.kind === "loading") {
    return "…";
  }
  if (state.kind === "none") {
    return "Not settled yet";
  }
  if (state.kind === "pending") {
    return `Settlement pending · ${shortId(state.settlement.externalId)}`;
  }
  const { settlement } = state;
  return `Settled on ${formatReceivedOn(settlement.settledOn)} · ${shortId(settlement.externalId)}${
    settlement.utr ? ` (UTR ${settlement.utr})` : ""
  }`;
}

export function ContributionDetailSheet({
  canDelete,
  canEdit,
  contribution,
  onDelete,
  onEdit,
  onOpenChange,
}: {
  /** donors.manage, an editable status and no refunds. */
  canDelete: boolean;
  /** donors.manage and an editable status. */
  canEdit: boolean;
  contribution: ContributionRow | null;
  onDelete: (contribution: ContributionRow) => void;
  onEdit: (contribution: ContributionRow) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { hasPermission } = useApp();
  const seesSettlements =
    hasPermission("finance.view") || hasPermission("finance.manage");
  const seesReceipts = canReadReceipts((permission) =>
    hasPermission(permission as PermissionId)
  );
  const canIssueReceipts = hasPermission("donors.receipt");
  const isGatewayGift =
    contribution !== null && isGatewayContribution(contribution);
  // Gateway gifts only: when the provider paid it out to the bank.
  const settlement = useContributionSettlement(
    contribution?.id ?? null,
    seesSettlements && isGatewayGift
  );
  // Paid out by a processed settlement (or not known yet): no Delete.
  const settlementLock = useSettlementLock(
    contribution?.id ?? null,
    isGatewayGift
  );
  if (!contribution) {
    return (
      <Sheet onOpenChange={onOpenChange} open={false}>
        <SheetContent />
      </Sheet>
    );
  }
  const row = contribution;
  const channel =
    CONTRIBUTION_CHANNEL_LABELS[row.channel as ContributionChannel];
  const refunded = refundSummary(row);
  // A Razorpay import's reference is its payment ID: link to its dashboard page.
  const razorpayUrl = razorpayPaymentUrl(row);
  const facts: [string, ReactNode][] = [
    ["Donor", donorName(row)],
    ["Amount", formatPaise(row.amountPaise)],
    ...(refunded
      ? ([
          [
            "Refunded",
            refundedOfLabel(refunded.refundedPaise, row.amountPaise),
          ],
        ] as [string, ReactNode][])
      : []),
    ["Received on", formatReceivedOn(row.receivedOn)],
    ["Channel", channel],
    ...(row.intermediary
      ? ([["Through", row.intermediary.displayName]] as [string, ReactNode][])
      : []),
    [
      "Reporting mode",
      withDescription(
        REPORTING_MODE_LABELS[row.reportingMode as ContributionReportingMode],
        row.reportingModeDescription
      ),
    ],
    [
      "Donation type",
      withDescription(
        DONATION_TYPE_LABELS[(row.donationType ?? "voluntary") as DonationType],
        row.donationTypeDescription
      ),
    ],
    [
      "Tax certificate",
      withDescription(
        TAX_CERTIFICATE_LABELS[
          (row.deductionEligible ?? "unknown") as DeductionEligible
        ],
        row.deductionEligible === "no" ? (row.eligibilityReason ?? null) : null
      ),
    ],
    ...(row.channel === "in_kind"
      ? ([
          ["What was given", row.inKindDescription ?? "—"],
          ["Valuation basis", row.inKindValuationBasis ?? "—"],
        ] as [string, ReactNode][])
      : ([["Deposited into", row.orgAccount?.name ?? "—"]] as [
          string,
          ReactNode,
        ][])),
    ["Fund", <FundFact key="fund" row={row} />],
    ["Programme", row.programme?.name ?? "—"],
    ["Project", row.project?.name ?? "—"],
    // Grants are finance data.
    ...(hasPermission("finance.view")
      ? ([
          ["Grant", <ContributionGrantFact contribution={row} key="grant" />],
        ] as [string, ReactNode][])
      : []),
    ["Reference", row.reference ?? "—"],
    // Money deposited straight into a bank account: the statement line.
    ...(seesSettlements &&
    ["upi", "neft", "cheque", "cash"].includes(row.channel ?? "")
      ? ([
          [
            "In bank",
            <ContributionInBank contributionId={row.id} key="in-bank" />,
          ],
        ] as [string, ReactNode][])
      : []),
    // Gateway gifts only: when the provider paid it out to the bank.
    ...(isGatewayGift && seesSettlements
      ? ([
          [
            "Settlement",
            <span data-testid="contribution-settled" key="settled">
              {settledLabel(settlement)}
            </span>,
          ],
        ] as [string, ReactNode][])
      : []),
    ...(seesReceipts
      ? ([
          [
            "Receipt",
            <ContributionReceiptFact
              canIssue={canIssueReceipts}
              key="receipt"
              row={row}
            />,
          ],
        ] as [string, ReactNode][])
      : []),
    ["Notes", row.notes ?? "—"],
    [
      "Source",
      CONTRIBUTION_SOURCE_LABELS[
        (row.source ?? "manual") as ContributionSource
      ],
    ],
    ["Recorded", format(new Date(row.createdAt), DATE_TIME)],
  ];

  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent>
        <DetailSheetHeader
          actions={
            canEdit || razorpayUrl ? (
              <>
                {razorpayUrl ? (
                  <Button
                    data-testid="open-in-razorpay"
                    render={
                      <a
                        href={razorpayUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      />
                    }
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={LinkSquare02Icon}
                      strokeWidth={2}
                    />
                    Open in Razorpay
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    onClick={() => onEdit(row)}
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={Edit02Icon}
                      strokeWidth={2}
                    />
                    Edit
                  </Button>
                ) : null}
                {canEdit && canDelete && settlementLock === "unlocked" ? (
                  <PageHeaderMenu
                    actions={[
                      {
                        destructive: true,
                        icon: Delete02Icon,
                        id: "delete",
                        label: "Delete contribution",
                        onSelect: () => onDelete(row),
                      },
                    ]}
                    title="Contribution actions"
                  />
                ) : null}
              </>
            ) : null
          }
          badge={<ContributionStatusBadge refund={row} status={row.status} />}
          meta={[donorName(row), formatReceivedOn(row.receivedOn), channel]}
          title={formatPaise(row.amountPaise)}
        />
        <div className="px-6 pb-4">
          <InTheBooks sourceId={row.id} sourceType="contribution" />
        </div>
        <dl className="flex flex-col gap-2.5 px-6 pb-6">
          {facts.map(([label, value]) => (
            <DetailsRow key={label} label={label}>
              {value}
            </DetailsRow>
          ))}
        </dl>
        {row.refunds && row.refunds.length > 0 ? (
          <RefundsList refunds={row.refunds} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
