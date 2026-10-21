import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";

import { expenseHeadCode } from "./expense-heads";
import {
  allocateProvision,
  type BankMatchFacts,
  invoiceAcceptedDay,
  paymentTiming,
  payingAccount,
  paymentMovements,
  provisionOutstanding,
  type ReimbursementFacts,
  reimbursementPlan,
  type StatementChargeFacts,
  statementChargePlan,
  type VendorPaymentFacts,
  vendorPaymentPlan,
  type VendorPaymentTransactionFacts,
  vendorPaymentTransactionPlan,
} from "./expense-rules";
import type { SourcePlan } from "./income-rules";
import { validatePostingInput } from "./rules";

const BANK = "00000000-0000-7000-8000-00000000b001";
const BANK_2 = "00000000-0000-7000-8000-00000000b003";
const TRAVEL_HEAD = "00000000-0000-7000-8000-00000000f001";
const FOOD_HEAD = "00000000-0000-7000-8000-00000000f002";
const PROGRAMME = "00000000-0000-7000-8000-000000000e01";
const EVENT_PROGRAMME = "00000000-0000-7000-8000-000000000e02";
const PROJECT = "00000000-0000-7000-8000-000000000e11";
const EVENT = "00000000-0000-7000-8000-000000000e21";
const VENDOR = "00000000-0000-7000-8000-000000000d01";
const CENTRE = "00000000-0000-7000-8000-000000000c99";

const claim = (over: Partial<ReimbursementFacts> = {}): ReimbursementFacts => ({
  activeBankAccountIds: [BANK],
  approvedOn: "2026-06-03",
  mainAccountId: null,
  charge: {
    chargedProgrammeId: PROGRAMME,
    chargedProjectId: PROJECT,
    chargedTo: "programme",
    costCentreId: null,
    eventId: null,
    eventProgrammeId: null,
    eventProjectId: null,
  },
  claimantName: "Ravi Kumar",
  hasPaymentProof: true,
  id: "00000000-0000-7000-8000-000000000a01",
  lines: [
    {
      accountHeadId: TRAVEL_HEAD,
      amountPaise: 30_000,
      description: "Bus tickets",
      id: "00000000-0000-7000-8000-000000000a11",
    },
    {
      accountHeadId: FOOD_HEAD,
      amountPaise: 12_500,
      description: null,
      id: "00000000-0000-7000-8000-000000000a12",
    },
  ],
  matches: [],
  postedAccountId: null,
  status: "approved",
  title: "Class outing",
  voidedOn: null,
  ...over,
});

const request = (
  over: Partial<VendorPaymentFacts> = {}
): VendorPaymentFacts => ({
  acceptedOn: "2026-07-20",
  charge: {
    chargedProgrammeId: null,
    chargedProjectId: null,
    chargedTo: "event",
    costCentreId: null,
    eventId: EVENT,
    eventProgrammeId: EVENT_PROGRAMME,
    eventProjectId: null,
  },
  id: "00000000-0000-7000-8000-000000000b01",
  invoiceDate: "2026-07-15",
  lines: [
    {
      accountHeadId: TRAVEL_HEAD,
      amountPaise: 250_000,
      description: "Bus hire",
      id: "00000000-0000-7000-8000-000000000b11",
    },
  ],
  paidBeforeCutoverPaise: 0,
  paidPaise: 250_000,
  paymentWaiting: null,
  provisionAvailablePaise: {},
  status: "completed",
  title: "Bus for the event",
  vendorId: VENDOR,
  voidedOn: null,
  ...over,
});

const payment = (
  over: Partial<VendorPaymentTransactionFacts> = {}
): VendorPaymentTransactionFacts => ({
  activeBankAccountIds: [BANK],
  amountPaise: 250_000,
  costCentreId: null,
  id: "00000000-0000-7000-8000-000000000c01",
  mainAccountId: null,
  matches: [],
  paidOn: "2026-07-10",
  paymentReference: "UTR42",
  postedAccountId: null,
  requestStatus: "paid",
  status: "approved",
  title: "Bus for the event",
  vendorId: VENDOR,
  voidedOn: null,
  ...over,
});

const posted = (plan: SourcePlan) => {
  if (plan.kind !== "post") {
    throw new Error(`expected a posting, got ${plan.kind}`);
  }
  return plan;
};

const part = (plan: SourcePlan, action: string) =>
  posted(plan).parts.find((p) => p.action === action);

/** Every part passes the engine's checks, as the engine would see it. */
const validParts = (plan: SourcePlan) => {
  for (const p of posted(plan).parts) {
    validatePostingInput({
      ...p,
      sourceId: "00000000-0000-7000-8000-000000000999",
      sourceType: "test",
    });
  }
};

const LIABILITY_HEADS = new Set<string>([
  LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable,
  LEDGER_ACCOUNT_HEAD_IDS.claimsPayable,
]);

/**
 * Assets move by what the funds and liabilities move by on every date,
 * across a source's parts: money and asset heads on one side, liabilities
 * and expenses (here every other head, reducing the funds) on the other,
 * so the balance summary agrees whatever day it is read on.
 */
