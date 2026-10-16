import { describe, expect, it } from "bun:test";

import {
  defaultBankAccountFor,
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
