import { describe, expect, it } from "vitest";

import {
  findDuplicatePayout,
  isValidUpiHandle,
  normalizePayoutAccount,
  normalizeUpiHandle,
  payoutAccountDetail,
  payoutAccountInputSchema,
} from "./payout-account";

describe("normalizeUpiHandle", () => {
  it("lower-cases UPI IDs", () => {
    expect(normalizeUpiHandle("  Priya.S@OkHDFC ")).toBe("priya.s@okhdfc");
  });

  it("strips separators and the country code from numbers", () => {
    expect(normalizeUpiHandle("+91 98765-43210")).toBe("9876543210");
    expect(normalizeUpiHandle("09876543210")).toBe("9876543210");
    expect(normalizeUpiHandle("(987) 654 3210")).toBe("9876543210");
  });
});

describe("isValidUpiHandle", () => {
  it.each([
    "priya@okhdfc",
    "priya.s-1_x@ybl",
    "9876543210@paytm",
    "9876543210",
    "+919876543210",
  ])("accepts %s", (value) => {
    expect(isValidUpiHandle(value)).toBe(true);
  });

  it.each([
    "",
    "priya",
    "priya@",
    "@okhdfc",
    "priya@ok hdfc",
    "priya@1bank",
    "12345",
    "5876543210",
    "98765432101",
  ])("rejects %s", (value) => {
    expect(isValidUpiHandle(value)).toBe(false);
  });
});

describe("payoutAccountInputSchema", () => {
  const issuesOf = (value: Record<string, string>) => {
    const result = payoutAccountInputSchema.safeParse({
      accountName: "Priya",
      ...value,
    });
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
  };

  it("takes bank details alone", () => {
    expect(
      issuesOf({ accountNumber: "1234567890", ifscCode: "sbin0001234" })
    ).toEqual([]);
  });

  it("takes UPI alone", () => {
    expect(issuesOf({ upiId: "priya@okhdfc" })).toEqual([]);
  });

  it("takes bank details and UPI together", () => {
    expect(
      issuesOf({
        accountNumber: "1234567890",
        ifscCode: "SBIN0001234",
        upiId: "9876543210",
      })
    ).toEqual([]);
  });

  it("needs one of them", () => {
    expect(issuesOf({ accountNumber: "", ifscCode: " ", upiId: "" })).toEqual([
      "accountNumber",
    ]);
  });

  it("needs bank details complete", () => {
    expect(issuesOf({ accountNumber: "1234567890" })).toEqual(["ifscCode"]);
    expect(issuesOf({ ifscCode: "SBIN0001234" })).toEqual(["accountNumber"]);
  });

  it("refuses a UPI handle that is neither an ID nor a number", () => {
    expect(issuesOf({ upiId: "1234567890123" })).toEqual(["upiId"]);
  });

  it("needs a name", () => {
    expect(issuesOf({ accountName: " ", upiId: "priya@okhdfc" })).toEqual([
      "accountName",
    ]);
  });
});

describe("normalizePayoutAccount", () => {
  it("upper-cases the IFSC and nulls an absent UPI", () => {
    expect(
      normalizePayoutAccount({
        accountName: " Priya ",
        accountNumber: " 1234567890 ",
        ifscCode: "sbin0001234",
        upiId: "",
      })
    ).toEqual({
      accountName: "Priya",
      accountNumber: "1234567890",
      ifscCode: "SBIN0001234",
      upiId: null,
    });
  });

  it("tidies UPI and drops a stray IFSC without a number", () => {
    expect(
      normalizePayoutAccount({
        accountName: "Priya",
        ifscCode: "SBIN0001234",
        upiId: "+91 98765 43210",
      })
    ).toEqual({
      accountName: "Priya",
      accountNumber: null,
      ifscCode: null,
      upiId: "9876543210",
    });
  });
});

describe("findDuplicatePayout", () => {
  const saved = [{ accountNumber: "1234567890", upiId: "priya@okhdfc" }];

  it("names the field already saved", () => {
    expect(
      findDuplicatePayout(saved, { accountNumber: "1234567890", upiId: null })
        ?.field
    ).toBe("accountNumber");
    expect(
      findDuplicatePayout(saved, { accountNumber: null, upiId: "priya@okhdfc" })
        ?.field
    ).toBe("upiId");
  });

  it("allows new values", () => {
    expect(
      findDuplicatePayout(saved, {
        accountNumber: "999",
        upiId: "other@ybl",
      })
    ).toBeNull();
  });
});

describe("payoutAccountDetail", () => {
  it("masks the bank account and shows UPI in full", () => {
    expect(
      payoutAccountDetail({
        accountNumber: "1234567890",
        ifscCode: "SBIN0001234",
        upiId: null,
      })
    ).toBe("••••7890 · SBIN0001234");
    expect(
      payoutAccountDetail({
        accountNumber: null,
        ifscCode: null,
        upiId: "priya@okhdfc",
      })
    ).toBe("UPI priya@okhdfc");
    expect(
      payoutAccountDetail({
        accountNumber: "1234567890",
        ifscCode: "SBIN0001234",
        upiId: "priya@okhdfc",
      })
    ).toBe("••••7890 · SBIN0001234 · UPI priya@okhdfc");
  });
});