const isBalanced = (plan: SourcePlan) => {
  const net = new Map<string, number>();
  const add = (day: string, paise: number) =>
    net.set(day, (net.get(day) ?? 0) + paise);
  for (const p of posted(plan).parts) {
    for (const m of p.movements) {
      add(
        m.occurredOn ?? p.economicOn,
        m.direction === "in" ? m.amountPaise : -m.amountPaise
      );
    }
    for (const e of p.entries) {
      const signed = e.effect === "increase" ? e.amountPaise : -e.amountPaise;
      const day = e.economicOn ?? p.economicOn;
      add(day, LIABILITY_HEADS.has(e.accountHeadId) ? -signed : signed);
    }
  }
  return [...net.values()].every((v) => v === 0);
};

describe("reimbursementPlan", () => {
  it("posts an expense per line and one payment out of the bank on the approval day", () => {
    const plan = reimbursementPlan(claim());
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(posted(plan).economicOn).toBe("2026-06-03");
    expect(part(plan, "recognise")?.entries).toEqual([
      {
        accountHeadId: TRAVEL_HEAD,
        amountPaise: 30_000,
        costCentreId: null,
        effect: "increase",
        eventId: null,
        fundId: GENERAL_FUND_ID,
        memo: "Bus tickets",
        partyId: null,
        programmeId: PROGRAMME,
        projectId: PROJECT,
        sourceLineId: "00000000-0000-7000-8000-000000000a11",
      },
      {
        accountHeadId: FOOD_HEAD,
        amountPaise: 12_500,
        costCentreId: null,
        effect: "increase",
        eventId: null,
        fundId: GENERAL_FUND_ID,
        memo: "Class outing",
        partyId: null,
        programmeId: PROGRAMME,
        projectId: PROJECT,
        sourceLineId: "00000000-0000-7000-8000-000000000a12",
      },
    ]);
    // The money out alone, as layer 3-3a posted it ...
    expect(part(plan, "cash")).toEqual({
      action: "cash",
      economicOn: "2026-06-03",
      entries: [],
      movements: [
        {
          amountPaise: 42_500,
          direction: "out",
          kind: "payout",
          memo: "Class outing (paid to Ravi Kumar)",
          orgAccountId: BANK,
        },
      ],
    });
    // ... and the claim as payable: raised on approval, cleared by payment.
    expect(part(plan, "settle")).toEqual({
      action: "settle",
      economicOn: "2026-06-03",
      entries: [
        {
          accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.claimsPayable,
          amountPaise: 42_500,
          costCentreId: null,
          economicOn: "2026-06-03",
          effect: "increase",
          fundId: GENERAL_FUND_ID,
          memo: "Class outing (paid to Ravi Kumar)",
        },
        {
          accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.claimsPayable,
          amountPaise: 42_500,
          costCentreId: null,
          economicOn: "2026-06-03",
          effect: "decrease",
          fundId: GENERAL_FUND_ID,
          memo: "Class outing (paid to Ravi Kumar)",
        },
      ],
      movements: [],
    });
  });

  it("names the claimant on the payout, so a claimant change reposts it", () => {
    const memo = (over: Partial<ReimbursementFacts>) =>
      part(reimbursementPlan(claim(over)), "cash")?.movements[0]?.memo;
    expect(memo({ claimantName: "Meena S" })).toBe(
      "Class outing (paid to Meena S)"
    );
    // The expense entries don't change with the claimant (only the
    // payable's memo, which names who is owed).
    expect(
      part(reimbursementPlan(claim({ claimantName: "Meena S" })), "recognise")
    ).toEqual(part(reimbursementPlan(claim()), "recognise"));
    // A login without a name leaves the title alone.
    expect(memo({ claimantName: null })).toBe("Class outing");
  });

  it("takes the event and its programme when charged to an event, and no programme for admin", () => {
    const toEvent = reimbursementPlan(
      claim({
        charge: {
          chargedProgrammeId: null,
          chargedProjectId: null,
          chargedTo: "event",
          costCentreId: null,
          eventId: EVENT,
          eventProgrammeId: EVENT_PROGRAMME,
          eventProjectId: null,
        },
      })
    );
    expect(part(toEvent, "recognise")?.entries[0]).toMatchObject({
      eventId: EVENT,
      programmeId: EVENT_PROGRAMME,
      projectId: null,
    });
    const eventProject = "00000000-0000-7000-8000-0000000000e9";
    const toEventProject = reimbursementPlan(
      claim({
        charge: {
          chargedProgrammeId: null,
          chargedProjectId: null,
          chargedTo: "event",
          costCentreId: null,
          eventId: EVENT,
          eventProgrammeId: EVENT_PROGRAMME,
          eventProjectId: eventProject,
        },
      })
    );
    expect(part(toEventProject, "recognise")?.entries[0]).toMatchObject({
      programmeId: EVENT_PROGRAMME,
      projectId: eventProject,
    });
    const admin = reimbursementPlan(
      claim({
        charge: {
          chargedProgrammeId: null,
          chargedProjectId: null,
          chargedTo: "organisation",
          costCentreId: null,
          eventId: null,
          eventProgrammeId: null,
          eventProjectId: null,
        },
      })
    );
    expect(part(admin, "recognise")?.entries[0]).toMatchObject({
      eventId: null,
      programmeId: null,
      projectId: null,
    });
  });

  it("carries the cost centre on the expense and the payable, never on the money", () => {
    const plan = reimbursementPlan(
      claim({ charge: { ...claim().charge, costCentreId: CENTRE } })
    );
    const recognise = part(plan, "recognise");
    const settle = part(plan, "settle");
    expect(recognise?.entries.length).toBeGreaterThan(0);
    for (const entry of [
      ...(recognise?.entries ?? []),
      ...(settle?.entries ?? []),
    ]) {
      expect(entry.costCentreId).toBe(CENTRE);
    }
    // Older claims that never recorded a city post with none.
    for (const entry of part(reimbursementPlan(claim()), "recognise")
      ?.entries ?? []) {
      expect(entry.costCentreId).toBeNull();
    }
  });

  it("posts nothing unless approved, and nothing approved before the cutover", () => {
    expect(reimbursementPlan(claim({ status: "pending" }))).toEqual({
      kind: "none",
      reason: "not_approved",
    });
    expect(reimbursementPlan(claim({ status: "rejected" }))).toEqual({
      kind: "none",
      reason: "not_approved",
    });
    expect(
      reimbursementPlan(
        claim({ approvedOn: "2026-03-31", hasPaymentProof: false })
      )
    ).toEqual({ kind: "none", reason: "before_cutover" });
    expect(reimbursementPlan(null)).toEqual({
      kind: "none",
      reason: "deleted",
    });
  });

  it("waits for the payment when no screenshot was attached (section 6)", () => {
    expect(reimbursementPlan(claim({ hasPaymentProof: false }))).toMatchObject({
      economicOn: "2026-06-03",
      kind: "wait",
      reason: "no_payment_proof",
    });
    expect(
      reimbursementPlan(claim({ approvedOn: null, hasPaymentProof: false }))
    ).toMatchObject({
      economicOn: null,
      kind: "wait",
      reason: "no_payment_proof",
    });
  });

  it("waits for the approval day, not the screenshot, when only the day is missing", () => {
    expect(reimbursementPlan(claim({ approvedOn: null }))).toEqual({
      economicOn: null,
      kind: "wait",
      reason: "no_approval_day",
    });
  });

  it("posts nothing for a zero total, and says so rather than 'Not approved'", () => {
    const zero = claim({
      lines: [
        {
          accountHeadId: TRAVEL_HEAD,
          amountPaise: 0,
          description: "Waived",
          id: "00000000-0000-7000-8000-000000000a13",
        },
      ],
    });
    expect(reimbursementPlan(zero)).toEqual({
      kind: "none",
      reason: "nothing_to_post",
    });
    expect(reimbursementPlan(claim({ lines: [] }))).toEqual({
      kind: "none",
      reason: "nothing_to_post",
    });
  });

  it("waits for the paying account with several bank accounts, unless already posted from one", () => {
    expect(
      reimbursementPlan(claim({ activeBankAccountIds: [BANK, BANK_2] }))
    ).toMatchObject({
      economicOn: "2026-06-03",
      kind: "wait",
      reason: "pick_paying_account",
    });
    const kept = reimbursementPlan(
      claim({ activeBankAccountIds: [BANK, BANK_2], postedAccountId: BANK_2 })
    );
    expect(part(kept, "cash")?.movements[0]?.orgAccountId).toBe(BANK_2);
  });

  it("waits when a line's category has no account head", () => {
    expect(
      reimbursementPlan(
        claim({
          lines: [
            {
              accountHeadId: null,
              amountPaise: 100,
              description: null,
              id: "00000000-0000-7000-8000-000000000a13",
            },
          ],
        })
      )
    ).toMatchObject({ kind: "wait", reason: "reference_data_missing" });
  });

  it("a recharge changes the recognition only; an amount change changes both parts", () => {
    const before = reimbursementPlan(claim());
    const recharged = reimbursementPlan(
      claim({
        charge: {
          chargedProgrammeId: EVENT_PROGRAMME,
          chargedProjectId: null,
          chargedTo: "programme",
          costCentreId: null,
          eventId: null,
          eventProgrammeId: null,
          eventProjectId: null,
        },
      })
    );
    expect(part(recharged, "cash")).toEqual(part(before, "cash"));
    expect(part(recharged, "recognise")).not.toEqual(part(before, "recognise"));
    const edited = reimbursementPlan(
      claim({
        lines: [
          {
            accountHeadId: TRAVEL_HEAD,
            amountPaise: 31_000,
            description: "Bus tickets",
            id: "00000000-0000-7000-8000-000000000a11",
          },
        ],
      })
    );
    expect(part(edited, "cash")?.movements[0]?.amountPaise).toBe(31_000);
  });
});

