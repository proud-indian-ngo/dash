import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatNoInvoice } from "@pi-dash/shared/vendor-payment";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useEffect, useState } from "react";

import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import {
  AttachmentList,
  RecordSection,
  RejectionNote,
} from "@/components/shared/record-detail";
import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import { epochToLocalDate } from "@/lib/local-date";
import { handleMutationResult } from "@/lib/mutation-result";
import { mapAttachmentsToFormValues } from "@/lib/submission-mappers";

import { InvoiceFormDialog } from "./vendor-payment-invoice-form";
import {
  type LineCharges,
  lineChargesOf,
  ProvisionChargePicker,
  ProvisionSplit,
  provisionArgs,
  useCanSeeProvision,
  useVendorPaymentProvision,
} from "./vendor-payment-provision";
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

function ReviewedBy({ request }: { request: VendorPaymentWithRelations }) {
  if (
    !(
      request.status === "completed" &&
      request.invoiceReviewer &&
      request.invoiceReviewedAt
    )
  ) {
    return null;
  }
  return (
    <span className="text-muted-foreground">
      {" "}
      · approved by{" "}
      <span className="text-foreground">
        {request.invoiceReviewer.name}
      </span> on{" "}
      {format(request.invoiceReviewedAt, DATE)}
    </span>
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
  const { noInvoiceNote, noInvoiceReason } = request;
  const documentDate = epochToLocalDate(request.invoiceDate);
  return (
    <>
      {rejectionReason ? (
        <RejectionNote
          label={noInvoiceReason ? "Reason rejected" : "Invoice rejected"}
          reason={rejectionReason}
        />
      ) : null}

      {noInvoiceReason ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            <span className="font-medium">
              {formatNoInvoice(noInvoiceReason)}
            </span>
            {documentDate ? (
              <span className="text-muted-foreground tabular-nums">
                {" "}
                · {format(documentDate, DATE)}
              </span>
            ) : null}
            <ReviewedBy request={request} />
          </p>
          {noInvoiceNote ? (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {noInvoiceNote}
            </p>
          ) : null}
          {invoiceAttachments.length === 0 ? (
            <p className="text-warning-foreground flex items-center gap-1.5 text-sm">
              <HugeiconsIcon className="size-4" icon={AlertCircleIcon} />
              No proof attached
            </p>
          ) : null}
        </div>
      ) : null}

      {hasInvoiceDetails && !noInvoiceReason ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Invoice </span>
          <span className="font-mono font-medium">{request.invoiceNumber}</span>
          {documentDate ? (
            <span className="text-muted-foreground tabular-nums">
              {" "}
              · {format(documentDate, DATE)}
            </span>
          ) : null}
          <ReviewedBy request={request} />
        </p>
      ) : null}

      {invoiceAttachments.length > 0 ? (
        <div className="flex flex-col gap-1">
          {noInvoiceReason ? (
            <p className="text-muted-foreground text-xs font-medium">Proof</p>
          ) : null}
          <AttachmentList
            attachments={invoiceAttachments}
            kind="vendorPaymentAttachment"
          />
        </div>
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
  const [invoiceFormMode, setInvoiceFormMode] = useState<"submit" | "edit">(
    "submit"
  );
  const [invoiceApproveOpen, setInvoiceApproveOpen] = useState(false);
  const [invoiceRejectOpen, setInvoiceRejectOpen] = useState(false);
  const isNoInvoice = Boolean(request.noInvoiceReason);
  // What the approver reviews: the vendor's invoice, or the request to close
  // the payment without one.
  const reviewLabel = isNoInvoice ? "payment without an invoice" : "invoice";

  // What each line is charged to: its category, or the audit fee
  // provision (finance picks at approval; the books split it).
  const canSeeProvision = useCanSeeProvision();
  const [charges, setCharges] = useState<LineCharges>({});
  const hasProvisionLine = request.lineItems.some((l) => l.provisionHeadId);
  // The provision choice stays folded away until asked for ("Charge to a
  // provision"); folded, every line goes to its category.
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [splitCheck, setSplitCheck] = useState(0);
  const provision = useVendorPaymentProvision(
    request.id,
    canSeeProvision &&
      ((invoiceApproveOpen && provisionOpen) ||
        (status === "completed" && hasProvisionLine)),
    `${status}:${invoiceApproveOpen}:${provisionOpen}:${splitCheck}`
  );
  const awaitingSplit =
    status === "completed" &&
    hasProvisionLine &&
    provision !== null &&
    !request.lineItems.every(
      (l) =>
        !l.provisionHeadId || provision.split.some((s) => s.lineId === l.id)
    );
  // The books post the accepted invoice moments after approval: look again
  // a few times until the split is there.
  useEffect(() => {
    if (!awaitingSplit || splitCheck >= 5) {
      return;
    }
    const timer = setTimeout(() => setSplitCheck((n) => n + 1), 3000);
    return () => clearTimeout(timer);
  }, [awaitingSplit, splitCheck]);
  const handleChargeChange = useEventCallback((lineId: string, head: string) =>
    setCharges((current) => ({ ...current, [lineId]: head }))
  );
  const handleOpenProvision = useEventCallback(() => setProvisionOpen(true));

  const handleApproveInvoice = useEventCallback(async (message: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.approveInvoice({
        id: request.id,
        note: message || undefined,
        ...(provisionOpen ? provisionArgs(charges) : {}),
      })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: `Failed to approve ${reviewLabel}`,
      mutation: "vendorPayment.approveInvoice",
      successMsg: isNoInvoice ? "Closed without invoice" : "Invoice approved",
    });
    return res.type !== "error";
  });

  const handleRejectInvoice = useEventCallback(async (reason: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.rejectInvoice({ id: request.id, reason })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: `Failed to reject ${reviewLabel}`,
      mutation: "vendorPayment.rejectInvoice",
      successMsg: isNoInvoice ? "Reason rejected" : "Invoice rejected",
    });
    if (res.type !== "error") {
      setInvoiceRejectOpen(false);
    }
  });
  const openSubmitForm = useEventCallback(() => {
    setInvoiceFormMode("submit");
    setInvoiceFormOpen(true);
  });
  const openEditForm = useEventCallback(() => {
    setInvoiceFormMode("edit");
    setInvoiceFormOpen(true);
  });
  const stableOnClick2 = useEventCallback(() => {
    setCharges(lineChargesOf(request.lineItems));
    // Opened already when a line is charged to a provision (a re-approval).
    setProvisionOpen(hasProvisionLine);
    setInvoiceApproveOpen(true);
  });
  const stableOnClick3 = useEventCallback(() => setInvoiceRejectOpen(true));

  if (!INVOICE_STATUSES.has(status)) {
    return null;
  }

  const wasRejected =
    Boolean(request.invoiceRejectionReason) && status === "paid";
  const hasInvoiceDetails = Boolean(
    request.invoiceNumber || request.invoiceDate || request.noInvoiceReason
  );
  const showUploadButton = status === "paid" && (isOwner || canApprove);
  const showEditButton =
    (status === "invoice_pending" && isOwner) ||
    (canEditAll && hasInvoiceDetails);
  const showApproveRejectActions = canApprove && status === "invoice_pending";
  const showEmptyState =
    invoiceAttachments.length === 0 && !hasInvoiceDetails && status === "paid";
  let uploadLabel = "Add invoice or reason";
  if (wasRejected) {
    uploadLabel = isNoInvoice ? "Resubmit" : "Resubmit invoice";
  }
  const latestPaymentDate = request.transactions.reduce<number | undefined>(
    (latest, transaction) =>
      transaction.status === "approved" &&
      (latest === undefined || transaction.transactionDate > latest)
        ? transaction.transactionDate
        : latest,
    undefined
  );
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
                  {isNoInvoice ? "Approve without invoice" : "Approve invoice"}
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
                  {isNoInvoice ? "Reject reason" : "Reject invoice"}
                </Button>
              </>
            ) : null}
            {showUploadButton ? (
              <Button
                onClick={openSubmitForm}
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Upload04Icon}
                  strokeWidth={2}
                />
                {uploadLabel}
              </Button>
            ) : null}
            {showEditButton ? (
              <Button
                onClick={openEditForm}
                size="sm"
                type="button"
                variant="outline"
              >
                {isNoInvoice ? "Edit details" : "Edit invoice"}
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
        {canSeeProvision && status === "completed" ? (
          <ProvisionSplit lines={request.lineItems} split={provision?.split} />
        ) : null}
      </RecordSection>

      <InvoiceFormDialog
        defaultDocumentDate={
          latestPaymentDate === undefined
            ? undefined
            : new Date(latestPaymentDate)
        }
        initialValues={
          hasInvoiceDetails
            ? {
                attachments: mapAttachmentsToFormValues(invoiceAttachments),
                invoiceDate: epochToLocalDate(request.invoiceDate) ?? null,
                invoiceNumber: request.invoiceNumber ?? "",
                kind: isNoInvoice ? "no_invoice" : "invoice",
                noInvoiceNote: request.noInvoiceNote ?? "",
                noInvoiceReason: request.noInvoiceReason ?? null,
              }
            : undefined
        }
        mode={invoiceFormMode}
        onOpenChange={setInvoiceFormOpen}
        open={invoiceFormOpen}
        vendorPaymentId={request.id as string}
      />

      <ApproveDialog
        entityId={request.id}
        entityLabel={reviewLabel}
        hideScreenshot
        onConfirm={handleApproveInvoice}
        onOpenChange={setInvoiceApproveOpen}
        open={invoiceApproveOpen}
        summary={
          canSeeProvision && request.lineItems.length > 0 ? (
            provisionOpen ? (
              <ProvisionChargePicker
                charges={charges}
                lines={request.lineItems}
                onChange={handleChargeChange}
                outstanding={provision?.outstanding}
              />
            ) : (
              <Button
                className="h-auto px-0"
                onClick={handleOpenProvision}
                size="sm"
                type="button"
                variant="link"
              >
                Charge to a provision
              </Button>
            )
          ) : undefined
        }
      />
      <RejectDialog
        entityLabel={isNoInvoice ? "reason" : "invoice"}
        onConfirm={handleRejectInvoice}
        onOpenChange={setInvoiceRejectOpen}
        open={invoiceRejectOpen}
      />
    </>
  );
}
