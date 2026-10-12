import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import {
  INVOICE_LOCKED_STATUSES,
  RECORDABLE_STATUSES,
} from "@pi-dash/zero/vendor-payment-constants";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";

import { RejectDialog } from "@/components/form/reject-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RecordSection } from "@/components/shared/record-detail";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { getStatusBadge } from "@/lib/status-badge";
import { mapTransactionToFormValues } from "@/lib/submission-mappers";

import { TransactionFormDialog } from "./vendor-payment-transaction-form";
import type {
  VendorPaymentTransactionWithRelations,
  VendorPaymentWithRelations,
} from "./vendor-payment-types";

interface VendorPaymentTransactionsProps {
  isOwner: boolean;
  request: VendorPaymentWithRelations;
}

export function VendorPaymentTransactions({
  request,
  isOwner,
}: VendorPaymentTransactionsProps) {
  const zero = useZero();
  const { hasPermission, user } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<VendorPaymentTransactionWithRelations | null>(null);

  const canApprove = hasPermission("requests.approve");
  const canRecord = hasPermission("requests.record_payment");
  const isInvoiceLocked = INVOICE_LOCKED_STATUSES.has(request.status as string);
  const canEditAll = hasPermission("requests.edit_all") && !isInvoiceLocked;
  const canDeleteAll = hasPermission("requests.delete_all") && !isInvoiceLocked;
  const showRecordButton =
    canRecord &&
    RECORDABLE_STATUSES.has(request.status as string) &&
    (isOwner || canApprove);

  const transactions = request.transactions ?? [];

  const totalOwed = (request.lineItems ?? []).reduce(
    (sum: number, li: { amount: number | string }) => sum + Number(li.amount),
    0
  );
  const paidAmount = transactions
    .filter((t) => t.status === "approved")
    .reduce(
      (sum: number, t: { amount: number | string }) => sum + Number(t.amount),
      0
    );
  const remaining = totalOwed - paidAmount;

  // Sum of all non-rejected transactions (approved + pending) for cap enforcement
  const recordableTotal = transactions
    .filter((t) => t.status !== "rejected")
    .reduce((sum: number, t) => sum + Number(t.amount), 0);
  const remainingForCreate = Math.max(0, totalOwed - recordableTotal);

  const handleApproveTransaction = useEventCallback(async (id: string) => {
    const res = await zero.mutate(
      mutators.vendorPaymentTransaction.approve({ id })
    ).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't approve transaction",
      mutation: "vendorPaymentTransaction.approve",
      successMsg: "Transaction approved",
    });
  });

  const handleRejectTransaction = useEventCallback(async (reason: string) => {
    if (!rejectingId) {
      return;
    }
    const res = await zero.mutate(
      mutators.vendorPaymentTransaction.reject({ id: rejectingId, reason })
    ).server;
    handleMutationResult(res, {
      entityId: rejectingId,
      errorMsg: "Couldn't reject transaction",
      mutation: "vendorPaymentTransaction.reject",
      successMsg: "Transaction rejected",
    });
    if (res.type !== "error") {
      setRejectingId(null);
    }
  });

  const confirmDeleteTransaction = useEventCallback(async () => {
    if (!deletingId) {
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await zero.mutate(
        mutators.vendorPaymentTransaction.delete({ id: deletingId })
      ).server;
      handleMutationResult(res, {
        entityId: deletingId,
        errorMsg: "Couldn't delete transaction",
        mutation: "vendorPaymentTransaction.delete",
        successMsg: "Transaction deleted",
      });
      if (res.type !== "error") {
        setDeletingId(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  });
  const stableOnClick0 = useEventCallback(() => setFormOpen(true));
  const stableFormOpenChange = useEventCallback((open: boolean) =>
    setFormOpen(open)
  );
  const stableOnOpenChange1 = useEventCallback((open: boolean) => {
    if (!open) {
      setEditingTransaction(null);
    }
  });
  const stableOnOpenChange2 = useEventCallback((open: boolean) => {
    if (!open) {
      setRejectingId(null);
    }
  });
  const stableOnOpenChange3 = useEventCallback((open: boolean) => {
    if (!open) {
      setDeletingId(null);
    }
  });

  if (!RECORDABLE_STATUSES.has(request.status as string)) {
    return null;
  }

  return (
    <>
      <RecordSection
        action={
          showRecordButton ? (
            <Button
              onClick={stableOnClick0}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              {canApprove ? "Record payment" : "Request payment"}
            </Button>
          ) : null
        }
        title="Payments"
      >
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
            <span>
              <span className="text-success-foreground font-medium">
                {formatINR(paidAmount)}
              </span>{" "}
              <span className="text-muted-foreground">
                paid of {formatINR(totalOwed)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {formatINR(Math.max(0, remaining))} remaining
            </span>
          </p>
          {totalOwed > 0 ? (
            <div
              aria-label="Paid so far"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(
                Math.min(100, (paidAmount / totalOwed) * 100)
              )}
              className="bg-muted h-1.5 overflow-hidden rounded-full"
              role="progressbar"
            >
              <div
                className="bg-success h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, (paidAmount / totalOwed) * 100)}%`,
                }}
              />
            </div>
          ) : null}
        </div>

        {/* Transactions table */}
        {transactions.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground border-b text-xs">
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Method</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const badge = getStatusBadge(t.status);
                  const isPending = t.status === "pending";
                  const isTransactionOwner = isOwner || t.userId === user.id;
                  const ownerCanModify =
                    isPending && isTransactionOwner && !isInvoiceLocked;
                  const canEditTxn = ownerCanModify || canEditAll;
                  const canDeleteTxn = ownerCanModify || canDeleteAll;
                  return (
                    <TransactionRow
                      badge={badge}
                      canApprove={canApprove}
                      canDeleteTxn={canDeleteTxn}
                      canEditTxn={canEditTxn}
                      isPending={isPending}
                      key={t.id}
                      onApprove={handleApproveTransaction}
                      onDelete={setDeletingId}
                      onEdit={setEditingTransaction}
                      onReject={setRejectingId}
                      transaction={t}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
            No payments recorded yet.
          </p>
        )}
      </RecordSection>

      <TransactionFormDialog
        canApprove={canApprove}
        onOpenChange={stableFormOpenChange}
        open={formOpen}
        remainingAmount={remainingForCreate}
        vendorPaymentId={request.id as string}
      />

      <TransactionFormDialog
        canApprove={canApprove}
        initialValues={
          editingTransaction
            ? mapTransactionToFormValues(editingTransaction)
            : undefined
        }
        key={editingTransaction?.id}
        mode="edit"
        onOpenChange={stableOnOpenChange1}
        open={editingTransaction !== null}
        remainingAmount={
          editingTransaction && editingTransaction.status !== "rejected"
            ? Math.max(
                0,
                totalOwed - recordableTotal + Number(editingTransaction.amount)
              )
            : undefined
        }
        transactionId={editingTransaction?.id}
        vendorPaymentId={request.id as string}
      />

      <RejectDialog
        entityLabel="transaction"
        onConfirm={handleRejectTransaction}
        onOpenChange={stableOnOpenChange2}
        open={rejectingId !== null}
      />

      <ConfirmDialog
        confirmLabel="Delete transaction"
        description="This will permanently delete this payment record. This action cannot be undone."
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={confirmDeleteTransaction}
        onOpenChange={stableOnOpenChange3}
        open={deletingId !== null}
        title="Delete transaction?"
        variant="destructive"
      />
    </>
  );
}

