import { describe, expect, it } from "bun:test";

import { payoutStateFor } from "./use-reimbursement-payout";

describe("payoutStateFor", () => {
  const payout = {
    bankAccountIfscCode: null,
    bankAccountName: "A",
    bankAccountNumber: "1",
    bankAccountUpiId: null,
  };

  it("shows the loaded request's details", () => {
    expect(
      payoutStateFor({ id: "a", state: { kind: "ready", payout } }, "a")
    ).toEqual({ kind: "ready", payout });
  });

  it("reads as loading for another request, never showing A's details on B", () => {
    expect(
      payoutStateFor({ id: "a", state: { kind: "ready", payout } }, "b")
    ).toEqual({ kind: "loading" });
  });
});
