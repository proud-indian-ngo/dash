import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";

import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import {
  AttachmentList,
  RecordSection,
  RejectionNote,
} from "@/components/shared/record-detail";
import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";
import { mapAttachmentsToFormValues } from "@/lib/submission-mappers";

import { InvoiceFormDialog } from "./vendor-payment-invoice-form";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

interface AttachmentRow {
  filename?: string | null;
  id: string;
  mimeType?: string | null;
  objectKey?: string | null;
  type: "file" | "url";
  url?: string | null;
}

interface VendorPaymentInvoiceSectionProps {
  canApprove: boolean;
  invoiceAttachments: AttachmentRow[];
  isOwner: boolean;
  request: VendorPaymentWithRelations;
  status: string;
}

function InvoiceContent({
  hasInvoiceDetails,
  invoiceAttachments,
  rejectionReason,
  request,
  showEmptyState,
}: {
  hasInvoiceDetails: boolean;
  invoiceAttachments: AttachmentRow[];
  rejectionReason: string | null;
  request: VendorPaymentWithRelations;
  showEmptyState: boolean;
}) {
  return (
    <>
      {rejectionReason ? (
        <RejectionNote label="Invoice rejected" reason={rejectionReason} />
      ) : null}

      {hasInvoiceDetails ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Invoice </span>
          <span className="font-mono font-medium">{request.invoiceNumber}</span>
          {request.invoiceDate ? (
            <span className="text-muted-foreground tabular-nums">
              {" "}
              · {format(request.invoiceDate, DATE)}
            </span>
          ) : null}
          {request.invoiceReviewer && request.invoiceReviewedAt ? (
            <span className="text-muted-foreground">
              {" "}
              · approved by{" "}
              <span className="text-foreground">
                {request.invoiceReviewer.name}
              </span>{" "}
              on {format(request.invoiceReviewedAt, DATE)}
            </span>
          ) : null}
        </p>
      ) : null}

      {invoiceAttachments.length > 0 ? (
        <AttachmentList
          attachments={invoiceAttachments}
          kind="vendorPaymentAttachment"
        />
      ) : null}
      {showEmptyState ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
          No invoice uploaded yet.
        </p>
      ) : null}
    </>
  );
}

const INVOICE_STATUSES = new Set(["paid", "invoice_pending", "completed"]);

export function VendorPaymentInvoiceSection({
  canApprove,
  invoiceAttachments,
  isOwner,
  request,
  status,
}: VendorPaymentInvoiceSectionProps) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canEditAll = hasPermission("requests.edit_all");
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [invoiceApproveOpen, setInvoiceApproveOpen] = useState(false);
  const [invoiceRejectOpen, setInvoiceRejectOpen] = useState(false);

  const handleApproveInvoice = useEventCallback(async (message: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.approveInvoice({
        id: request.id,
        note: message || undefined,
      })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: "Failed to approve invoice",
      mutation: "vendorPayment.approveInvoice",
      successMsg: "Invoice approved",
    });
    return res.type !== "error";
  });

  const handleRejectInvoice = useEventCallback(async (reason: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.rejectInvoice({ id: request.id, reason })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: "Failed to reject invoice",
      mutation: "vendorPayment.rejectInvoice",
      successMsg: "Invoice rejected",
    });
    if (res.type !== "error") {
      setInvoiceRejectOpen(false);
    }
  });
  const stableOnClick0 = useEventCallback(() => setInvoiceFormOpen(true));
  const stableOnClick1 = useEventCallback(() => setInvoiceFormOpen(true));
  const stableOnClick2 = useEventCallback(() => setInvoiceApproveOpen(true));
  const stableOnClick3 = useEventCallback(() => setInvoiceRejectOpen(true));

  if (!INVOICE_STATUSES.has(status)) {
    return null;
  }

  const wasRejected =
    Boolean(request.invoiceRejectionReason) && status === "paid";
  const hasInvoiceDetails = Boolean(
    request.invoiceNumber || request.invoiceDate
  );
  const showUploadButton = status === "paid" && (isOwner || canApprove);
  const showEditButton =
    (status === "invoice_pending" && isOwner) ||
    (canEditAll && hasInvoiceDetails);
  const showApproveRejectActions = canApprove && status === "invoice_pending";
  const showEmptyState = invoiceAttachments.length === 0 && status === "paid";
  return (
    <>
      <RecordSection
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {showApproveRejectActions ? (
              <>
                <Button onClick={stableOnClick2} size="sm" type="button">
                  <HugeiconsIcon
                    className="size-4"
                    icon={CheckmarkCircle01Icon}
                    strokeWidth={2}
                  />
                  Approve invoice
                </Button>
                <Button
                  onClick={stableOnClick3}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={Cancel01Icon}
                    strokeWidth={2}
                  />
                  Reject invoice
                </Button>
              </>
            ) : null}
            {showUploadButton ? (
              <Button
                onClick={stableOnClick0}
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Upload04Icon}
                  strokeWidth={2}
                />
                {wasRejected ? "Resubmit invoice" : "Upload invoice"}
              </Button>
            ) : null}
            {showEditButton ? (
              <Button
                onClick={stableOnClick1}
                size="sm"
                type="button"
                variant="outline"
              >
                Edit invoice
              </Button>
            ) : null}
          </div>
        }
        title="Invoice"
      >
        <InvoiceContent
          hasInvoiceDetails={hasInvoiceDetails}
          invoiceAttachments={invoiceAttachments}
          rejectionReason={request.invoiceRejectionReason as string | null}
          request={request}
          showEmptyState={showEmptyState}
        />
      </RecordSection>

      <InvoiceFormDialog
        initialValues={
          request.invoiceNumber
            ? {
                attachments: mapAttachmentsToFormValues(invoiceAttachments),
                invoiceDate: request.invoiceDate
                  ? new Date(request.invoiceDate)
                  : null,
                invoiceNumber: request.invoiceNumber as string,
              }
            : undefined
        }
        mode={showEditButton && hasInvoiceDetails ? "edit" : "submit"}
        onOpenChange={setInvoiceFormOpen}
        open={invoiceFormOpen}
        vendorPaymentId={request.id as string}
      />

      <ApproveDialog
        entityId={request.id}
        entityLabel="invoice"
        hideScreenshot
        onConfirm={handleApproveInvoice}
        onOpenChange={setInvoiceApproveOpen}
        open={invoiceApproveOpen}
      />
      <RejectDialog
        entityLabel="invoice"
        onConfirm={handleRejectInvoice}
        onOpenChange={setInvoiceRejectOpen}
        open={invoiceRejectOpen}
      />
    </>
  );
}
