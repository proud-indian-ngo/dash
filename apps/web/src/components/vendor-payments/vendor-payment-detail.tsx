import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import capitalize from "lodash/capitalize";
import { useState } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { HistoryEntry } from "@/components/reimbursements/reimbursement-history-entry";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { formatINR } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { getStatusBadge } from "@/lib/status-badge";
import { VendorBankCard, VendorDetailsCard } from "./vendor-details-card";
import { VendorPaymentInvoiceSection } from "./vendor-payment-invoice-section";
import { VendorPaymentTransactions } from "./vendor-payment-transactions";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

interface VendorPaymentDetailProps {
  canApprove: boolean;
  canUpdateAnyStatus?: boolean;
  isOwner: boolean;
  request: VendorPaymentWithRelations;
}

function VendorPaymentStatusActions({
  onApprove,
  onReject,
  onReset,
  showApproveAction,
  showRejectAction,
  showResetAction,
}: {
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  showApproveAction: boolean;
  showRejectAction: boolean;
  showResetAction: boolean;
}) {
  return (
    <>
      <div className="fade-in-0 flex animate-in gap-2 duration-150 ease-(--ease-out-expo)">
        {showApproveAction ? (
          <Button onClick={onApprove} type="button" variant="default">
            <HugeiconsIcon
              className="size-4"
              icon={CheckmarkCircle01Icon}
              strokeWidth={2}
            />
            Approve
          </Button>
        ) : null}
        {showRejectAction ? (
          <Button onClick={onReject} type="button" variant="destructive">
            <HugeiconsIcon
              className="size-4"
              icon={Cancel01Icon}
              strokeWidth={2}
            />
            Reject
          </Button>
        ) : null}
        {showResetAction ? (
          <Button onClick={onReset} type="button" variant="outline">
            <HugeiconsIcon
              className="size-4"
              icon={RepeatIcon}
              strokeWidth={2}
            />
            Reset to pending
          </Button>
        ) : null}
      </div>
      <Separator />
    </>
  );
}

function VendorPaymentLineItemsTable({
  lineItems,
  total,
}: {
  lineItems: NonNullable<VendorPaymentWithRelations["lineItems"]>;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium text-sm">Line items</h2>
      {lineItems.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(
                (item: {
                  id: string;
                  amount: number | string;
                  description?: string | null;
                  category?: { name: string } | undefined;
                }) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="px-3 py-2">{item.category?.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatINR(Number(item.amount))}
                    </td>
                  </tr>
                )
              )}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td className="px-3 py-2 font-medium" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatINR(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-center text-muted-foreground text-sm">
          No line items.
        </p>
      )}
    </div>
  );
}

interface QuotationAttachment {
  filename?: string | null;
  id: string;
  mimeType?: string | null;
  objectKey?: string | null;
  type: "file" | "url";
  url?: string | null;
}

function QuotationAttachmentList({
  attachments,
}: {
  attachments: QuotationAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium text-sm">Quotation / Supporting Documents</h2>
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
                    href={getAttachmentDownloadHref(att, {
                      id: att.id,
                      kind: "vendorPaymentAttachment",
                    })}
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
    </div>
  );
}

function VendorPaymentHeader({
  label,
  request,
  variant,
}: {
  label: string;
  request: VendorPaymentWithRelations;
  variant: React.ComponentProps<typeof Badge>["variant"];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          {request.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
          {request.vendor ? <span>Vendor: {request.vendor.name}</span> : null}
          {request.city ? <span>City: {capitalize(request.city)}</span> : null}
          {request.event ? (
            <span>
              Event:{" "}
              <Link
                className="font-medium text-primary underline-offset-2 hover:underline"
                params={{ id: request.event.id }}
                to="/events/$id"
              >
                {request.event.name}
              </Link>
            </span>
          ) : null}
        </div>
        {request.user ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Requested by</span>
            <UserHoverCard user={request.user}>
              <div className="flex items-center gap-2">
                <UserAvatar
                  className="size-6"
                  fallbackClassName="text-xs"
                  user={request.user}
                />
                <span className="font-medium text-sm">{request.user.name}</span>
              </div>
            </UserHoverCard>
          </div>
        ) : null}
      </div>
      <Badge variant={variant}>{label}</Badge>
    </div>
  );
}