function TransactionRow({
  badge,
  canApprove,
  canDeleteTxn,
  canEditTxn,
  isPending,
  onApprove,
  onDelete,
  onEdit,
  onReject,
  transaction,
}: {
  badge: { label: string; tone: StatusTone };
  canApprove: boolean;
  canDeleteTxn: boolean;
  canEditTxn: boolean;
  isPending: boolean;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (transaction: VendorPaymentTransactionWithRelations) => void;
  onReject: (id: string) => void;
  transaction: VendorPaymentTransactionWithRelations;
}) {
  const handleApprove = useEventCallback(() => onApprove(transaction.id));
  const handleReject = useEventCallback(() => onReject(transaction.id));
  const handleEdit = useEventCallback(() => onEdit(transaction));
  const handleDelete = useEventCallback(() => onDelete(transaction.id));

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-right tabular-nums">
        {formatINR(Number(transaction.amount))}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {transaction.description ?? "—"}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {transaction.transactionDate
          ? format(transaction.transactionDate, DATE)
          : "—"}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {transaction.paymentMethod ?? "—"}
      </td>
      <td className="px-3 py-2">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {canApprove && isPending ? (
            <>
              <Button
                aria-label="Approve transaction"
                onClick={handleApprove}
                size="icon"
                title="Approve"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="text-success-foreground size-4"
                  icon={CheckmarkCircle01Icon}
                  strokeWidth={2}
                />
              </Button>
              <Button
                aria-label="Reject transaction"
                onClick={handleReject}
                size="icon"
                title="Reject"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="text-destructive size-4"
                  icon={Cancel01Icon}
                  strokeWidth={2}
                />
              </Button>
            </>
          ) : null}
          {canEditTxn ? (
            <Button
              aria-label="Edit transaction"
              onClick={handleEdit}
              size="icon"
              title="Edit"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                className="text-muted-foreground size-4"
                icon={PencilEdit01Icon}
                strokeWidth={2}
              />
            </Button>
          ) : null}
          {canDeleteTxn ? (
            <Button
              aria-label="Delete transaction"
              onClick={handleDelete}
              size="icon"
              title="Delete"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                className="text-muted-foreground size-4"
                icon={Delete02Icon}
                strokeWidth={2}
              />
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
