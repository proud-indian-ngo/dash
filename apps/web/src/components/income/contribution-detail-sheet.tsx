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

export function ContributionDetailSheet({
  canEdit,
  contribution,
  onDelete,
  onEdit,
  onOpenChange,
}: {
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
              </>
            ) : null
          }
          badge={<ContributionStatusBadge status={row.status} />}
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
      </SheetContent>
    </Sheet>
  );
}
