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
  paidPaise: 0,
  status: "completed",
  title: "Bus for the event",
  vendorId: VENDOR,
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

describe("reimbursementPlan", () => {
  it("posts an expense per line and one payment out of the bank on the approval day", () => {
    const plan = reimbursementPlan(claim());
    validParts(plan);
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
        memo: "Class outing",
        orgAccountId: BANK,
      },
    ]);
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
    expect(reimbursementPlan(claim({ approvedOn: null }))).toEqual({
      economicOn: null,
      kind: "wait",
      reason: "no_payment_proof",
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
    expect(posted(plan).parts.map((p) => p.action)).toEqual(["recognise"]);
    expect(posted(plan).economicOn).toBe("2026-07-20");
    expect(part(plan, "recognise")?.entries).toEqual([
      {
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
      },
    ]);
  });

  it("clears the supplier advance its payments made when the invoice is accepted", () => {
    const plan = vendorPaymentPlan(request({ paidPaise: 250_000 }));
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