describe("vendorPaymentPlan", () => {
  it("recognises the lines at the full amount (no recoverable GST) with the vendor as party, on acceptance", () => {
    const plan = vendorPaymentPlan(request());
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(posted(plan).parts.map((p) => p.action)).toEqual(["recognise"]);
    expect(posted(plan).economicOn).toBe("2026-07-20");
    expect(part(plan, "recognise")?.entries[0]).toEqual({
      accountHeadId: TRAVEL_HEAD,
      amountPaise: 250_000,
      costCentreId: null,
      effect: "increase",
      eventId: EVENT,
      fundId: GENERAL_FUND_ID,
      memo: "Bus hire",
      partyId: VENDOR,
      programmeId: EVENT_PROGRAMME,
      projectId: null,
      sourceLineId: "00000000-0000-7000-8000-000000000b11",
    });
  });

  it("clears the supplier advance its payments made when the invoice is accepted", () => {
    const plan = vendorPaymentPlan(request());
    expect(isBalanced(plan)).toBe(true);
    expect(part(plan, "recognise")?.entries.at(-1)).toEqual({
      accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
      amountPaise: 250_000,
      costCentreId: null,
      effect: "decrease",
      fundId: GENERAL_FUND_ID,
      memo: "Bus for the event",
      partyId: VENDOR,
    });
    // The payment's advance and the invoice's clearing net to the expense.
    const advance = part(vendorPaymentTransactionPlan(payment()), "recognise");
    const net = [
      ...(advance?.entries ?? []),
      ...(part(plan, "recognise")?.entries ?? []),
    ]
      .filter(
        (e) => e.accountHeadId === LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances
      )
      .reduce(
        (sum, e) =>
          sum + (e.effect === "increase" ? e.amountPaise : -e.amountPaise),
        0
      );
    expect(net).toBe(0);
  });

  it("clears only the invoice's amount when the payments were more, leaving the rest on the advance", () => {
    const plan = vendorPaymentPlan(request({ paidPaise: 300_000 }));
    expect(isBalanced(plan)).toBe(true);
    expect(part(plan, "recognise")?.entries.at(-1)).toMatchObject({
      accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
      amountPaise: 250_000,
      effect: "decrease",
    });
  });

  it("waits when the invoice is more than the approved payments, since it wouldn't balance", () => {
    for (const paidPaise of [0, 200_000]) {
      expect(vendorPaymentPlan(request({ paidPaise }))).toMatchObject({
        economicOn: "2026-07-20",
        kind: "wait",
        reason: "invoice_exceeds_payments",
      });
    }
  });

  it("keeps a request paid before the cutover as history, and waits for the CA when paid on both sides", () => {
    expect(
      vendorPaymentPlan(
        request({ paidBeforeCutoverPaise: 250_000, paidPaise: 0 })
      )
    ).toEqual({ kind: "none", reason: "before_cutover" });
    expect(
      vendorPaymentPlan(
        request({ paidBeforeCutoverPaise: 100_000, paidPaise: 150_000 })
      )
    ).toMatchObject({
      economicOn: "2026-07-20",
      kind: "wait",
      reason: "paid_across_cutover",
    });
  });

  it("posts nothing until the invoice (or no-invoice reason) is approved", () => {
    for (const status of [
      "approved",
      "partially_paid",
      "paid",
      "invoice_pending",
    ]) {
      expect(vendorPaymentPlan(request({ status }))).toEqual({
        kind: "none",
        reason: "invoice_not_accepted",
      });
    }
    for (const status of ["pending", "rejected"]) {
      expect(vendorPaymentPlan(request({ status }))).toEqual({
        kind: "none",
        reason: "not_approved",
      });
    }
  });

  it("dates by the approval day, else the invoice date, and skips one accepted before the cutover", () => {
    expect(
      invoiceAcceptedDay({ acceptedOn: null, invoiceDate: "2026-05-01" })
    ).toBe("2026-05-01");
    expect(vendorPaymentPlan(request({ acceptedOn: "2026-03-28" }))).toEqual({
      kind: "none",
      reason: "before_cutover",
    });
  });
});

