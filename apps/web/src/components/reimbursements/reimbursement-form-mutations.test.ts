import { describe, expect, it } from "bun:test";

import type { BankAccount } from "@pi-dash/zero/schema";

import { requestBankFields } from "./reimbursement-form-mutations";

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
