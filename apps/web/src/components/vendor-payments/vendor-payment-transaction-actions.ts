interface TransactionActionInput {
  canDeleteAll: boolean;
  canDeleteOwn: boolean;
  canEditAll: boolean;
  isInvoiceLocked: boolean;
  isPending: boolean;
  isPosted: boolean;
  isRecorder: boolean;
  isVoided: boolean;
}

/**
 * Mirrors the `vendorPaymentTransaction.update` and `.delete` mutators: only
 * whoever recorded a payment edits or deletes it while it is pending, unless
 * they hold `requests.edit_all` / `requests.delete_all`. The vendor payment's
 * owner gets no extra rights over a payment someone else recorded.
 */
export function getTransactionActions({
  canDeleteAll,
  canDeleteOwn,
  canEditAll,
  isInvoiceLocked,
  isPending,
  isPosted,
  isRecorder,
  isVoided,
}: TransactionActionInput) {
  const recorderCanModify = isPending && isRecorder && !isInvoiceLocked;
  return {
    canEdit: !isVoided && (recorderCanModify || canEditAll),
    // In the books or voided: kept as the record, so voided instead of deleted.
    canDelete:
      !(isVoided || isPosted) &&
      ((recorderCanModify && canDeleteOwn) || canDeleteAll),
  };
}