describe("vendor payment cost centres", () => {
  it("puts the request's cost centre on the expense, the advance and its clearing", () => {
    const charge = { ...request().charge, costCentreId: CENTRE };
    const invoice = part(vendorPaymentPlan(request({ charge })), "recognise");
    expect(invoice?.entries.map((e) => e.costCentreId)).toEqual([
      CENTRE,
      CENTRE,
    ]);
    const advance = part(
      vendorPaymentTransactionPlan(payment({ costCentreId: CENTRE })),
      "recognise"
    );
    expect(advance?.entries.map((e) => e.costCentreId)).toEqual([CENTRE]);
  });
});

describe("vendorPaymentTransactionPlan", () => {
  it("takes an approved payment out of the bank on its date as a supplier advance", () => {
    const plan = vendorPaymentTransactionPlan(payment());
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    // The advance on the day the money left, in its own part; the money
    // out alone in the cash part, as layer 3-3a posted it.
    expect(posted(plan).parts).toEqual([
      {
        action: "recognise",
        economicOn: "2026-07-10",
        entries: [
          {
            accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
            amountPaise: 250_000,
            costCentreId: null,
            economicOn: "2026-07-10",
            effect: "increase",
            fundId: GENERAL_FUND_ID,
            memo: "Bus for the event",
            partyId: VENDOR,
          },
        ],
        movements: [],
      },
      {
        action: "cash",
        economicOn: "2026-07-10",
        entries: [],
        movements: [
          {
            amountPaise: 250_000,
            direction: "out",
            kind: "payout",
            memo: "Bus for the event",
            orgAccountId: BANK,
            paymentReference: "UTR42",
          },
        ],
      },
    ]);
  });

  it("posts nothing for a pending or rejected payment, or one on an unapproved request", () => {
    expect(
      vendorPaymentTransactionPlan(payment({ status: "pending" }))
    ).toEqual({ kind: "none", reason: "not_approved" });
    expect(
      vendorPaymentTransactionPlan(payment({ status: "rejected" }))
    ).toEqual({ kind: "none", reason: "not_approved" });
    expect(
      vendorPaymentTransactionPlan(payment({ requestStatus: "pending" }))
    ).toEqual({ kind: "none", reason: "not_approved" });
  });

  it("skips payments before the cutover and waits for the paying account", () => {
    expect(
      vendorPaymentTransactionPlan(payment({ paidOn: "2026-03-31" }))
    ).toEqual({ kind: "none", reason: "before_cutover" });
    expect(
      vendorPaymentTransactionPlan(payment({ activeBankAccountIds: [] }))
    ).toMatchObject({
      economicOn: "2026-07-10",
      kind: "wait",
      reason: "pick_paying_account",
    });
  });
});

