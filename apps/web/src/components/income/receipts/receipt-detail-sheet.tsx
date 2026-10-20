import {
  Cancel01Icon,
  Download04Icon,
  Mail01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import type { ContributionChannel } from "@pi-dash/shared/constants";
import { CONTRIBUTION_CHANNEL_LABELS } from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { DATE_TIME } from "@/lib/date-formats";

import { formatReceivedOn } from "../income-date";
import {
  type ReceiptRow,
  receiptDonorName,
  receiptPdfUrl,
} from "./receipt-types";
import { ReceiptStatusBadge } from "./receipts-table";

/**
 * A receipt: who it was issued to and by, the gift, and its void reason.
 * Issuers get Download, Email and Void in the header.
 */
export function ReceiptDetailSheet({
  canIssue,
  emailing,
  onEmail,
  onOpenChange,
  onVoid,
  receipt,
}: {
  canIssue: boolean;
  emailing: boolean;
  onEmail: (row: ReceiptRow) => void;
  onOpenChange: (open: boolean) => void;
  onVoid: (row: ReceiptRow) => void;
  receipt: ReceiptRow | null;
}) {
  if (!receipt) {
    return (
      <Sheet onOpenChange={onOpenChange} open={false}>
        <SheetContent />
      </Sheet>
    );
  }
  const row = receipt;
  const gift = row.contribution;
  const facts: [string, ReactNode][] = [
    ["Issued to", receiptDonorName(row)],
    ["Issued on", formatReceivedOn(row.issuedOn)],
    ["Issued by", row.issuedByUser?.name ?? "—"],
    ["Amount", gift ? formatPaise(gift.amountPaise) : "—"],
    ["Received on", gift ? formatReceivedOn(gift.receivedOn) : "—"],
    [
      "Mode",
      gift
        ? `${CONTRIBUTION_CHANNEL_LABELS[gift.channel as ContributionChannel]}${gift.reference ? ` · ${gift.reference}` : ""}`
        : "—",
    ],
    [
      "Emailed",
      row.emailedAt
        ? format(new Date(row.emailedAt), DATE_TIME)
        : "Not emailed",
    ],
    ...(row.voidedAt
      ? ([
          ["Voided", format(new Date(row.voidedAt), DATE_TIME)],
          ["Voided by", row.voidedByUser?.name ?? "—"],
          ["Reason", row.voidReason ?? "—"],
        ] as [string, ReactNode][])
      : []),
  ];
  const live = !row.voidedAt;
  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent>
        <DetailSheetHeader
          actions={
            canIssue ? (
              <>
                <FilePreviewButton
                  className={buttonVariants({ variant: "outline" })}
                  data-testid="receipt-view"
                  src={receiptPdfUrl(row.id, "inline")}
                  fileName={`Receipt ${row.number}`}
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={ViewIcon}
                    strokeWidth={2}
                  />
                  View
                </FilePreviewButton>
                {live ? (
                  <Button
                    disabled={emailing}
                    onClick={() => onEmail(row)}
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={Mail01Icon}
                      strokeWidth={2}
                    />
                    Email
                  </Button>
                ) : null}
                <PageHeaderMenu
                  actions={[
                    {
                      icon: Download04Icon,
                      id: "download",
                      label: "Download PDF",
                      render: (
                        <a
                          aria-label="Download PDF"
                          download
                          href={receiptPdfUrl(row.id)}
                        />
                      ),
                    },
                    ...(live
                      ? [
                          {
                            destructive: true,
                            icon: Cancel01Icon,
                            id: "void",
                            label: "Void receipt",
                            onSelect: () => onVoid(row),
                          },
                        ]
                      : []),
                  ]}
                  title="Receipt actions"
                />
              </>
            ) : null
          }
          badge={<ReceiptStatusBadge row={row} />}
          meta={[receiptDonorName(row), formatReceivedOn(row.issuedOn)]}
          title={row.number}
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