export function VendorPaymentDetail({
  canApprove,
  canUpdateAnyStatus = false,
  isOwner,
  request,
}: VendorPaymentDetailProps) {
  const zero = useZero();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const status = request.status as string;
  const { label, variant } = getStatusBadge(request.status);
  const canResetToPending =
    status !== "pending" &&
    request.transactions.length === 0 &&
    !(request.invoiceNumber || request.invoiceDate);
  const showAdminActions =
    canApprove && (status === "pending" || canUpdateAnyStatus);
  const showApproveAction = showAdminActions && status !== "approved";
  const showRejectAction = showAdminActions && status !== "rejected";
  const showResetAction = showAdminActions && canResetToPending;

  const total = request.lineItems.reduce(
    (sum: number, item: { amount: number | string }) =>
      sum + Number(item.amount),
    0
  );

  const handleApprove = useEventCallback(async (message: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.approve({
        id: request.id,
        note: message || undefined,
      })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: "Couldn't approve vendor payment",
      mutation: "vendorPayment.approve",
      successMsg: "Vendor payment approved",
    });
    if (res.type !== "error") {
      setApproveOpen(false);
    }
  });

  const handleReject = useEventCallback(async (reason: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.reject({ id: request.id, reason })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: "Couldn't reject vendor payment",
      mutation: "vendorPayment.reject",
      successMsg: "Vendor payment rejected",
    });
    if (res.type !== "error") {
      setRejectOpen(false);
    }
  });

  const handleResetToPending = useEventCallback(async () => {
    const res = await zero.mutate(
      mutators.vendorPayment.resetToPending({ id: request.id })
    ).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: "Couldn't reset vendor payment to pending",
      mutation: "vendorPayment.resetToPending",
      successMsg: "Vendor payment reset to pending",
    });
  });

  const invoiceAttachments = request.attachments.filter(
    (att) => att.purpose === "invoice"
  );
  const quotationAttachments = request.attachments.filter(
    (att) => att.purpose !== "invoice"
  );
  const stableOnApprove0 = useEventCallback(() => setApproveOpen(true));
  const stableOnReject1 = useEventCallback(() => setRejectOpen(true));

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        <VendorPaymentHeader
          label={label}
          request={request}
          variant={variant}
        />

        {/* Vendor details */}
        <VendorDetailsCard vendor={request.vendor} />

        {/* Bank account details */}
        <VendorBankCard vendor={request.vendor} />

        {/* Admin actions */}
        {showAdminActions ? (
          <VendorPaymentStatusActions
            onApprove={stableOnApprove0}
            onReject={stableOnReject1}
            onReset={handleResetToPending}
            showApproveAction={showApproveAction}
            showRejectAction={showRejectAction}
            showResetAction={showResetAction}
          />
        ) : null}

        {/* Rejection reason */}
        {request.status === "rejected" && request.rejectionReason ? (
          <div className="fade-in-0 animate-in rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm duration-150 ease-(--ease-out-expo)">
            <span className="font-medium">Rejection reason: </span>
            {request.rejectionReason}
          </div>
        ) : null}

        <VendorPaymentLineItemsTable
          lineItems={request.lineItems}
          total={total}
        />

        <QuotationAttachmentList attachments={quotationAttachments} />

        {/* Transactions */}
        <VendorPaymentTransactions isOwner={isOwner} request={request} />

        {/* Invoice section */}
        <VendorPaymentInvoiceSection
          canApprove={canApprove}
          invoiceAttachments={invoiceAttachments}
          isOwner={isOwner}
          request={request}
          status={status}
        />

        {/* History */}
        {request.history.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">History</h2>
              <div className="flex flex-col">
                {request.history.map((entry) => (
                  <HistoryEntry entry={entry} key={entry.id} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        <ApproveDialog
          entityId={request.id}
          entityLabel="vendor payment"
          hideScreenshot
          onConfirm={handleApprove}
          onOpenChange={setApproveOpen}
          open={approveOpen}
        />
        <RejectDialog
          entityLabel="vendor payment"
          onConfirm={handleReject}
          onOpenChange={setRejectOpen}
          open={rejectOpen}
        />
      </div>
    </AppErrorBoundary>
  );
}
