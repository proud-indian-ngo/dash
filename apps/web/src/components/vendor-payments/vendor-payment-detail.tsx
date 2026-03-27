import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { HistoryEntry } from "@/components/requests/request-history-entry";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { LONG_DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { getStatusBadge } from "@/lib/status-badge";
import { VendorBankCard, VendorDetailsCard } from "./vendor-details-card";
import { VendorPaymentTransactions } from "./vendor-payment-transactions";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

interface VendorPaymentDetailProps {
  canApprove: boolean;
  isOwner: boolean;
  request: VendorPaymentWithRelations;
}

export function VendorPaymentDetail({
  canApprove,
  isOwner,
  request,
}: VendorPaymentDetailProps) {
  const zero = useZero();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const { label, variant } = getStatusBadge(request.status);

  const total = (request.lineItems ?? []).reduce(
    (sum: number, item: { amount: number | string }) =>
      sum + Number(item.amount),
    0
  );

  const handleApprove = async (message: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.approve({
        id: request.id,
        note: message || undefined,
      })
    ).server;
    handleMutationResult(res, {
      mutation: "vendorPayment.approve",
      entityId: request.id,
      successMsg: "Vendor payment approved",
      errorMsg: "Failed to approve vendor payment",
    });
    if (res.type !== "error") {
      setApproveOpen(false);
    }
  };

  const handleReject = async (reason: string) => {
    const res = await zero.mutate(
      mutators.vendorPayment.reject({ id: request.id, reason })
    ).server;
    handleMutationResult(res, {
      mutation: "vendorPayment.reject",
      entityId: request.id,
      successMsg: "Vendor payment rejected",
      errorMsg: "Failed to reject vendor payment",
    });
    if (res.type !== "error") {
      setRejectOpen(false);
    }
  };

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-semibold text-2xl tracking-tight">
              {request.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
              {request.vendor ? (
                <span>Vendor: {request.vendor.name}</span>
              ) : null}
              {request.invoiceNumber ? (
                <span>Invoice: {request.invoiceNumber}</span>
              ) : null}
              {request.invoiceDate ? (
                <span>{format(request.invoiceDate, LONG_DATE)}</span>
              ) : null}
            </div>
            {request.user ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Requested by
                </span>
                <UserAvatar
                  className="size-6"
                  fallbackClassName="text-xs"
                  user={request.user}
                />
                <span className="font-medium text-sm">{request.user.name}</span>
              </div>
            ) : null}
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>

        {/* Vendor details */}
        <VendorDetailsCard vendor={request.vendor} />

        {/* Bank account details */}
        <VendorBankCard vendor={request.vendor} />

        {/* Admin actions */}
        {canApprove && request.status === "pending" ? (
          <>
            <div className="fade-in-0 flex animate-in gap-2 duration-150 ease-(--ease-out-expo)">
              <Button
                onClick={() => setApproveOpen(true)}
                type="button"
                variant="default"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={CheckmarkCircle01Icon}
                  strokeWidth={2}
                />
                Approve
              </Button>
              <Button
                onClick={() => setRejectOpen(true)}
                type="button"
                variant="destructive"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Cancel01Icon}
                  strokeWidth={2}
                />
                Reject
              </Button>
            </div>
            <Separator />
          </>
        ) : null}

        {/* Rejection reason */}
        {request.status === "rejected" && request.rejectionReason ? (
          <div className="fade-in-0 animate-in rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm duration-150 ease-(--ease-out-expo)">
            <span className="font-medium">Rejection reason: </span>
            {request.rejectionReason}
          </div>
        ) : null}

        {/* Line items */}
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">Line items</h2>
          {(request.lineItems ?? []).length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Description
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(request.lineItems ?? []).map(
                    (item: {
                      id: string;
                      amount: number | string;
                      description?: string | null;
                      category?: { name: string } | undefined;
                    }) => (
                      <tr className="border-b last:border-0" key={item.id}>
                        <td className="px-3 py-2">
                          {item.category?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.description ?? "—"}
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

        {/* Attachments */}
        {(request.attachments ?? []).length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-medium text-sm">Attachments</h2>
            <div className="flex flex-col gap-1.5">
              {(request.attachments ?? []).map(
                (att: {
                  id: string;
                  type: "file" | "url";
                  filename?: string | null;
                  objectKey?: string | null;
                  url?: string | null;
                  mimeType?: string | null;
                }) => (
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
                )
              )}
            </div>
          </div>
        ) : null}

        {/* Transactions */}
        <VendorPaymentTransactions isOwner={isOwner} request={request} />

        {/* History */}
        {(request.history ?? []).length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">History</h2>
              <div className="flex flex-col">
                {/* biome-ignore lint/suspicious/noExplicitAny: VP history entries from Zero */}
                {(request.history ?? []).map((entry: any) => (
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
