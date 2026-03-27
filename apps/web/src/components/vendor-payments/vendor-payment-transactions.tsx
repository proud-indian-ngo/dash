import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";
import { RejectDialog } from "@/components/form/reject-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { LONG_DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { getStatusBadge } from "@/lib/status-badge";
import { TransactionFormDialog } from "./vendor-payment-transaction-form";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

const RECORDABLE_STATUSES = new Set<string>([
  "pending",
  "approved",
  "partially_paid",
  "paid",
]);

interface VendorPaymentTransactionsProps {
  isOwner: boolean;
  request: VendorPaymentWithRelations;
}

export function VendorPaymentTransactions({
  request,
  isOwner,
}: VendorPaymentTransactionsProps) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canApprove = hasPermission("requests.approve");
  const canRecord = hasPermission("requests.record_payment");
  const showRecordButton =
    canRecord &&
    RECORDABLE_STATUSES.has(request.status as string) &&
    (isOwner || canApprove);

  // biome-ignore lint/suspicious/noExplicitAny: Zero query result shape
  const transactions = (request.transactions ?? []) as any[];

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

  const handleApproveTransaction = async (id: string) => {
    const res = await zero.mutate(
      mutators.vendorPaymentTransaction.approve({ id })
    ).server;
    handleMutationResult(res, {
      mutation: "vendorPaymentTransaction.approve",
      entityId: id,
      successMsg: "Transaction approved",
      errorMsg: "Failed to approve transaction",
    });
  };

  const handleRejectTransaction = async (reason: string) => {
    if (!rejectingId) {
      return;
    }
    const res = await zero.mutate(
      mutators.vendorPaymentTransaction.reject({ id: rejectingId, reason })
    ).server;
    handleMutationResult(res, {
      mutation: "vendorPaymentTransaction.reject",
      entityId: rejectingId,
      successMsg: "Transaction rejected",
      errorMsg: "Failed to reject transaction",
    });
    if (res.type !== "error") {
      setRejectingId(null);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!deletingId) {
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await zero.mutate(
        mutators.vendorPaymentTransaction.delete({ id: deletingId })
      ).server;
      handleMutationResult(res, {
        mutation: "vendorPaymentTransaction.delete",
        entityId: deletingId,
        successMsg: "Transaction deleted",
        errorMsg: "Failed to delete transaction",
      });
      if (res.type !== "error") {
        setDeletingId(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!RECORDABLE_STATUSES.has(request.status as string)) {
    return null;
  }

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">Payments</h2>
          {showRecordButton ? (
            <Button
              onClick={() => setFormOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Record Payment
            </Button>
          ) : null}
        </div>

        {/* Progress summary */}
        <div className="grid grid-cols-3 gap-4 rounded-md border p-3">
          <div>
            <p className="text-muted-foreground text-xs">Total Owed</p>
            <p className="font-medium tabular-nums">{formatINR(totalOwed)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Paid</p>
            <p className="font-medium text-green-600 tabular-nums">
              {formatINR(paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Remaining</p>
            <p className="font-medium tabular-nums">
              {formatINR(Math.max(0, remaining))}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {totalOwed > 0 ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-600 transition-all duration-300"
              style={{
                width: `${Math.min(100, (paidAmount / totalOwed) * 100)}%`,
              }}
            />
          </div>
        ) : null}

        {/* Transactions table */}
        {transactions.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
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
                  const isTransactionOwner =
                    isOwner || t.userId === request.userId;
                  return (
                    <tr className="border-b last:border-0" key={t.id}>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(Number(t.amount))}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {t.description ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {t.transactionDate
                          ? format(t.transactionDate, LONG_DATE)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {t.paymentMethod ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canApprove && isPending ? (
                            <>
                              <Button
                                aria-label="Approve transaction"
                                onClick={() =>
                                  handleApproveTransaction(t.id as string)
                                }
                                size="icon"
                                title="Approve"
                                type="button"
                                variant="ghost"
                              >
                                <HugeiconsIcon
                                  className="size-4 text-green-600"
                                  icon={CheckmarkCircle01Icon}
                                  strokeWidth={2}
                                />
                              </Button>
                              <Button
                                aria-label="Reject transaction"
                                onClick={() => setRejectingId(t.id as string)}
                                size="icon"
                                title="Reject"
                                type="button"
                                variant="ghost"
                              >
                                <HugeiconsIcon
                                  className="size-4 text-destructive"
                                  icon={Cancel01Icon}
                                  strokeWidth={2}
                                />
                              </Button>
                            </>
                          ) : null}
                          {isPending && isTransactionOwner ? (
                            <Button
                              aria-label="Delete transaction"
                              onClick={() => setDeletingId(t.id as string)}
                              size="icon"
                              title="Delete"
                              type="button"
                              variant="ghost"
                            >
                              <HugeiconsIcon
                                className="size-4 text-muted-foreground"
                                icon={Delete02Icon}
                                strokeWidth={2}
                              />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground text-sm">
            No payments recorded yet.
          </p>
        )}
      </div>

      <TransactionFormDialog
        onOpenChange={setFormOpen}
        open={formOpen}
        vendorPaymentId={request.id as string}
      />

      <RejectDialog
        entityLabel="transaction"
        onConfirm={handleRejectTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingId(null);
          }
        }}
        open={rejectingId !== null}
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description="This will permanently delete this payment record. This action cannot be undone."
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={confirmDeleteTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingId(null);
          }
        }}
        open={deletingId !== null}
        title="Delete transaction?"
        variant="destructive"
      />
    </>
  );
}
