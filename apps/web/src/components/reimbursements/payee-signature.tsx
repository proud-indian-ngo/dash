import { SignatureIcon, TickDouble02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { qualifiesForCashVoucher } from "@pi-dash/shared/cash-voucher";
import {
  payeeSignatureStatement,
  signatureExpenseDay,
} from "@pi-dash/shared/payee-signature";
import { formatReceiptDate } from "@pi-dash/shared/receipts";
import type { ReimbursementAttachment } from "@pi-dash/zero/schema";
import { useEffect, useState } from "react";

import { CollectPayeeSignatureDialog } from "@/components/reimbursements/collect-payee-signature-dialog";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { formatTimestamp } from "@/lib/date-formats";

export interface PayeeSignatureItem {
  amountPaise: number;
  category?: { name: string } | null;
  description?: null | string;
  generateVoucher?: boolean | null;
  id: string;
  payeeName?: null | string;
  payeeSignatureAttachmentId?: null | string;
  payeeSignatureCapturedAt?: null | number;
}

/**
 * Who may collect the payee's signature and when, mirroring the mutator:
 * the claimant, finance or an approver, until the request is approved.
 */
export function canCollectPayeeSignature(input: {
  hasPermission: (id: "finance.manage" | "requests.approve") => boolean;
  request: { status: null | string; userId: string };
  userId: string;
  voided: boolean;
}): boolean {
  return (
    !input.voided &&
    input.request.status !== "approved" &&
    (input.request.userId === input.userId ||
      input.hasPermission("finance.manage") ||
      input.hasPermission("requests.approve"))
  );
}

/**
 * The payee's signature on a cash-voucher line item: a "Signed by" chip with
 * a thumbnail (and Re-collect until approval), the action to collect it, or
 * why none is needed. Approvers see the chip before they approve.
 */
export function PayeeSignatureLine({
  attachments,
  canCollect,
  expenseDate,
  item,
  limitPaise,
  reimbursementId,
}: {
  attachments: readonly ReimbursementAttachment[];
  canCollect: boolean;
  expenseDate: number;
  item: PayeeSignatureItem;
  limitPaise: number;
  reimbursementId: string;
}) {
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const openDialog = useEventCallback(() => {
    setDialogKey((key) => key + 1);
    setOpen(true);
  });

  if (!item.generateVoucher) {
    return null;
  }
  const payeeName = item.payeeName?.trim();
  if (!payeeName) {
    return canCollect ? (
      <span className="text-muted-foreground mt-1 block text-xs">
        No payee signature needed: the claimant was paid
      </span>
    ) : null;
  }
  const eligible = qualifiesForCashVoucher(item.amountPaise, limitPaise);
  const signatureId = item.payeeSignatureAttachmentId;
  const signature = signatureId
    ? attachments.find((a) => a.id === signatureId)
    : undefined;

  const dialog =
    canCollect && eligible ? (
      <CollectPayeeSignatureDialog
        dateLabel={formatReceiptDate(signatureExpenseDay(expenseDate))}
        key={dialogKey}
        lineItemId={item.id}
        onOpenChange={setOpen}
        open={open}
        payeeName={payeeName}
        reimbursementId={reimbursementId}
        replacesAttachmentId={signatureId ?? null}
        statement={payeeSignatureStatement({
          amountPaise: item.amountPaise,
          categoryName: item.category?.name,
          description: item.description,
          expenseDate,
          payeeName,
        })}
      />
    ) : null;

  if (signatureId && signature) {
    const href = getProtectedAttachmentHref(
      { id: signature.id, kind: "reimbursementAttachment" },
      "inline"
    );
    const signedAt = item.payeeSignatureCapturedAt
      ? formatTimestamp(new Date(item.payeeSignatureCapturedAt).toISOString())
      : null;
    return (
      <div
        className="bg-card mt-1.5 inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border py-1 pr-1 pl-1"
        data-testid="payee-signature-chip"
      >
        <a
          className="shrink-0 rounded-sm border bg-white"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <SignatureThumbnail alt={`Signature of ${payeeName}`} src={href} />
        </a>
        <span className="text-foreground flex items-center gap-1 text-xs">
          <HugeiconsIcon
            className="text-success-foreground size-3.5 shrink-0"
            icon={TickDouble02Icon}
            strokeWidth={2}
          />
          <span>
            Signed by {payeeName}
            {signedAt ? ` · ${signedAt}` : null}
          </span>
        </span>
        {dialog ? (
          <Button
            className="h-auto px-1.5 py-0.5 text-xs"
            onClick={openDialog}
            size="sm"
            type="button"
            variant="ghost"
          >
            Re-collect
          </Button>
        ) : null}
        {dialog}
      </div>
    );
  }

  if (dialog) {
    return (
      <>
        <Button
          className="mt-1.5 h-auto px-2 py-1 text-xs"
          onClick={openDialog}
          size="sm"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon
            className="size-3.5"
            icon={SignatureIcon}
            strokeWidth={2}
          />
          Collect payee signature
        </Button>
        {dialog}
      </>
    );
  }

  return (
    <span className="text-muted-foreground mt-1 block text-xs">
      Payee hasn't signed on the dashboard; they sign the printed voucher
    </span>
  );
}

const THUMBNAIL_RETRIES = 4;

/**
 * The signature's thumbnail. The chip shows as soon as the signature syncs,
 * which can be a moment before the server has stored the file, so a failed
 * load is retried a few times rather than left broken.
 */
function SignatureThumbnail({ alt, src }: { alt: string; src: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!failed || attempt >= THUMBNAIL_RETRIES) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        setFailed(false);
        setAttempt((n) => n + 1);
      },
      1000 * (attempt + 1)
    );
    return () => window.clearTimeout(timer);
  }, [attempt, failed]);
  const onError = useEventCallback(() => setFailed(true));
  return (
    <img
      alt={alt}
      className="h-8 w-20 object-contain"
      height={32}
      key={attempt}
      onError={onError}
      src={attempt === 0 ? src : `${src}&attempt=${attempt}`}
      width={80}
    />
  );
}
