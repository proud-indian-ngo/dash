import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { LONG_DATE } from "@/lib/date-formats";
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

function InvoiceAttachmentList({
  attachments,
}: {
  attachments: AttachmentRow[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {attachments.map((att) => (
        <div
          className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2"
          key={att.id}
        >
          <span className="min-w-0 truncate text-sm">
            {getAttachmentLabel(att)}
          </span>
          <div className="flex items-center gap-3">
            {att.type === "url" ? (
              <a
                className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                href={getAttachmentPreviewHref(att)}
                rel="noopener noreferrer"
                target="_blank"
              >
                View link
              </a>
            ) : (
              <>
                <a
                  className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                  href={getAttachmentPreviewHref(att)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Preview
                </a>
                <a
                  className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                  download
                  href={getAttachmentDownloadHref(att)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Download
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
          <span className="font-medium">Invoice rejected: </span>
          {rejectionReason}
        </div>
      ) : null}

      {hasInvoiceDetails ? (
        <div className="grid grid-cols-2 gap-4 rounded-md border p-3">
          <div>
            <p className="text-muted-foreground text-xs">Invoice Number</p>
            <p className="font-medium text-sm">
              {request.invoiceNumber ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Invoice Date</p>
            <p className="font-medium text-sm">
              {request.invoiceDate
                ? format(request.invoiceDate, LONG_DATE)
                : "—"}
            </p>
          </div>
        </div>
      ) : null}

      {request.invoiceReviewer && request.invoiceReviewedAt ? (
        <p className="text-muted-foreground text-sm">
          Invoice approved by{" "}
          <span className="font-medium text-foreground">
            {request.invoiceReviewer.name}
          </span>{" "}
          on {format(request.invoiceReviewedAt, LONG_DATE)}
        </p>
      ) : null}

      {invoiceAttachments.length > 0 ? (
        <InvoiceAttachmentList attachments={invoiceAttachments} />
      ) : null}
      {showEmptyState ? (
        <p className="text-center text-muted-foreground text-sm">
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
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [invoiceApproveOpen, setInvoiceApproveOpen] = useState(false);
  const [invoiceRejectOpen, setInvoiceRejectOpen] = useState(false);

  const handleApproveInvoice = async (message: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.approveInvoice({
        id: request.id,
        note: message || undefined,
      })
    ).server;
    handleMutationResult(res, {
      mutation: "vendorPayment.approveInvoice",
      entityId: request.id,
      successMsg: "Invoice approved",
      errorMsg: "Failed to approve invoice",
    });
    if (res.type !== "error") {
      setInvoiceApproveOpen(false);
    }
  };

  const handleRejectInvoice = async (reason: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.rejectInvoice({ id: request.id, reason })
    ).server;
    handleMutationResult(res, {
      mutation: "vendorPayment.rejectInvoice",
      entityId: request.id,
      successMsg: "Invoice rejected",
      errorMsg: "Failed to reject invoice",
    });
    if (res.type !== "error") {
      setInvoiceRejectOpen(false);
    }
  };

  if (!INVOICE_STATUSES.has(status)) {
    return null;
  }

  const wasRejected =
    Boolean(request.invoiceRejectionReason) && status === "paid";
  const showUploadButton = status === "paid" && (isOwner || canApprove);
  const showEditButton = status === "invoice_pending" && isOwner;
  const showApproveRejectActions = canApprove && status === "invoice_pending";
  const hasInvoiceDetails = Boolean(
    request.invoiceNumber || request.invoiceDate
  );
  const showEmptyState = invoiceAttachments.length === 0 && status === "paid";

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">Invoice</h2>
          {showUploadButton ? (
            <Button
              onClick={() => setInvoiceFormOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Upload04Icon}
                strokeWidth={2}
              />
              {wasRejected ? "Resubmit Invoice" : "Upload Invoice"}
            </Button>
          ) : null}
          {showEditButton ? (
            <Button
              onClick={() => setInvoiceFormOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Edit Invoice
            </Button>
          ) : null}
        </div>

        <InvoiceContent
          hasInvoiceDetails={hasInvoiceDetails}
          invoiceAttachments={invoiceAttachments}
          rejectionReason={request.invoiceRejectionReason as string | null}
          request={request}
          showEmptyState={showEmptyState}
        />

        {showApproveRejectActions ? (
          <div className="flex gap-2">
            <Button
              onClick={() => setInvoiceApproveOpen(true)}
              type="button"
              variant="default"
            >
              <HugeiconsIcon
                className="size-4"
                icon={CheckmarkCircle01Icon}
                strokeWidth={2}
              />
              Approve Invoice
            </Button>
            <Button
              onClick={() => setInvoiceRejectOpen(true)}
              type="button"
              variant="destructive"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Cancel01Icon}
                strokeWidth={2}
              />
              Reject Invoice
            </Button>
          </div>
        ) : null}
      </div>

      <InvoiceFormDialog
        initialValues={
          request.invoiceNumber
            ? {
                invoiceNumber: request.invoiceNumber as string,
                invoiceDate: request.invoiceDate
                  ? new Date(request.invoiceDate)
                  : null,
                attachments: mapAttachmentsToFormValues(invoiceAttachments),
              }
            : undefined
        }
        mode={status === "invoice_pending" ? "edit" : "submit"}
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