describe("helpers", () => {
  it("payingAccount: the account already posted from, else the main one, else the only one", () => {
    const none = { mainAccountId: null, postedAccountId: null };
    expect(payingAccount({ ...none, activeBankAccountIds: [BANK] })).toBe(BANK);
    expect(
      payingAccount({
        activeBankAccountIds: [BANK, BANK_2],
        mainAccountId: BANK_2,
        postedAccountId: null,
      })
    ).toBe(BANK_2);
    expect(
      payingAccount({
        activeBankAccountIds: [BANK, BANK_2],
        mainAccountId: BANK_2,
        postedAccountId: BANK,
      })
    ).toBe(BANK);
    expect(
      payingAccount({ ...none, activeBankAccountIds: [BANK, BANK_2] })
    ).toBeNull();
    expect(payingAccount({ ...none, activeBankAccountIds: [] })).toBeNull();
  });

  it("expenseHeadCode slugs a category name", () => {
    expect(expenseHeadCode("Food or Refreshment")).toBe(
      "EXPENSE_FOOD_OR_REFRESHMENT"
    );
    expect(expenseHeadCode("  ")).toBe("EXPENSE_CATEGORY");
  });
});

describe("voided requests", () => {
  const voided = {
    kind: "none",
    reason: "voided",
    reverseOn: "2026-11-02",
  };

  it("reverses a voided reimbursement on the void day, whatever its status", () => {
    expect(reimbursementPlan(claim({ voidedOn: "2026-11-02" }))).toEqual(
      voided
    );
    expect(
      reimbursementPlan(claim({ status: "pending", voidedOn: "2026-11-02" }))
    ).toEqual(voided);
  });

  it("reverses a voided vendor payment request and its payments", () => {
    expect(vendorPaymentPlan(request({ voidedOn: "2026-11-02" }))).toEqual(
      voided
    );
    expect(
      vendorPaymentTransactionPlan(payment({ voidedOn: "2026-11-02" }))
    ).toEqual(voided);
  });
});

