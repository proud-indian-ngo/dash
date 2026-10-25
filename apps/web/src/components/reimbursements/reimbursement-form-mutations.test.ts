import { describe, expect, it } from "bun:test";

import type { BankAccount } from "@pi-dash/zero/schema";

import type { RequestFormValues } from "./form/reimbursement-form.schema";
import {
  buildMutation,
  requestBankFields,
} from "./reimbursement-form-mutations";

const bank = {
  accountName: "Priya",
  accountNumber: "1234567890",
  createdAt: 0,
  id: "acct-bank",
  ifscCode: "SBIN0001234",
  isDefault: true,
  updatedAt: 0,
  upiId: null,
  userId: "priya",
} as BankAccount;
const upi = {
  ...bank,
  accountNumber: null,
  id: "acct-upi",
  ifscCode: null,
  isDefault: false,
  upiId: "priya@okhdfc",
} as BankAccount;

describe("requestBankFields", () => {
  it("sends every part of a picked UPI-only account, clearing bank details", () => {
    const { bankFields, selectedAccount } = requestBankFields(
      {
        bankAccountIfscCode: "",
        bankAccountName: "Priya",
        bankAccountNumber: "",
        bankAccountUpiId: "priya@okhdfc",
      },
      [bank, upi]
    );
    expect(selectedAccount?.id).toBe("acct-upi");
    expect(bankFields).toEqual({
      bankAccountIfscCode: "",
      bankAccountName: "Priya",
      bankAccountNumber: "",
      bankAccountUpiId: "priya@okhdfc",
    });
  });

  it("clears a UPI ID when the picked account has none", () => {
    const { bankFields } = requestBankFields(
      {
        bankAccountIfscCode: "SBIN0001234",
        bankAccountName: "Priya",
        bankAccountNumber: "1234567890",
        bankAccountUpiId: "",
      },
      [bank, upi]
    );
    expect(bankFields.bankAccountUpiId).toBe("");
    expect(bankFields.bankAccountIfscCode).toBe("SBIN0001234");
  });

  it("sends only the parts the form holds when the account is no longer saved", () => {
    const { bankFields, selectedAccount } = requestBankFields(
      {
        bankAccountIfscCode: "",
        bankAccountName: "Old",
        bankAccountNumber: "",
        bankAccountUpiId: "old@ybl",
      },
      [bank]
    );
    expect(selectedAccount).toBeUndefined();
    expect(bankFields).toEqual({
      bankAccountName: "Old",
      bankAccountUpiId: "old@ybl",
    });
  });
});

describe("buildMutation", () => {
  // Returns the mutate request so the test can read its args.
  const zero = {
    mutate: (request: unknown) => request,
  } as unknown as Parameters<typeof buildMutation>[0];
  const value = {
    attachments: [],
    bankAccountIfscCode: "SBIN0001234",
    bankAccountName: "Priya",
    bankAccountNumber: "1234567890",
    bankAccountUpiId: "",
    chargedTo: "event",
    eventId: "event-1",
    expenseDate: new Date(2026, 9, 25),
    lineItems: [],
    title: "Snacks",
    type: "reimbursement",
  } as unknown as RequestFormValues;
  const argsOf = (request: unknown) =>
    (request as { args: Record<string, unknown> }).args;

  it("sends the picked account on an edit", () => {
    const args = argsOf(buildMutation(zero, value, "r-1", "r-1", [bank], 0));
    expect(args.bankAccountNumber).toBe("1234567890");
  });

  it("leaves the payee out when editing someone else's request", () => {
    const args = argsOf(
      buildMutation(zero, value, "r-1", "r-1", [bank], 0, undefined, true)
    );
    for (const key of [
      "bankAccountIfscCode",
      "bankAccountName",
      "bankAccountNumber",
      "bankAccountUpiId",
    ]) {
      expect(args).not.toHaveProperty(key);
    }
  });
});
