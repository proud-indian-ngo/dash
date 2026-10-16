import { describe, expect, it } from "bun:test";

import {
  bankAccountOptionLabel,
  defaultBankAccountFor,
  isSameBankAccount,
  shouldApplyDefaultBankAccount,
} from "./default-bank-account";

const seed = {
  accountName: "Test Savings",
  accountNumber: "1234567890",
  ifscCode: "TEST0000001",
  isDefault: false,
};
const second = {
  accountName: "Test Savings",
  accountNumber: "9876546454",
  ifscCode: "TEST0000002",
  isDefault: true,
};

function fieldsOf(account: typeof seed) {
  return {
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    ifscCode: account.ifscCode,
  };
}

describe("defaultBankAccountFor", () => {
  it("prefers the account marked default", () => {
    expect(defaultBankAccountFor([seed, second])).toBe(second);
  });

  it("falls back to the first account", () => {
    expect(defaultBankAccountFor([seed, { ...second, isDefault: false }])).toBe(
      seed
    );
  });

  it("is undefined while no accounts have synced", () => {
    expect(defaultBankAccountFor([])).toBeUndefined();
  });
});

describe("shouldApplyDefaultBankAccount", () => {
  it("fills empty fields once the accounts arrive", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: { accountName: "", accountNumber: "", ifscCode: "" },
        defaultAccount: second,
        enabled: true,
        pickedByUser: false,
      })
    ).toBe(true);
  });

  it("replaces a stale default the form filled in itself", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: fieldsOf(seed),
        defaultAccount: second,
        enabled: true,
        pickedByUser: false,
      })
    ).toBe(true);
  });

  it("leaves the fields alone when they already hold the default", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: fieldsOf(second),
        defaultAccount: second,
        enabled: true,
        pickedByUser: false,
      })
    ).toBe(false);
  });

  it("never overrides an account the person picked", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: fieldsOf(seed),
        defaultAccount: second,
        enabled: true,
        pickedByUser: true,
      })
    ).toBe(false);
  });

  it("does nothing for edits or prefilled bank details", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: fieldsOf(seed),
        defaultAccount: second,
        enabled: false,
        pickedByUser: false,
      })
    ).toBe(false);
  });

  it("waits until there is a default to apply", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: { accountName: "", accountNumber: "", ifscCode: "" },
        defaultAccount: undefined,
        enabled: true,
        pickedByUser: false,
      })
    ).toBe(false);
  });
});

describe("bankAccountOptionLabel", () => {
  it("masks a bank account number", () => {
    expect(
      bankAccountOptionLabel({
        accountName: "Savings",
        accountNumber: "1234567890",
        upiId: null,
      })
    ).toBe("Savings (••••7890)");
  });

  it("shows a UPI ID in full, after the bank account when both", () => {
    expect(
      bankAccountOptionLabel({
        accountName: "Priya",
        accountNumber: null,
        upiId: "priya@okhdfc",
      })
    ).toBe("Priya (UPI priya@okhdfc)");
    expect(
      bankAccountOptionLabel({
        accountName: "Priya",
        accountNumber: "1234567890",
        upiId: "priya@okhdfc",
      })
    ).toBe("Priya (••••7890 · UPI priya@okhdfc)");
  });
});

describe("isSameBankAccount", () => {
  it("matches on the number and UPI ID together", () => {
    const account = { accountNumber: "1234567890", upiId: "priya@okhdfc" };
    expect(
      isSameBankAccount(account, {
        accountNumber: "1234567890",
        upiId: "priya@okhdfc",
      })
    ).toBe(true);
    expect(
      isSameBankAccount(account, { accountNumber: "1234567890", upiId: "" })
    ).toBe(false);
  });

  it("matches a UPI-only account against the form's empty number", () => {
    expect(
      isSameBankAccount(
        { accountNumber: null, upiId: "priya@okhdfc" },
        { accountNumber: "", upiId: "priya@okhdfc" }
      )
    ).toBe(true);
  });
});

describe("shouldApplyDefaultBankAccount with UPI", () => {
  it("treats a UPI-only account's missing parts as the form's empty ones", () => {
    expect(
      shouldApplyDefaultBankAccount({
        current: {
          accountName: "Priya",
          accountNumber: "",
          ifscCode: "",
          upiId: "priya@okhdfc",
        },
        defaultAccount: {
          accountName: "Priya",
          accountNumber: null,
          ifscCode: null,
          isDefault: true,
          upiId: "priya@okhdfc",
        },
        enabled: true,
        pickedByUser: false,
      })
    ).toBe(false);
  });
});
