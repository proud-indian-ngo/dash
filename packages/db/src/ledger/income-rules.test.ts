import {
  CORPUS_FUND_ID,
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";

import {
  type ContributionFacts,
  contributionPlan,
  type OtherIncomeFacts,
  otherIncomePlan,
  type RefundFacts,
  refundPlan,
  type SettlementFacts,
  settlementPlan,
  type SourcePlan,
  type StatementTransferFacts,
  statementTransferPlan,
} from "./income-rules";
import { assertTransfersNetZero } from "./rules";

const H = LEDGER_ACCOUNT_HEAD_IDS;
const BANK = "00000000-0000-7000-8000-00000000b001";
const FD = "00000000-0000-7000-8000-00000000b002";
const RZP = "00000000-0000-7000-8000-00000000c001";
const GIVEDO = "00000000-0000-7000-8000-00000000c002";

const gift = (over: Partial<ContributionFacts> = {}): ContributionFacts => ({
  amountPaise: 100_000,
  channel: "upi",
  donationType: "voluntary",
  fundId: GENERAL_FUND_ID,
  gatewayFeePaise: 0,
  gatewayTaxPaise: 0,
  id: "00000000-0000-7000-8000-000000000a01",
  orgAccountId: BANK,
  partyId: "00000000-0000-7000-8000-000000000d01",
  programmeId: "00000000-0000-7000-8000-000000000e01",
  projectId: null,
  receivedOn: "2026-05-10",
  reference: "UTR1",
  settledBankOn: null,
  status: "received",
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

/** Net effect on each account of a plan's movements. */
const balances = (plans: SourcePlan[]) => {
  const out = new Map<string, number>();
  for (const plan of plans) {
    if (plan.kind !== "post") {
      continue;
    }
    for (const p of plan.parts) {
      for (const m of p.movements) {
        out.set(
          m.orgAccountId,
          (out.get(m.orgAccountId) ?? 0) +
            (m.direction === "in" ? m.amountPaise : -m.amountPaise)
        );
      }
    }
  }
  return out;
};

describe("contributions", () => {
  it("posts a direct gift as income and money into its account", () => {
    const plan = posted(contributionPlan(gift()));
    expect(plan.economicOn).toBe("2026-05-10");
    expect(part(plan, "recognise")?.entries).toEqual([
      expect.objectContaining({
        accountHeadId: H.donationsReceived,
        amountPaise: 100_000,
        effect: "increase",
        programmeId: "00000000-0000-7000-8000-000000000e01",
      }),
    ]);
    expect(part(plan, "cash")?.movements).toEqual([
      expect.objectContaining({
        amountPaise: 100_000,
        direction: "in",
        kind: "receipt",
        orgAccountId: BANK,
      }),
    ]);
  });

  it("posts a Razorpay gift gross, with its fee and GST as an expense out of clearing", () => {
    const plan = posted(
      contributionPlan(
        gift({
          channel: "razorpay",
          gatewayFeePaise: 2000,
          gatewayTaxPaise: 360,
          orgAccountId: RZP,
        })
      )
    );
    const entries = part(plan, "recognise")?.entries ?? [];
    expect(entries.map((e) => [e.accountHeadId, e.amountPaise])).toEqual([
      [H.donationsReceived, 100_000],
      [H.gatewayCharges, 2360],
    ]);
    expect(balances([plan]).get(RZP)).toBe(100_000 - 2360);
    expect(part(plan, "cash")?.movements.map((m) => m.kind)).toEqual([
      "receipt",
      "fee",
    ]);
  });

  it("posts no fee at a give.do gift: its charges post with the payout", () => {
    const plan = posted(
      contributionPlan(
        gift({
          channel: "give_do",
          gatewayFeePaise: 5000,
          orgAccountId: GIVEDO,
        })
      )
    );
    expect(part(plan, "recognise")?.entries).toHaveLength(1);
    expect(balances([plan]).get(GIVEDO)).toBe(100_000);
  });

  it("posts an in-kind gift as in-kind income and an equal consumption, with no money", () => {
    const plan = posted(
      contributionPlan(gift({ channel: "in_kind", orgAccountId: null }))
    );
    expect(plan.parts.map((p) => p.action)).toEqual(["recognise"]);
    expect(
      part(plan, "recognise")?.entries.map((e) => [
        e.accountHeadId,
        e.effect,
        e.medium,
        e.amountPaise,
      ])
    ).toEqual([
      [H.inKindDonations, "increase", "in_kind", 100_000],
      [H.inKindConsumed, "increase", "in_kind", 100_000],
    ]);
  });

  it("posts nothing for a reversed gift", () => {
    expect(contributionPlan(gift({ status: "reversed" }))).toEqual({
      kind: "none",
      reason: "not_received",
    });
  });

  it("posts nothing for a pending gift", () => {
    expect(contributionPlan(gift({ status: "pending" }))).toEqual({
      kind: "none",
      reason: "not_received",
    });
  });

  it("posts nothing dated before the cutover", () => {
    expect(contributionPlan(gift({ receivedOn: "2026-03-31" }))).toEqual({
      kind: "none",
      reason: "before_cutover",
    });
  });

  it("posts a gateway gift captured 30 Mar and settled 2 Apr on 2 Apr", () => {
    const plan = posted(
      contributionPlan(
        gift({
          channel: "razorpay",
          orgAccountId: RZP,
          receivedOn: "2026-03-30",
          settledBankOn: "2026-04-02",
        })
      )
    );
    expect(plan.economicOn).toBe("2026-04-02");
    expect(plan.parts.every((p) => p.economicOn === "2026-04-02")).toBe(true);
  });

  it("posts nothing for a gateway gift captured 30 Mar and settled 31 Mar", () => {
    expect(
      contributionPlan(
        gift({
          channel: "razorpay",
          orgAccountId: RZP,
          receivedOn: "2026-03-30",
          settledBankOn: "2026-03-31",
        })
      )
    ).toEqual({ kind: "none", reason: "before_cutover" });
  });

  it("keeps the cutover exception to gateway gifts", () => {
    expect(
      contributionPlan(
        gift({ receivedOn: "2026-03-30", settledBankOn: "2026-04-02" })
      ).kind
    ).toBe("none");
  });

  it("posts nothing for a deleted gift", () => {
    expect(contributionPlan(null)).toEqual({ kind: "none", reason: "deleted" });
  });
});

describe("corpus gifts", () => {
  const corpus = (over: Partial<ContributionFacts> = {}) =>
    gift({
      donationType: "corpus",
      fundId: CORPUS_FUND_ID,
      programmeId: null,
      ...over,
    });
  const lines = (plan: SourcePlan) =>
    (part(plan, "recognise")?.entries ?? []).map((e) => [
      e.accountHeadId,
      e.fundId,
      e.effect,
      e.amountPaise,
    ]);

  it("credits a corpus gift to the Corpus Fund directly, never as income", () => {
    const plan = posted(contributionPlan(corpus()));
    expect(lines(plan)).toEqual([
      [H.corpusDonations, CORPUS_FUND_ID, "increase", 100_000],
    ]);
    expect(
      plan.parts.flatMap((p) => p.entries).map((e) => e.accountHeadId)
    ).not.toContain(H.donationsReceived);
    expect(balances([plan]).get(BANK)).toBe(100_000);
  });

  it("credits the Corpus Fund even when the gift was recorded against another fund", () => {
    const plan = posted(contributionPlan(corpus({ fundId: GENERAL_FUND_ID })));
    expect(lines(plan)).toEqual([
      [H.corpusDonations, CORPUS_FUND_ID, "increase", 100_000],
    ]);
  });

  it("keeps the gross in the Corpus Fund and posts the Razorpay fee as General Fund expenditure", () => {
    const plan = posted(
      contributionPlan(
        corpus({
          channel: "razorpay",
          gatewayFeePaise: 2000,
          gatewayTaxPaise: 360,
          orgAccountId: RZP,
        })
      )
    );
    expect(lines(plan)).toEqual([
      [H.corpusDonations, CORPUS_FUND_ID, "increase", 100_000],
      [H.gatewayCharges, GENERAL_FUND_ID, "increase", 2360],
    ]);
    expect(balances([plan]).get(RZP)).toBe(100_000 - 2360);
  });

  it("reduces the Corpus Fund on a refund", () => {
    const plan = posted(
      refundPlan({
        amountPaise: 40_000,
        gift: {
          channel: "neft",
          donationType: "corpus",
          fundId: CORPUS_FUND_ID,
          orgAccountId: BANK,
          partyId: "00000000-0000-7000-8000-000000000d01",
          programmeId: null,
          projectId: null,
        },
        id: "00000000-0000-7000-8000-000000000f11",
        reference: null,
        refundedOn: "2026-05-20",
        settledBankOn: null,
      })
    );
    expect(lines(plan)).toEqual([
      [H.corpusDonations, CORPUS_FUND_ID, "decrease", 40_000],
    ]);
  });

  it("posts give.do charges on a corpus gift as General Fund expenditure at the payout", () => {
    const plan = posted(
      settlementPlan({
        activeBankAccountIds: [BANK],
        amountPaise: 95_000,
        bankLine: null,
        clearingAccountId: GIVEDO,
        id: "00000000-0000-7000-8000-000000000f12",
        items: [
          {
            feePaise: 5000,
            gift: {
              donationType: "corpus",
              fundId: CORPUS_FUND_ID,
              partyId: "00000000-0000-7000-8000-000000000d02",
              programmeId: null,
              projectId: null,
            },
            giftChargesPaise: 5000,
            refundLinked: false,
            taxPaise: 0,
            type: "payment",
          },
        ],
        postedBankAccountId: null,
        provider: "give_do",
        settledOn: "2026-05-12",
        settlementFeePaise: null,
        settlementTaxPaise: null,
        status: "processed",
        utr: null,
      })
    );
    expect(lines(plan)).toEqual([
      [H.gatewayCharges, GENERAL_FUND_ID, "increase", 5000],
    ]);
  });
});

describe("refunds", () => {
  const refund = (over: Partial<RefundFacts> = {}): RefundFacts => ({
    amountPaise: 40_000,
    gift: {
      channel: "razorpay",
      donationType: "voluntary",
      fundId: GENERAL_FUND_ID,
      orgAccountId: RZP,
      partyId: "00000000-0000-7000-8000-000000000d01",
      programmeId: "00000000-0000-7000-8000-000000000e01",
      projectId: null,
    },
    id: "00000000-0000-7000-8000-000000000f01",
    reference: "rfnd_1",
    refundedOn: "2026-05-20",
    settledBankOn: null,
    ...over,
  });

  it("reduces donation income with the gift's dimensions and pays out of its account", () => {
    const plan = posted(refundPlan(refund()));
    expect(plan.economicOn).toBe("2026-05-20");
    expect(part(plan, "recognise")?.entries).toEqual([
      expect.objectContaining({
        accountHeadId: H.donationsReceived,
        amountPaise: 40_000,
        effect: "decrease",
        programmeId: "00000000-0000-7000-8000-000000000e01",
      }),
    ]);
    expect(part(plan, "cash")?.movements).toEqual([
      expect.objectContaining({
        direction: "out",
        kind: "refund",
        orgAccountId: RZP,
      }),
    ]);
  });

  it("posts nothing for a refund before the cutover", () => {
    expect(refundPlan(refund({ refundedOn: "2026-03-15" })).kind).toBe("none");
    expect(
      refundPlan(
        refund({ refundedOn: "2026-03-15", settledBankOn: "2026-03-20" })
      ).kind
    ).toBe("none");
  });

  it("posts a gateway refund of 31 Mar taken back by a 2 Apr payout on 2 Apr", () => {
    const plan = posted(
      refundPlan(
        refund({ refundedOn: "2026-03-31", settledBankOn: "2026-04-02" })
      )
    );
    expect(plan.economicOn).toBe("2026-04-02");
  });
});

describe("other income", () => {
  const income = (over: Partial<OtherIncomeFacts> = {}): OtherIncomeFacts => ({
    accountKind: "bank",
    amountPaise: 3817_00,
    fundId: GENERAL_FUND_ID,
    id: "00000000-0000-7000-8000-000000000f02",
    kind: "interest",
    orgAccountId: BANK,
    receivedOn: "2026-06-30",
    ...over,
  });

  it("posts interest as FD interest", () => {
    const plan = posted(otherIncomePlan(income()));
    expect(part(plan, "recognise")?.entries[0]?.accountHeadId).toBe(
      H.fdInterest
    );
    expect(balances([plan]).get(BANK)).toBe(3817_00);
  });

  it("posts anything credited to a fixed deposit as FD interest", () => {
    const plan = posted(
      otherIncomePlan(
        income({ accountKind: "deposit", kind: "misc", orgAccountId: FD })
      )
    );
    expect(part(plan, "recognise")?.entries[0]?.accountHeadId).toBe(
      H.fdInterest
    );
  });

  it("posts other kinds as other income", () => {
    const plan = posted(otherIncomePlan(income({ kind: "grant_return" })));
    expect(part(plan, "recognise")?.entries[0]?.accountHeadId).toBe(
      H.otherIncome
    );
  });
});

describe("gateway settlements", () => {
  const settlement = (
    over: Partial<SettlementFacts> = {}
  ): SettlementFacts => ({
    activeBankAccountIds: [BANK],
    amountPaise: 97_640,
    bankLine: null,
    clearingAccountId: RZP,
    id: "00000000-0000-7000-8000-000000000f03",
    postedBankAccountId: null,
    items: [
      {
        feePaise: 2000,
        gift: {
          donationType: "voluntary",
          fundId: GENERAL_FUND_ID,
          partyId: "00000000-0000-7000-8000-000000000d01",
          programmeId: null,
          projectId: null,
        },
        giftChargesPaise: 2360,
        refundLinked: false,
        taxPaise: 360,
        type: "payment",
      },
    ],
    provider: "razorpay",
    settledOn: "2026-05-12",
    settlementFeePaise: null,
    settlementTaxPaise: null,
    status: "processed",
    utr: "UTR9",
    ...over,
  });

  it("moves the net out of clearing into the single bank account, netting to zero", () => {
    const plan = posted(settlementPlan(settlement()));
    expect(plan.economicOn).toBe("2026-05-12");
    const cash = part(plan, "cash")?.movements ?? [];
    expect(cash.map((m) => [m.orgAccountId, m.direction, m.kind])).toEqual([
      [RZP, "out", "transfer"],
      [BANK, "in", "transfer"],
    ]);
    expect(() => assertTransfersNetZero(cash)).not.toThrow();
    expect(part(plan, "recognise")).toBeUndefined();
  });

  it("uses the matched bank line's account and date", () => {
    const plan = posted(
      settlementPlan(
        settlement({
          activeBankAccountIds: [BANK, FD],
          bankLine: { orgAccountId: BANK, valueOn: "2026-05-13" },
        })
      )
    );
    expect(plan.economicOn).toBe("2026-05-13");
  });

  it("waits for the bank account when several are active and no line is matched", () => {
    expect(
      settlementPlan(
        settlement({
          activeBankAccountIds: [BANK, "00000000-0000-7000-8000-0000000000b9"],
        })
      )
    ).toEqual({
      economicOn: "2026-05-12",
      kind: "wait",
      reason: "pick_bank_account",
    });
  });

  it("keeps a posted payout's bank account when another bank account is added", () => {
    const plan = posted(
      settlementPlan(
        settlement({
          activeBankAccountIds: [BANK, "00000000-0000-7000-8000-0000000000b9"],
          postedBankAccountId: BANK,
        })
      )
    );
    expect(balances([plan]).get(BANK)).toBe(97_640);
  });

  it("posts a Razorpay line's charges at the payout when its gift was recorded with none", () => {
    const base = settlement();
    const [item] = base.items;
    const plan = posted(
      settlementPlan({
        ...base,
        items: item ? [{ ...item, giftChargesPaise: 0 }] : [],
      })
    );
    expect(part(plan, "recognise")?.entries).toEqual([
      expect.objectContaining({
        accountHeadId: H.gatewayCharges,
        amountPaise: 2360,
        memo: "Razorpay charges",
      }),
    ]);
    // The gift (no fee recorded) in, its charges and the net out: zero.
    const giftPlan = contributionPlan(
      gift({ channel: "razorpay", orgAccountId: RZP })
    );
    expect(balances([giftPlan, plan]).get(RZP)).toBe(0);
  });

  it("posts an instant settlement fee as an expense out of clearing", () => {
    const plan = posted(
      settlementPlan(
        settlement({ settlementFeePaise: 500, settlementTaxPaise: 90 })
      )
    );
    expect(part(plan, "recognise")?.entries).toEqual([
      expect.objectContaining({
        accountHeadId: H.gatewayCharges,
        amountPaise: 590,
      }),
    ]);
    expect(balances([plan]).get(RZP)).toBe(-(97_640 + 590));
  });

  it("posts give.do charges per linked gift at the payout, and counts lines it can't use", () => {
    const giveDo = settlement({
      amountPaise: 95_000,
      clearingAccountId: GIVEDO,
      items: [
        {
          feePaise: 5000,
          gift: {
            donationType: "voluntary",
            fundId: GENERAL_FUND_ID,
            partyId: "00000000-0000-7000-8000-000000000d02",
            programmeId: "00000000-0000-7000-8000-000000000e02",
            projectId: null,
          },
          giftChargesPaise: 5000,
          refundLinked: false,
          taxPaise: 0,
          type: "payment",
        },
        {
          feePaise: 100,
          gift: null,
          giftChargesPaise: 0,
          refundLinked: false,
          taxPaise: 0,
          type: "payment",
        },
        {
          feePaise: 0,
          gift: null,
          giftChargesPaise: 0,
          refundLinked: false,
          taxPaise: 0,
          type: "adjustment",
        },
      ],
      provider: "give_do",
    });
    const plan = posted(settlementPlan(giveDo));
    expect(plan.attention).toBe(2);
    expect(part(plan, "recognise")?.entries).toEqual([
      expect.objectContaining({
        accountHeadId: H.gatewayCharges,
        amountPaise: 5000,
        programmeId: "00000000-0000-7000-8000-000000000e02",
      }),
    ]);
    // Gift 1,000 in, charges 50 out, net 950 paid out: clearing at zero.
    const giftPlan = contributionPlan(
      gift({ channel: "give_do", orgAccountId: GIVEDO })
    );
    expect(balances([giftPlan, plan]).get(GIVEDO)).toBe(0);
  });

  it("posts nothing before processing or before the cutover", () => {
    expect(settlementPlan(settlement({ status: "created" })).kind).toBe("none");
    expect(settlementPlan(settlement({ settledOn: "2026-03-31" })).kind).toBe(
      "none"
    );
  });

  it("keeps Razorpay clearing at zero across a gift, its refund and its settlement", () => {
    const rzpGift = contributionPlan(
      gift({
        channel: "razorpay",
        gatewayFeePaise: 2000,
        gatewayTaxPaise: 360,
        orgAccountId: RZP,
      })
    );
    const rzpRefund = refundPlan({
      amountPaise: 10_000,
      gift: {
        channel: "razorpay",
        donationType: "voluntary",
        fundId: GENERAL_FUND_ID,
        orgAccountId: RZP,
        partyId: "00000000-0000-7000-8000-000000000d01",
        programmeId: null,
        projectId: null,
      },
      id: "00000000-0000-7000-8000-000000000f09",
      reference: null,
      refundedOn: "2026-05-11",
      settledBankOn: null,
    });
    const payout = settlementPlan(settlement({ amountPaise: 97_640 - 10_000 }));
    expect(balances([rzpGift, rzpRefund, payout]).get(RZP)).toBe(0);
  });
});

describe("transfers between own accounts", () => {
  const line = (
    over: Partial<StatementTransferFacts> = {}
  ): StatementTransferFacts => ({
    amountPaise: 700_000_00,
    counterpart: null,
    direction: "debit",
    id: "00000000-0000-7000-8000-000000000f04",
    isTransfer: true,
    orgAccountId: BANK,
    other: { id: FD, kind: "deposit" },
    reference: null,
    valueOn: "2026-07-01",
    ...over,
  });

  it("posts both legs once the other account is picked", () => {
    const plan = posted(statementTransferPlan(line()));
    expect(balances([plan])).toEqual(
      new Map([
        [BANK, -700_000_00],
        [FD, 700_000_00],
      ])
    );
  });

  it("posts a maturity credited to the bank as money back from the FD", () => {
    const plan = posted(statementTransferPlan(line({ direction: "credit" })));
    expect(balances([plan]).get(FD)).toBe(-700_000_00);
  });

  it("waits for the other account", () => {
    expect(statementTransferPlan(line({ other: null })).kind).toBe("wait");
  });

  it("posts a bank-to-bank transfer from whichever side was marked first, never both", () => {
    const otherBank = {
      id: "00000000-0000-7000-8000-0000000000b9",
      kind: "bank",
    };
    // Only the credit side is marked: it posts.
    expect(
      statementTransferPlan(
        line({ counterpart: null, direction: "credit", other: otherBank })
      ).kind
    ).toBe("post");
    // Both marked: the first posts, the second doesn't.
    expect(
      statementTransferPlan(
        line({
          counterpart: { thisMarkedFirst: true },
          direction: "credit",
          other: otherBank,
        })
      ).kind
    ).toBe("post");
    expect(
      statementTransferPlan(
        line({ counterpart: { thisMarkedFirst: false }, other: otherBank })
      )
    ).toEqual({ kind: "none", reason: "other_side_posts" });
  });

  it("posts nothing once unmatched", () => {
    expect(statementTransferPlan(line({ isTransfer: false }))).toEqual({
      kind: "none",
      reason: "unmatched",
    });
  });
});
