import {
  Cancel01Icon,
  Download04Icon,
  Mail01Icon,
  SentIcon,
  ViewIcon,
  WhatsappIcon,
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
  type ReceiptContacts,
  receiptDeliveryLabel,
  receiptDeliveryNoteLabel,
  type ReceiptRow,
  receiptDonorName,
  receiptPdfUrl,
  receiptSendOptions,
} from "./receipt-types";
import { ReceiptStatusBadge } from "./receipts-table";
import type { ReceiptSend } from "./use-send-receipt";

const sentOn = (
  time: number | null | undefined,
  never: string,
  reason: string | null
) => {
  if (time) {
    return format(new Date(time), DATE_TIME);
  }
  return reason ? `${never} (${reason})` : never;
};

/**
 * A receipt: who it was issued to and by, the gift, its delivery and its
 * void reason. Issuers get the sends, Download and Void in the header.
 */
export function ReceiptDetailSheet({
  canIssue,
  contacts,
  onOpenChange,
  onSend,
  onVoid,
  receipt,
  sending,
}: {
  canIssue: boolean;
  contacts: ReceiptContacts | undefined;
  onOpenChange: (open: boolean) => void;
  onSend: (how: ReceiptSend, row: ReceiptRow) => void;
  onVoid: (row: ReceiptRow) => void;
  receipt: ReceiptRow | null;
  /** A send is being queued; one at a time. */
  sending: boolean;
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
  const live = !row.voidedAt;
  const options = receiptSendOptions(row, contacts, Date.now());
  const note = receiptDeliveryNoteLabel(row);
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
      "Delivery",
      <span data-testid="receipt-delivery" key="delivery">
        {receiptDeliveryLabel(row)}
      </span>,
    ],
    ...(note ? ([["Last send", note]] as [string, ReactNode][]) : []),
    [
      "Emailed",
      sentOn(row.emailedAt, "Not emailed", live ? options.email : null),
    ],
    [
      "WhatsApp",
      sentOn(row.whatsappSentAt, "Not sent", live ? options.whatsapp : null),
    ],
    ...(row.voidedAt
      ? ([
          ["Voided", format(new Date(row.voidedAt), DATE_TIME)],
          ["Voided by", row.voidedByUser?.name ?? "—"],
          ["Reason", row.voidReason ?? "—"],
        ] as [string, ReactNode][])
      : []),
  ];
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
                {live && options.now ? (
                  <Button
                    disabled={sending || options.now.blocked !== null}
                    onClick={() => onSend("now", row)}
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={SentIcon}
                      strokeWidth={2}
                    />
                    Send now
                  </Button>
                ) : null}
                {live ? (
                  <Button
                    disabled={sending || options.email !== null}
                    onClick={() => onSend("email", row)}
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
                {live ? (
                  <Button
                    disabled={sending || options.whatsapp !== null}
                    onClick={() => onSend("whatsapp", row)}
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={WhatsappIcon}
                      strokeWidth={2}
                    />
                    WhatsApp
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
