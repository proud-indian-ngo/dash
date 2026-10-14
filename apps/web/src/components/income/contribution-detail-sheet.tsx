import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type {
  ContributionChannel,
  ContributionReportingMode,
  ContributionSource,
  DonationType,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  CONTRIBUTION_SOURCE_LABELS,
  DONATION_TYPE_LABELS,
  REPORTING_MODE_LABELS,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { Tag } from "@/components/shared/status-badge";
import { DATE, DATE_TIME } from "@/lib/date-formats";
import { epochToLocalDate } from "@/lib/local-date";

import { ContributionStatusBadge } from "./contribution-status";
import { type ContributionRow, donorName } from "./income-types";

function withDescription(label: string, description: string | null) {
  return description ? `${label}: ${description}` : label;
}

export function formatReceivedOn(epoch: number): string {
  const date = epochToLocalDate(epoch);
  return date ? format(date, DATE) : "—";
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
  const facts: [string, ReactNode][] = [
    ["Donor", donorName(row)],
    ["Amount", formatPaise(row.amountPaise)],
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
    ...(row.channel === "in_kind"
      ? ([
          ["What was given", row.inKindDescription ?? "—"],
          ["Valuation basis", row.inKindValuationBasis ?? "—"],
        ] as [string, ReactNode][])
      : ([["Deposited into", row.orgAccount?.name ?? "—"]] as [
          string,
          ReactNode,
        ][])),
    ["Fund", row.fund?.name ?? "—"],
    ["Programme", row.programme?.name ?? "—"],
    ["Project", row.project?.name ?? "—"],
    ["Reference", row.reference ?? "—"],
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
            canEdit ? (
              <>
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
                {canDelete ? (
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
