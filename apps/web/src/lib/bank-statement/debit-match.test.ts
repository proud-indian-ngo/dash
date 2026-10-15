import { describe, expect, it } from "bun:test";

import {
  type DebitCandidate,
  DebitAllocationError,
  type DebitLine,
  planDebitAllocation,
  suggestDebitMatches,
} from "./debit-match";

const line = (over: Partial<DebitLine> = {}): DebitLine => ({
  allocatedPaise: 0,
  amountPaise: 150_000,
  dismissed: [],
  id: "line-1",
  narration: "NEFT DR SHARMA TENT HOUSE",
  reference: null,
  valueOn: "2026-08-12",
  ...over,
});

const doc = (over: Partial<DebitCandidate> = {}): DebitCandidate => ({
  allocatedPaise: 0,
  amountPaise: 150_000,
  id: "doc-1",
  kind: "reimbursement",
  on: "2026-08-10",
  reference: null,
  ...over,
});

describe("suggestDebitMatches", () => {
  it("suggests a claim of the exact amount approved within ten days", () => {
    expect(suggestDebitMatches(line(), [doc()])).toEqual([
      {
        daysApart: 2,
        id: "doc-1",
        kind: "reimbursement",
        reason: "amount_date",
      },
    ]);
  });

  it("skips other amounts, dates outside the window and dismissed records", () => {
    expect(
      suggestDebitMatches(line({ dismissed: ["doc-3"] }), [
        doc({ amountPaise: 150_001 }),
        doc({ id: "doc-2", on: "2026-07-31" }),
        doc({ id: "doc-3" }),
      ])
    ).toEqual([]);
    // Ten days either side is still in.
    expect(
      suggestDebitMatches(line(), [doc({ on: "2026-08-22" })]).map((s) => s.id)
    ).toEqual(["doc-1"]);
  });

  it("compares what is left unpaid on both sides", () => {
    // 1,000 of the claim is paid by another debit; this debit has 500 matched.
    expect(
      suggestDebitMatches(line({ allocatedPaise: 50_000 }), [
        doc({ allocatedPaise: 100_000, amountPaise: 200_000 }),
      ]).map((s) => s.id)
    ).toEqual(["doc-1"]);
    expect(
      suggestDebitMatches(line({ allocatedPaise: 150_000 }), [doc()])
    ).toEqual([]);
  });

  it("ranks a vendor payment whose UTR the bank line carries first, at any date", () => {
    const result = suggestDebitMatches(
      line({ narration: "NEFT DR AXISN12345678 SHARMA TENT" }),
      [
        doc({ id: "claim", on: "2026-08-12" }),
        doc({
          id: "payment",
          kind: "vendor_payment_transaction",
          on: "2026-06-01",
          reference: "AXISN12345678",
        }),
      ]
    );
    expect(result.map((s) => [s.id, s.reason])).toEqual([
      ["payment", "reference"],
      ["claim", "amount_date"],
    ]);
  });

  it("orders by closeness, then ID, and keeps three", () => {
    const result = suggestDebitMatches(line(), [
      doc({ id: "d", on: "2026-08-20" }),
      doc({ id: "c", on: "2026-08-12" }),
      doc({ id: "b", on: "2026-08-14" }),
      doc({ id: "a", on: "2026-08-14" }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});

describe("planDebitAllocation", () => {
  it("pays two claims from one debit when they add up to it", () => {
    expect(
      planDebitAllocation(150_000, [
        { id: "a", kind: "reimbursement", remainingPaise: 100_000 },
        { id: "b", kind: "vendor_payment_transaction", remainingPaise: 50_000 },
      ])
    ).toEqual({
      allocations: [
        { amountPaise: 100_000, id: "a", kind: "reimbursement" },
        { amountPaise: 50_000, id: "b", kind: "vendor_payment_transaction" },
      ],
      debitLeftPaise: 0,
      differences: ["none"],
      partial: null,
      selectedPaise: 150_000,
    });
  });

  it("leaves the rest of the debit to explain when the selection is less", () => {
    const plan = planDebitAllocation(150_000, [
      { id: "a", kind: "reimbursement", remainingPaise: 149_500 },
    ]);
    expect(plan.debitLeftPaise).toBe(500);
    expect(plan.differences).toEqual(["leave", "bank_charges"]);
  });

  it("pays the last claim in part when the selection is more", () => {
    const plan = planDebitAllocation(150_000, [
      { id: "a", kind: "reimbursement", remainingPaise: 100_000 },
      { id: "b", kind: "reimbursement", remainingPaise: 80_000 },
    ]);
    expect(plan.allocations.map((a) => a.amountPaise)).toEqual([
      100_000, 50_000,
    ]);
    expect(plan.partial).toEqual({ id: "b", unpaidPaise: 30_000 });
    expect(plan.differences).toEqual(["part_pay"]);
  });

  it("refuses a record picked twice, one already paid, or one the debit can't reach", () => {
    expect(() =>
      planDebitAllocation(100, [
        { id: "a", kind: "reimbursement", remainingPaise: 50 },
        { id: "a", kind: "reimbursement", remainingPaise: 50 },
      ])
    ).toThrow(DebitAllocationError);
    expect(() =>
      planDebitAllocation(100, [
        { id: "a", kind: "reimbursement", remainingPaise: 0 },
      ])
    ).toThrow("already paid in full");
    expect(() =>
      planDebitAllocation(100, [
        { id: "a", kind: "reimbursement", remainingPaise: 100 },
        { id: "b", kind: "reimbursement", remainingPaise: 10 },
      ])
    ).toThrow("pick fewer");
  });

  it("with nothing picked, the whole debit is the difference", () => {
    expect(planDebitAllocation(5900, [])).toMatchObject({
      allocations: [],
      debitLeftPaise: 5900,
      differences: ["leave", "bank_charges"],
    });
  });
});
