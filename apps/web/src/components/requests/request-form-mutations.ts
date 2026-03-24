import { mutators } from "@pi-dash/zero/mutators";
import type { BankAccount } from "@pi-dash/zero/schema";
import type { useZero } from "@rocicorp/zero/react";
import type { RequestFormValues } from "./form/request-form.schema";

export function buildMutation(
  zero: ReturnType<typeof useZero>,
  value: RequestFormValues,
  entityId: string,
  existingId: string | undefined,
  bankAccountList: BankAccount[]
) {
  const lineItems = value.lineItems.map((item, index) => ({
    ...item,
    amount: Number(item.amount),
    sortOrder: index,
  }));
  const attachments = value.attachments;
  const id = existingId ?? entityId;

  if (value.type === "vendor_payment") {
    const payload = {
      id,
      vendorId: value.vendorId,
      title: value.title,
      invoiceNumber: value.invoiceNumber,
      invoiceDate: value.invoiceDate,
      lineItems,
      attachments,
    };
    return existingId
      ? zero.mutate(mutators.vendorPayment.update(payload))
      : zero.mutate(mutators.vendorPayment.create(payload));
  }

  const selectedAccount = bankAccountList.find(
    (account) => account.accountNumber === value.bankAccountNumber
  );
  const basePayload = {
    id,
    title: value.title,
    city: value.city,
    bankAccountName: value.bankAccountName,
    bankAccountNumber: value.bankAccountNumber ?? "",
    bankAccountIfscCode:
      selectedAccount?.ifscCode ?? value.bankAccountIfscCode ?? "",
    lineItems,
    attachments,
  };

  if (value.type === "reimbursement") {
    const reimbPayload = { ...basePayload, expenseDate: value.expenseDate };
    return existingId
      ? zero.mutate(mutators.reimbursement.update(reimbPayload))
      : zero.mutate(mutators.reimbursement.create(reimbPayload));
  }

  return existingId
    ? zero.mutate(mutators.advancePayment.update(basePayload))
    : zero.mutate(mutators.advancePayment.create(basePayload));
}