describe("matched bank debits (layer 3-3b)", () => {
  const LINE_A = "00000000-0000-7000-8000-00000000c0a1";
  const LINE_B = "00000000-0000-7000-8000-00000000c0a2";
  const match = (over: Partial<BankMatchFacts> = {}): BankMatchFacts => ({
    amountPaise: 42_500,
    orgAccountId: BANK_2,
    statementLineId: LINE_A,
    valueOn: "2026-06-05",
    ...over,
  });

  it("pays a fully matched claim from the line's account on the line's date, leaving the expense as it was", () => {
    const plain = reimbursementPlan(claim());
    const plan = reimbursementPlan(claim({ matches: [match()] }));
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(part(plan, "recognise")).toEqual(part(plain, "recognise"));
    expect(part(plan, "settle")?.entries.at(-1)).toMatchObject({
      amountPaise: 42_500,
      economicOn: "2026-06-05",
      effect: "decrease",
    });
    expect(part(plan, "cash")).toEqual({
      action: "cash",
      economicOn: "2026-06-05",
      entries: [],
      movements: [
        {
          amountPaise: 42_500,
          bankValueOn: "2026-06-05",
          direction: "out",
          kind: "payout",
          memo: "Class outing (paid to Ravi Kumar)",
          occurredOn: "2026-06-05",
          orgAccountId: BANK_2,
          statementLineId: LINE_A,
        },
      ],
    });
  });

  it("splits a claim paid by two debits, and leaves the unmatched rest on the default account", () => {
    const plan = reimbursementPlan(
      claim({
        matches: [
          match({
            amountPaise: 20_000,
            statementLineId: LINE_B,
            valueOn: "2026-06-09",
          }),
          match({ amountPaise: 15_000 }),
        ],
      })
    );
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    const cash = part(plan, "cash");
    expect(cash?.economicOn).toBe("2026-06-03");
    expect(
      cash?.movements.map((m) => [
        m.orgAccountId,
        m.occurredOn,
        m.amountPaise,
        m.statementLineId ?? null,
      ])
    ).toEqual([
      [BANK_2, "2026-06-05", 15_000, LINE_A],
      [BANK_2, "2026-06-09", 20_000, LINE_B],
      [BANK, "2026-06-03", 7500, null],
    ]);
  });

  it("needs no main bank account when the debits pay it all", () => {
    const plan = reimbursementPlan(
      claim({ activeBankAccountIds: [BANK, BANK_2], matches: [match()] })
    );
    expect(plan.kind).toBe("post");
    expect(
      reimbursementPlan(
        claim({
          activeBankAccountIds: [BANK, BANK_2],
          matches: [match({ amountPaise: 100 })],
        })
      )
    ).toMatchObject({
      economicOn: "2026-06-03",
      kind: "wait",
      reason: "pick_paying_account",
    });
  });

  it("waits when the matched debits are more than the claim", () => {
    expect(
      reimbursementPlan(claim({ matches: [match({ amountPaise: 50_000 })] }))
    ).toMatchObject({
      economicOn: "2026-06-03",
      kind: "wait",
      reason: "match_exceeds_amount",
    });
  });

  it("counts a matched debit as proof of payment", () => {
    expect(
      reimbursementPlan(claim({ hasPaymentProof: false, matches: [match()] }))
        .kind
    ).toBe("post");
  });

  it("follows the money across the cutover: history before it, posted from the debit after it, waiting for the CA on both sides", () => {
    // Approved after the cutover, paid by a debit before it: history.
    expect(
      reimbursementPlan(
        claim({
          approvedOn: "2026-04-02",
          matches: [match({ valueOn: "2026-03-30" })],
        })
      )
    ).toEqual({ kind: "none", reason: "before_cutover" });
    // Approved before, paid after: recognised and paid on the debit day.
    const late = reimbursementPlan(
      claim({
        approvedOn: "2026-03-28",
        matches: [match({ valueOn: "2026-04-02" })],
      })
    );
    validParts(late);
    expect(isBalanced(late)).toBe(true);
    expect(posted(late).parts.map((p) => p.economicOn)).toEqual([
      "2026-04-02",
      "2026-04-02",
      "2026-04-02",
    ]);
    // Debits on both sides: the CA decides.
    expect(
      reimbursementPlan(
        claim({
          matches: [
            match({ amountPaise: 20_000, valueOn: "2026-03-30" }),
            match({
              amountPaise: 22_500,
              statementLineId: LINE_B,
              valueOn: "2026-04-02",
            }),
          ],
        })
      )
    ).toMatchObject({ kind: "wait", reason: "bank_debit_across_cutover" });
    // Approved before and unmatched, or paid before: history.
    expect(reimbursementPlan(claim({ approvedOn: "2026-03-28" }))).toEqual({
      kind: "none",
      reason: "before_cutover",
    });
    // Part paid before the cutover, the rest on an approval after it.
    expect(
      reimbursementPlan(
        claim({ matches: [match({ amountPaise: 100, valueOn: "2026-03-30" })] })
      )
    ).toMatchObject({ kind: "wait", reason: "bank_debit_across_cutover" });
  });

  it("keeps the books balanced between the approval and the debit, in both orders", () => {
    for (const valueOn of ["2026-06-20", "2026-05-25"]) {
      const plan = reimbursementPlan(claim({ matches: [match({ valueOn })] }));
      expect(isBalanced(plan)).toBe(true);
      expect(part(plan, "recognise")?.economicOn).toBe("2026-06-03");
      expect(part(plan, "cash")?.economicOn).toBe(valueOn);
    }
  });

  it("moves a vendor payment to its matched debit and keeps the reference", () => {
    const plan = vendorPaymentTransactionPlan(
      payment({
        matches: [match({ amountPaise: 250_000, valueOn: "2026-07-11" })],
      })
    );
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(part(plan, "cash")?.movements).toEqual([
      {
        amountPaise: 250_000,
        bankValueOn: "2026-07-11",
        direction: "out",
        kind: "payout",
        memo: "Bus for the event",
        occurredOn: "2026-07-11",
        orgAccountId: BANK_2,
        paymentReference: "UTR42",
        statementLineId: LINE_A,
      },
    ]);
    // Part paid by a debit before the cutover, the rest on its date after.
    expect(
      vendorPaymentTransactionPlan(
        payment({ matches: [match({ valueOn: "2026-03-31" })] })
      )
    ).toMatchObject({ kind: "wait", reason: "bank_debit_across_cutover" });
    // Paid in full by a debit before the cutover: history.
    expect(
      vendorPaymentTransactionPlan(
        payment({
          matches: [match({ amountPaise: 250_000, valueOn: "2026-03-31" })],
        })
      )
    ).toEqual({ kind: "none", reason: "before_cutover" });
    // Dated before the cutover but paid by a debit after it: posts then.
    const late = vendorPaymentTransactionPlan(
      payment({
        matches: [match({ amountPaise: 250_000, valueOn: "2026-04-03" })],
        paidOn: "2026-03-30",
      })
    );
    expect(posted(late).economicOn).toBe("2026-04-03");
  });

  it("an invoice waits while one of its payments waits, so no advance is cleared that was never booked", () => {
    expect(
      vendorPaymentPlan(
        request({ paymentWaiting: "bank_debit_across_cutover" })
      )
    ).toMatchObject({ kind: "wait", reason: "bank_debit_across_cutover" });
  });

  it("paymentTiming reads when the money left against the cutover", () => {
    const at = (matches: BankMatchFacts[], defaultOn = "2026-06-03") =>
      paymentTiming({ defaultOn, matches, totalPaise: 42_500 });
    expect(at([])).toEqual({ firstOn: "2026-06-03", kind: "after" });
    expect(at([], "2026-03-31")).toEqual({ kind: "before" });
    expect(at([match({ valueOn: "2026-03-31" })])).toEqual({ kind: "before" });
    expect(at([match({ valueOn: "2026-04-01" })], "2026-03-01")).toEqual({
      firstOn: "2026-04-01",
      kind: "after",
    });
    expect(at([match({ amountPaise: 1, valueOn: "2026-03-31" })])).toEqual({
      kind: "across",
    });
    expect(at([match({ amountPaise: 50_000 })])).toEqual({ kind: "exceeds" });
  });

  it("paymentMovements orders matches by date, then line", () => {
    const result = paymentMovements({
      defaultAccountId: BANK,
      defaultOn: "2026-06-03",
      matches: [
        match({
          amountPaise: 1,
          statementLineId: LINE_B,
          valueOn: "2026-06-05",
        }),
        match({
          amountPaise: 2,
          statementLineId: LINE_A,
          valueOn: "2026-06-05",
        }),
      ],
      movement: { direction: "out", kind: "payout" },
      totalPaise: 3,
    });
    expect(
      result.kind === "ok" && result.movements.map((m) => m.statementLineId)
    ).toEqual([LINE_A, LINE_B]);
  });
});

