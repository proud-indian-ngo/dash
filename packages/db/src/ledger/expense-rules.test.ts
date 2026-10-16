import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";

import { expenseHeadCode } from "./expense-heads";
import {
  invoiceAcceptedDay,
  payingAccount,
  type ReimbursementFacts,
  reimbursementPlan,
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

const claim = (over: Partial<ReimbursementFacts> = {}): ReimbursementFacts => ({
  activeBankAccountIds: [BANK],
  approvedOn: "2026-06-03",
  mainAccountId: null,
  charge: {
    chargedProgrammeId: PROGRAMME,
    chargedProjectId: PROJECT,
    chargedTo: "programme",
    eventId: null,
    eventProgrammeId: null,
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
    eventId: EVENT,
    eventProgrammeId: EVENT_PROGRAMME,
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
  id: "00000000-0000-7000-8000-000000000c01",
  mainAccountId: null,
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

const ASSET_HEADS = new Set<string>([LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances]);

/**
 * Assets move by what the funds move by: money and asset heads on one side,
 * expenses (here every other head) on the other, so the balance summary
 * stays balanced.
 */
const isBalanced = (plan: SourcePlan) => {
  let assets = 0;
  let funds = 0;
  for (const p of posted(plan).parts) {
    for (const m of p.movements) {
      assets += m.direction === "in" ? m.amountPaise : -m.amountPaise;
    }
    for (const e of p.entries) {
      const signed = e.effect === "increase" ? e.amountPaise : -e.amountPaise;
      if (ASSET_HEADS.has(e.accountHeadId)) {
        assets += signed;
      } else {
        funds -= signed;
      }
    }
  }
  return assets === funds;
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
    expect(part(plan, "cash")?.movements).toEqual([
      {
        amountPaise: 42_500,
        direction: "out",
        kind: "payout",
        memo: "Class outing (paid to Ravi Kumar)",
        orgAccountId: BANK,
      },
    ]);
  });

  it("names the claimant on the payout, so a claimant change reposts it", () => {
    const memo = (over: Partial<ReimbursementFacts>) =>
      part(reimbursementPlan(claim(over)), "cash")?.movements[0]?.memo;
    expect(memo({ claimantName: "Meena S" })).toBe(
      "Class outing (paid to Meena S)"
    );
    // The recognition doesn't change with the claimant.
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
          eventId: EVENT,
          eventProgrammeId: EVENT_PROGRAMME,
        },
      })
    );
    expect(part(toEvent, "recognise")?.entries[0]).toMatchObject({
      eventId: EVENT,
      programmeId: EVENT_PROGRAMME,
      projectId: null,
    });
    const admin = reimbursementPlan(
      claim({
        charge: {
          chargedProgrammeId: null,
          chargedProjectId: null,
          chargedTo: "organisation",
          eventId: null,
          eventProgrammeId: null,
        },
      })
    );
    expect(part(admin, "recognise")?.entries[0]).toMatchObject({
      eventId: null,
      programmeId: null,
      projectId: null,
    });
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
    expect(reimbursementPlan(claim({ hasPaymentProof: false }))).toEqual({
      economicOn: "2026-06-03",
      kind: "wait",
      reason: "no_payment_proof",
    });
    expect(
      reimbursementPlan(claim({ approvedOn: null, hasPaymentProof: false }))
    ).toEqual({
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
    ).toEqual({
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
          eventId: null,
          eventProgrammeId: null,
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
      expect(vendorPaymentPlan(request({ paidPaise }))).toEqual({
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
    ).toEqual({
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

describe("vendorPaymentTransactionPlan", () => {
  it("takes an approved payment out of the bank on its date as a supplier advance", () => {
    const plan = vendorPaymentTransactionPlan(payment());
    validParts(plan);
    expect(isBalanced(plan)).toBe(true);
    expect(posted(plan).parts).toEqual([
      {
        action: "recognise",
        economicOn: "2026-07-10",
        entries: [
          {
            accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
            amountPaise: 250_000,
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
    ).toEqual({
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
