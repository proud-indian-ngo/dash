import { describe, expect, it } from "bun:test";

import { channelAccountIssue } from "@pi-dash/shared/contribution-channel";

import { buildFormSchema, type FormValues } from "./contribution-form-schema";

const ACCOUNTS = [
  { id: "bank", kind: "bank" },
  { id: "rzp", kind: "gateway_clearing" },
];
const accountIssue = (channel: FormValues["channel"], id?: string) => {
  const account = ACCOUNTS.find((a) => a.id === id);
  return account
    ? channelAccountIssue(channel, account, {
        razorpayClearingAccountId: "rzp",
      })
    : null;
};

/** A Razorpay gift recorded into a bank account before the channel rules. */
const values: FormValues = {
  amount: "500",
  channel: "razorpay",
  deductionEligible: "unknown",
  donationType: "voluntary",
  donationTypeDescription: "",
  eligibilityReasonChoice: "",
  eligibilityReasonOther: "",
  fundId: "fund-1",
  inKindDescription: "",
  inKindValuationBasis: "",
  notes: "Edited",
  orgAccountId: "bank",
  partyId: "donor-1",
  programmeId: undefined,
  projectId: undefined,
  receivedOn: new Date("2026-10-01T00:00:00"),
  reference: "",
  reportingMode: "electronic_or_account_payee",
  reportingModeDescription: "",
};
const stored = { channel: "razorpay", orgAccountId: "bank" };

const accountErrors = (
  schema: ReturnType<typeof buildFormSchema>,
  input: FormValues
) =>
  (schema.safeParse(input).error?.issues ?? [])
    .filter((issue) => issue.path[0] === "orgAccountId")
    .map((issue) => issue.message);

describe("contribution form schema", () => {
  it("refuses an account the channel rules out", () => {
    expect(accountErrors(buildFormSchema(accountIssue), values)).toEqual([
      "A Razorpay gift goes into the Razorpay clearing account",
    ]);
  });

  it("keeps the stored account while a refund or settlement fixes it", () => {
    const schema = buildFormSchema(accountIssue, { locked: true, stored });
    expect(schema.safeParse(values).success).toBe(true);
    // Unlocked, the same edit must put the account right first.
    expect(
      accountErrors(
        buildFormSchema(accountIssue, { locked: false, stored }),
        values
      )
    ).toHaveLength(1);
  });

  it("checks a changed account even on a locked gift", () => {
    const schema = buildFormSchema(accountIssue, { locked: true, stored });
    expect(
      accountErrors(schema, { ...values, channel: "upi", orgAccountId: "rzp" })
    ).toEqual(["A UPI gift goes into a bank account"]);
  });
});
