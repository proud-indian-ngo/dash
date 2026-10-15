import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Edit02Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { PAST_APPROVAL_STATUSES } from "@pi-dash/zero/vendor-payment-constants";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import capitalize from "lodash/capitalize";
import { useState } from "react";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ChargedToCard } from "@/components/expenses/charged-to-card";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import {
  AttachmentList,
  HistoryCard,
  RecordDetailLayout,
  RecordSection,
  RejectionNote,
} from "@/components/shared/record-detail";
import { RequesterMeta } from "@/components/shared/requester-meta";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { handleMutationResult } from "@/lib/mutation-result";
import {
  requestChargeSummary,
  requestProgrammeHeader,
} from "@/lib/request-programme";
import { sumAmounts } from "@/lib/stats";
import { getStatusBadge } from "@/lib/status-badge";

import { VendorDetailCards } from "./vendor-details-card";
import { VendorPaymentInvoiceSection } from "./vendor-payment-invoice-section";
import { VendorPaymentTransactions } from "./vendor-payment-transactions";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

interface VendorPaymentDetailProps {
  canApprove: boolean;
  canUpdateAnyStatus?: boolean;
  isOwner: boolean;
  /** Opens the edit form; omitted when the viewer can't edit. */
  onEdit?: () => void;
  request: VendorPaymentWithRelations;
}

function VendorPaymentLineItemsTable({
  lineItems,
  total,
}: {
  lineItems: NonNullable<VendorPaymentWithRelations["lineItems"]>;
  total: number;
}) {
  return (
    <RecordSection title="Line items">
      {lineItems.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground border-b text-xs">
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(
                (item: {
                  id: string;
                  amountPaise: number;
                  description?: string | null;
                  category?: { name: string } | undefined;
                }) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="px-3 py-2">{item.category?.name}</td>
                    <td className="text-muted-foreground px-3 py-2">
                      {item.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPaise(item.amountPaise)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 border-t">
                <td className="px-3 py-2 font-medium" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatPaise(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
          No line items.
        </p>
      )}
    </RecordSection>
  );
}

function VendorPaymentHeader({
  label,
  onApprove,
  onEdit,
  onReject,
  onReset,
  request,
  showApproveAction,
  showRejectAction,
  showResetAction,
  tone,
}: {
  label: string;
  onApprove: () => void;
  onEdit?: () => void;
  onReject: () => void;
  onReset: () => void;
  request: VendorPaymentWithRelations;
  showApproveAction: boolean;
  showRejectAction: boolean;
  showResetAction: boolean;
  tone: StatusTone;
}) {
  return (
    <PageHeader
      actions={
        <>
          {showApproveAction ? (
            <Button
              onClick={onApprove}
              type="button"
              // Past "pending" this is an admin status override; the step
              // actually waiting (an invoice, a payment) carries the primary.
              variant={request.status === "pending" ? "default" : "outline"}
            >
              <HugeiconsIcon
                className="size-4"
                icon={CheckmarkCircle01Icon}
                strokeWidth={2}
              />
              Approve
            </Button>
          ) : null}
          {showRejectAction ? (
            <Button onClick={onReject} type="button" variant="outline">
              <HugeiconsIcon
                className="size-4"
                icon={Cancel01Icon}
                strokeWidth={2}
              />
              Reject
            </Button>
          ) : null}
          {onEdit ? (
            <Button onClick={onEdit} type="button" variant="outline">
              <HugeiconsIcon
                className="size-4"
                icon={Edit02Icon}
                strokeWidth={2}
              />
              Edit
            </Button>
          ) : null}
          <PageHeaderMenu
            actions={[
              showResetAction && {
                id: "reset",
                icon: RepeatIcon,
                label: "Reset to pending",
                onSelect: onReset,
              },
            ]}
            title={request.title}
          />
        </>
      }
      badge={<StatusBadge tone={tone}>{label}</StatusBadge>}
      meta={[
        request.user ? (
          <RequesterMeta key="requester" user={request.user} />
        ) : null,
        request.vendor ? request.vendor.name : null,
        request.city ? capitalize(request.city) : null,
        request.event ? (
          <Link
            className="text-primary font-medium underline-offset-2 hover:underline"
            key="event"
            params={{ id: request.event.id }}
            to="/events/$id"
          >
            {request.event.name}
          </Link>
        ) : null,
        requestProgrammeHeader(request) ? (
          <span key="programme">{requestProgrammeHeader(request)}</span>
        ) : null,
      ]}
      title={request.title}
    />
  );
}

export function VendorPaymentDetail({
  canApprove,
  canUpdateAnyStatus = false,
  isOwner,
  onEdit,
  request,
}: VendorPaymentDetailProps) {
  const zero = useZero();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const status = request.status as string;
  const { label, tone } = getStatusBadge(request.status);
  const canResetToPending =
    status !== "pending" &&
    // Rejected payments stay as history and do not block a reset.
    request.transactions.every((t) => t.status === "rejected") &&
    !(request.invoiceNumber || request.invoiceDate || request.noInvoiceReason);
  const showApproveAction = canApprove && status === "pending";
  // A request paid before approval was required can only be approved.
  const showRejectAction =
    showApproveAction &&
    !request.transactions.some((t) => t.status === "approved");
  const showResetAction = canApprove && canUpdateAnyStatus && canResetToPending;

  const total = sumAmounts(request.lineItems);

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
    return res.type !== "error";
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
          onApprove={stableOnApprove0}
          onEdit={onEdit}
          onReject={stableOnReject1}
          onReset={handleResetToPending}
          request={request}
          showApproveAction={showApproveAction}
          showRejectAction={showRejectAction}
          showResetAction={showResetAction}
          tone={tone}
        />

        <RecordDetailLayout
          aside={
            <>
              <ChargedToCard kind="vendorPayment" request={request} />
              <VendorDetailCards
                ownsApprovedPayment={
                  isOwner && PAST_APPROVAL_STATUSES.has(request.status ?? "")
                }
                vendor={request.vendor}
              />
              <HistoryCard entries={request.history} />
            </>
          }
        >
          {request.status === "rejected" && request.rejectionReason ? (
            <RejectionNote reason={request.rejectionReason} />
          ) : null}

          <VendorPaymentLineItemsTable
            lineItems={request.lineItems}
            total={total}
          />

          {quotationAttachments.length > 0 ? (
            <RecordSection title="Quotation and supporting documents">
              <AttachmentList
                attachments={quotationAttachments}
                kind="vendorPaymentAttachment"
              />
            </RecordSection>
          ) : null}

          <VendorPaymentTransactions isOwner={isOwner} request={request} />

          <VendorPaymentInvoiceSection
            canApprove={canApprove}
            invoiceAttachments={invoiceAttachments}
            isOwner={isOwner}
            request={request}
            status={status}
          />
        </RecordDetailLayout>

        <ApproveDialog
          entityId={request.id}
          entityLabel="vendor payment"
          hideScreenshot
          onConfirm={handleApprove}
          onOpenChange={setApproveOpen}
          open={approveOpen}
          summary={<>Charged to: {requestChargeSummary(request)}</>}
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