describe("statementChargePlan", () => {
  const LINE = "00000000-0000-7000-8000-00000000c0b1";
  const line = (
    over: Partial<StatementChargeFacts> = {}
  ): StatementChargeFacts => ({
    bankChargesPaise: 5900,
    id: LINE,
    orgAccountId: BANK,
    taxPaise: 0,
    valueOn: "2026-08-12",
    ...over,
  });

  it("posts bank charges as an expense paid from the line's account on its date", () => {
    const plan = statementChargePlan(line());
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(posted(plan).parts).toHaveLength(1);
    expect(part(plan, "cash")?.entries).toEqual([
      {
        accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.bankCharges,
        amountPaise: 5900,
        effect: "increase",
        fundId: GENERAL_FUND_ID,
        memo: "Bank charges",
      },
    ]);
    expect(part(plan, "cash")?.movements).toEqual([
      {
        amountPaise: 5900,
        bankValueOn: "2026-08-12",
        direction: "out",
        kind: "fee",
        memo: "Bank charges",
        occurredOn: "2026-08-12",
        orgAccountId: BANK,
        statementLineId: LINE,
      },
    ]);
  });

  it("posts a tax payment under taxes and government fees", () => {
    const plan = statementChargePlan(
      line({ bankChargesPaise: 0, taxPaise: 120_000 })
    );
    expect(isBalanced(plan)).toBe(true);
    expect(part(plan, "cash")?.entries[0]?.accountHeadId).toBe(
      LEDGER_ACCOUNT_HEAD_IDS.taxesAndFees
    );
    expect(part(plan, "cash")?.movements[0]?.kind).toBe("tax_remittance");
  });

  it("posts nothing before the cutover, when unmarked, or when gone", () => {
    expect(statementChargePlan(line({ valueOn: "2026-03-31" }))).toEqual({
      kind: "none",
      reason: "before_cutover",
    });
    expect(statementChargePlan(line({ bankChargesPaise: 0 }))).toEqual({
      kind: "none",
      reason: "unmatched",
    });
    expect(statementChargePlan(null)).toEqual({
      kind: "none",
      reason: "deleted",
    });
  });
});

