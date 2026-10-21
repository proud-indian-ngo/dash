import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptVerificationFacts: mock(),
}));

import type { ReceiptVerificationFacts } from "@pi-dash/db/queries/contribution-receipts";
import { receiptVerifyUrl } from "@pi-dash/jobs/lib/receipt-verification";

import { verifyReceiptLink } from "./receipt-verification";

const RECEIPT_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const sig = new URL(receiptVerifyUrl(RECEIPT_ID)).searchParams.get("s") ?? "";

// Synthetic details only.
const facts: ReceiptVerificationFacts = {
  amountPaise: 300_000,
  channel: "upi",
  donorName: "Test Donor",
  issuedOn: "2026-05-04",
  number: "PI/2026-27/0001",
  orgPan: "AAATE0000E",
  urn: "TESTURN0000000",
  voidedAt: null,
  with80G: true,
};

function deps(found: ReceiptVerificationFacts | null = facts, allowed = true) {
  return {
    checkRateLimit: mock(() => ({
      allowed,
      limit: 30,
      remaining: 0,
      resetAt: 0,
    })),
    loadFacts: mock(async () => found),
  };
}

const input = { ip: "203.0.113.7", receiptId: RECEIPT_ID, sig };
// The same length, one character off.
const tampered = `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;

describe("verifyReceiptLink", () => {
  it("confirms a receipt with the donor masked", async () => {
    expect(await verifyReceiptLink(input, deps())).toEqual({
      amount: "₹3,000.00",
      donor: "T••• D•••",
      issuedOn: "4 May 2026",
      mode: "UPI",
      number: "PI/2026-27/0001",
      orgPan: "AAATE0000E",
      status: "valid",
      urn: "TESTURN0000000",
      voidedOn: null,
      with80G: true,
    });
  });

  it("dates a void in India time", async () => {
    const result = await verifyReceiptLink(
      input,
      deps({ ...facts, voidedAt: new Date("2026-03-31T20:00:00Z") })
    );
    expect(result).toMatchObject({ status: "void", voidedOn: "1 Apr 2026" });
  });

  it("reads a bad signature, a bad ID and an unknown receipt the same", async () => {
    const lookup = deps();
    expect(
      await verifyReceiptLink({ ...input, sig: tampered }, lookup)
    ).toEqual({ status: "invalid" });
    expect(
      await verifyReceiptLink(
        { ...input, receiptId: "PI-2026-27-0001" },
        lookup
      )
    ).toEqual({ status: "invalid" });
    expect(lookup.loadFacts).not.toHaveBeenCalled();
    expect(await verifyReceiptLink(input, deps(null))).toEqual({
      status: "invalid",
    });
  });

  it("stops before reading anything once the client is over the limit", async () => {
    const limited = deps(facts, false);
    expect(await verifyReceiptLink(input, limited)).toEqual({
      status: "limited",
    });
    expect(limited.checkRateLimit).toHaveBeenCalledWith(
      "receipt-verify:203.0.113.7",
      30
    );
    expect(limited.loadFacts).not.toHaveBeenCalled();
  });
});
