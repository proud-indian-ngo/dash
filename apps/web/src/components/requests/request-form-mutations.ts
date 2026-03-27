import { mutators } from "@pi-dash/zero/mutators";
import type { BankAccount } from "@pi-dash/zero/schema";
import type { useZero } from "@rocicorp/zero/react";
import type { RequestFormValues } from "./form/request-form.schema";

function requireDate(value: Date | undefined, field: string): number {
  if (!value) {
    throw new Error(`${field} is required`);
  }
  return value.getTime();
}

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
    const reimbPayload = {
      ...basePayload,
      expenseDate: requireDate(value.expenseDate, "expenseDate"),
    };
    return existingId
      ? zero.mutate(mutators.reimbursement.update(reimbPayload))
      : zero.mutate(mutators.reimbursement.create(reimbPayload));
  }

  return existingId
    ? zero.mutate(mutators.advancePayment.update(basePayload))
    : zero.mutate(mutators.advancePayment.create(basePayload));
}