describe("provisions a vendor invoice clears", () => {
  const PROVISION = LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable;
  const AUDIT_FEES = LEDGER_ACCOUNT_HEAD_IDS.auditFees;
  const auditor = (
    available: number,
    over: Partial<VendorPaymentFacts> = {}
  ): VendorPaymentFacts =>
    request({
      charge: {
        chargedProgrammeId: null,
        chargedProjectId: null,
        chargedTo: "organisation",
        costCentreId: null,
        eventId: null,
        eventProgrammeId: null,
        eventProjectId: null,
      },
      lines: [
        {
          accountHeadId: TRAVEL_HEAD,
          amountPaise: 9000_00,
          description: "Audit fee",
          id: "00000000-0000-7000-8000-000000000b12",
          provisionHeadId: PROVISION,
        },
      ],
      paidPaise: 9000_00,
      provisionAvailablePaise: { [PROVISION]: available },
      title: "Statutory audit",
      ...over,
    });

  it("clears the provision up to what is outstanding and posts the rest as audit fees", () => {
    const plan = vendorPaymentPlan(auditor(7500_00));
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(part(plan, "recognise")?.entries).toEqual([
      {
        accountHeadId: PROVISION,
        amountPaise: 7500_00,
        effect: "decrease",
        fundId: GENERAL_FUND_ID,
        memo: "Audit fee",
        partyId: VENDOR,
        sourceLineId: "00000000-0000-7000-8000-000000000b12",
      },
      expect.objectContaining({
        accountHeadId: AUDIT_FEES,
        amountPaise: 1500_00,
        effect: "increase",
        programmeId: null,
        sourceLineId: "00000000-0000-7000-8000-000000000b12",
      }),
      expect.objectContaining({
        accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
        amountPaise: 9000_00,
        effect: "decrease",
      }),
    ]);
  });

  it("posts it all as audit fees with nothing outstanding, and all against the provision when it covers it", () => {
    const none = part(vendorPaymentPlan(auditor(0)), "recognise")?.entries;
    expect(none?.map((e) => [e.accountHeadId, e.amountPaise])).toEqual([
      [AUDIT_FEES, 9000_00],
      [LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances, 9000_00],
    ]);
    const all = part(
      vendorPaymentPlan(auditor(20_000_00)),
      "recognise"
    )?.entries;
    expect(all?.map((e) => [e.accountHeadId, e.amountPaise])).toEqual([
      [PROVISION, 9000_00],
      [LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances, 9000_00],
    ]);
  });

  it("leaves the other lines under their category's head, and waits for a head that is not a provision", () => {
    const mixed = auditor(500_00, {
      lines: [
        ...auditor(0).lines,
        {
          accountHeadId: FOOD_HEAD,
          amountPaise: 200_00,
          description: "Courier",
          id: "00000000-0000-7000-8000-000000000b13",
        },
      ],
      paidPaise: 9200_00,
    });
    const plan = vendorPaymentPlan(mixed);
    expect(isBalanced(plan)).toBe(true);
    expect(
      part(plan, "recognise")?.entries.map((e) => [
        e.accountHeadId,
        e.effect,
        e.amountPaise,
      ])
    ).toEqual([
      [FOOD_HEAD, "increase", 200_00],
      [PROVISION, "decrease", 500_00],
      [AUDIT_FEES, "increase", 8500_00],
      [LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances, "decrease", 9200_00],
    ]);
    const wrong = auditor(500_00, {
      lines: [{ ...auditor(0).lines[0]!, provisionHeadId: FOOD_HEAD }],
    });
    expect(vendorPaymentPlan(wrong)).toMatchObject({
      kind: "wait",
      reason: "reference_data_missing",
    });
  });

  it("still waits for the payments: the invoice's amount is every line", () => {
    expect(
      vendorPaymentPlan(auditor(7500_00, { paidPaise: 8000_00 }))
    ).toMatchObject({ kind: "wait", reason: "invoice_exceeds_payments" });
  });
});

describe("allocateProvision", () => {
  const opening = {
    economicOn: "2026-04-01",
    forYear: "2025-26",
    signedPaise: 7500_00,
  };
  const a = { claimPaise: 5000_00, id: "a", on: "2026-06-01" };
  const b = { claimPaise: 5000_00, id: "b", on: "2026-07-01" };

  it("gives an earlier invoice priority, whatever order the claims come in", () => {
    const expected = new Map([
      ["a", 5000_00],
      ["b", 2500_00],
    ]);
    expect(allocateProvision([opening], [a, b])).toEqual(expected);
    expect(new Map([...allocateProvision([opening], [b, a])].sort())).toEqual(
      expected
    );
  });

  it("orders invoices of one day by ID", () => {
    const sameDay = [
      { ...b, id: "z", on: a.on },
      { ...a, id: "m" },
    ];
    expect(allocateProvision([opening], sameDay)).toEqual(
      new Map([
        ["m", 5000_00],
        ["z", 2500_00],
      ])
    );
  });

  it("takes only what is provided on or before the invoice's day", () => {
    const audited = {
      economicOn: "2027-03-31",
      forYear: "2026-27",
      signedPaise: 6000_00,
    };
    const c = { claimPaise: 9000_00, id: "c", on: "2027-05-01" };
    expect(allocateProvision([opening, audited], [a, b, c])).toEqual(
      new Map([
        ["a", 5000_00],
        ["b", 2500_00],
        ["c", 6000_00],
      ])
    );
  });

  it("frees what a base invoice took from its reversal day, not before", () => {
    // A voided invoice that posted on a frozen day stays in the base as
    // it stands: its posting, and its reversal on the void day.
    const voided = [
      { economicOn: "2026-05-01", forYear: null, signedPaise: -7500_00 },
      { economicOn: "2026-06-15", forYear: null, signedPaise: 7500_00 },
    ];
    expect(allocateProvision([opening, ...voided], [a, b])).toEqual(
      new Map([
        ["a", 0],
        ["b", 5000_00],
      ])
    );
  });

  it("says what is outstanding today and the years it is from", () => {
    const audited = {
      economicOn: "2027-03-31",
      forYear: "2026-27",
      signedPaise: 6000_00,
    };
    expect(provisionOutstanding([opening], [], "2026-10-16")).toEqual({
      paise: 7500_00,
      years: ["2025-26"],
    });
    expect(provisionOutstanding([opening], [a], "2026-10-16")).toEqual({
      paise: 2500_00,
      years: ["2025-26"],
    });
    expect(provisionOutstanding([opening, audited], [a], "2027-04-10")).toEqual(
      { paise: 8500_00, years: ["2025-26", "2026-27"] }
    );
    expect(
      provisionOutstanding([opening, audited], [a, b], "2027-04-10")
    ).toEqual({ paise: 6000_00, years: ["2026-27"] });
    expect(provisionOutstanding([opening], [a, b], "2026-10-16")).toEqual({
      paise: 0,
      years: [],
    });
    // An audited figures entry is a difference: the amount alone.
    expect(
      provisionOutstanding(
        [opening, { ...audited, fromAudited: true }],
        [a],
        "2027-04-10"
      )
    ).toEqual({ paise: 8500_00, years: [] });
  });
});
