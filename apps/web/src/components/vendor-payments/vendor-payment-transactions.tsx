import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise, sumPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import {
  INVOICE_LOCKED_STATUSES,
  PAYABLE_STATUSES,
} from "@pi-dash/zero/vendor-payment-constants";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";

import { RejectDialog } from "@/components/form/reject-dialog";
import { VoidDialog } from "@/components/form/void-dialog";
import { PaidFromBank } from "@/components/income/bank/in-bank-fact";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RecordSection } from "@/components/shared/record-detail";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { isVoided, VoidBadge } from "@/components/shared/void";
import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { getStatusBadge } from "@/lib/status-badge";
import { mapTransactionToFormValues } from "@/lib/submission-mappers";

import { getTransactionActions } from "./vendor-payment-transaction-actions";
import { TransactionFormDialog } from "./vendor-payment-transaction-form";
import type {
  VendorPaymentTransactionWithRelations,
  VendorPaymentWithRelations,
} from "./vendor-payment-types";

interface VendorPaymentTransactionsProps {
  isOwner: boolean;
  /** Payments standing in the books: Void replaces Delete on them. */
  postedIds: ReadonlySet<string>;
  request: VendorPaymentWithRelations;
}

export function VendorPaymentTransactions({
  request,
  isOwner,
  postedIds,
}: VendorPaymentTransactionsProps) {
  const zero = useZero();
  const { hasPermission, user } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const requestVoided = isVoided(request);
  const canVoid = hasPermission("requests.void");
  const [editingTransaction, setEditingTransaction] =
    useState<VendorPaymentTransactionWithRelations | null>(null);

  const canApprove = hasPermission("requests.approve");
  const canRecord = hasPermission("requests.record_payment");
  const isInvoiceLocked = INVOICE_LOCKED_STATUSES.has(request.status as string);
  const canEditAll = hasPermission("requests.edit_all") && !isInvoiceLocked;
  const canDeleteAll = hasPermission("requests.delete_all") && !isInvoiceLocked;
  const canDeleteOwn = hasPermission("requests.delete_own");
  const isAwaitingApproval = request.status === "pending";
  const showRecordButton =
    !requestVoided &&
    canRecord &&
    PAYABLE_STATUSES.has(request.status as string) &&
    (isOwner || canApprove);

  const transactions = request.transactions ?? [];
  // Payments are reviewed only once the request itself is approved.
  const canReviewPayments = canApprove && !isAwaitingApproval;
  const hasPendingPayments = transactions.some((t) => t.status === "pending");

  const totalOwed = sumPaise(
    (request.lineItems ?? []).map((li) => li.amountPaise)
  );
  // A voided payment no longer counts as paid.
  const paidAmount = sumPaise(
    transactions
      .filter((t) => t.status === "approved" && !isVoided(t))
      .map((t) => t.amountPaise)
  );
  const remaining = totalOwed - paidAmount;

  // Sum of all non-rejected transactions (approved + pending) for cap enforcement
  const recordableTotal = sumPaise(
    transactions
      .filter((t) => t.status !== "rejected" && !isVoided(t))
      .map((t) => t.amountPaise)
  );
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
  const handleVoidTransaction = useEventCallback(async (reason: string) => {
    if (!voidingId) {
      return;
    }
    setVoidLoading(true);
    try {
      const res = await zero.mutate(
        mutators.vendorPaymentTransaction.void({ id: voidingId, reason })
      ).server;
      handleMutationResult(res, {
        entityId: voidingId,
        errorMsg: getMutationResultErrorMessage(
          res.type === "error" ? res.error : undefined,
          "Couldn't void the payment"
        ),
        mutation: "vendorPaymentTransaction.void",
        successMsg: "Payment voided",
      });
      if (res.type !== "error") {
        setVoidingId(null);
      }
    } finally {
      setVoidLoading(false);
    }
  });
  const handleVoidOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setVoidingId(null);
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

  if (!(isAwaitingApproval || PAYABLE_STATUSES.has(request.status as string))) {
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
                {formatPaise(paidAmount)}
              </span>{" "}
              <span className="text-muted-foreground">
                paid of {formatPaise(totalOwed)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {formatPaise(Math.max(0, remaining))} remaining
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
                  const voided = requestVoided || isVoided(t);
                  const posted = postedIds.has(t.id);
                  const isPending = t.status === "pending" && !voided;
                  const { canEdit, canDelete } = getTransactionActions({
                    canDeleteAll,
                    canDeleteOwn,
                    canEditAll,
                    isInvoiceLocked,
                    isPending,
                    isPosted: posted,
                    isRecorder: t.userId === user.id,
                    isVoided: voided,
                  });
                  return (
                    <TransactionRow
                      badge={badge}
                      canApprove={canReviewPayments}
                      canDeleteTxn={canDelete}
                      canEditTxn={canEdit}
                      canVoidTxn={canVoid && posted && !voided}
                      isPending={isPending}
                      isVoided={voided}
                      key={t.id}
                      onApprove={handleApproveTransaction}
                      onDelete={setDeletingId}
                      onEdit={setEditingTransaction}
                      onReject={setRejectingId}
                      onVoid={setVoidingId}
                      transaction={t}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
            {isAwaitingApproval
              ? "Payments can be recorded after this request is approved."
              : "No payments recorded yet."}
          </p>
        )}
        {isAwaitingApproval && hasPendingPayments ? (
          <p className="text-muted-foreground text-sm">
            Approve the request to review its payments.
          </p>
        ) : null}
      </RecordSection>

      <TransactionFormDialog
        canApprove={canApprove}
        onOpenChange={stableFormOpenChange}
        open={formOpen}
        remainingPaise={remainingForCreate}
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
        remainingPaise={
          editingTransaction && editingTransaction.status !== "rejected"
            ? Math.max(
                0,
                totalOwed - recordableTotal + editingTransaction.amountPaise
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

      <VoidDialog
        entityLabel="payment"
        loading={voidLoading}
        onConfirm={handleVoidTransaction}
        onOpenChange={handleVoidOpenChange}
        open={voidingId !== null}
      />
    </>
  );
}

function TransactionRow({
  badge,
  canApprove,
  canDeleteTxn,
  canEditTxn,
  canVoidTxn,
  isPending,
  isVoided: voided,
  onApprove,
  onDelete,
  onEdit,
  onReject,
  onVoid,
  transaction,
}: {
  badge: { label: string; tone: StatusTone };
  canApprove: boolean;
  canDeleteTxn: boolean;
  canEditTxn: boolean;
  canVoidTxn: boolean;
  isPending: boolean;
  isVoided: boolean;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (transaction: VendorPaymentTransactionWithRelations) => void;
  onReject: (id: string) => void;
  onVoid: (id: string) => void;
  transaction: VendorPaymentTransactionWithRelations;
}) {
  const handleApprove = useEventCallback(() => onApprove(transaction.id));
  const handleReject = useEventCallback(() => onReject(transaction.id));
  const handleEdit = useEventCallback(() => onEdit(transaction));
  const handleDelete = useEventCallback(() => onDelete(transaction.id));
  const handleVoid = useEventCallback(() => onVoid(transaction.id));

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-right tabular-nums">
        {formatPaise(transaction.amountPaise)}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {transaction.description ?? "—"}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {transaction.transactionDate
          ? format(transaction.transactionDate, DATE)
          : "—"}
        {transaction.status === "approved" && !voided ? (
          <PaidFromBank
            amountPaise={transaction.amountPaise}
            documentId={transaction.id}
            kind="vendor_payment_transaction"
          />
        ) : null}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {transaction.paymentMethod ?? "—"}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {voided ? <VoidBadge /> : null}
        </span>
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
          {canVoidTxn ? (
            <Button
              aria-label="Void payment"
              onClick={handleVoid}
              size="icon"
              title="Void"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                className="text-destructive size-4"
                icon={UnavailableIcon}
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
