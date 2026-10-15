import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";

import { buildOpeningPosting } from "./opening-balance";
import {
  assertTransfersNetZero,
  LedgerError,
  type MovementInput,
  postingDates,
  validatePostingInput,
} from "./rules";

const base = {
  action: "post",
  economicOn: "2026-04-10",
  entries: [],
  movements: [
    {
      amountPaise: 100,
      direction: "in" as const,
      kind: "receipt" as const,
      orgAccountId: "bank",
    },
  ],
  sourceId: "00000000-0000-7000-8000-000000000001",
  sourceType: "test",
};

const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof LedgerError ? error.code : "other";
  }
  return null;
};

describe("validatePostingInput", () => {
  it("accepts a well-formed posting", () => {
    expect(codeOf(() => validatePostingInput(base))).toBeNull();
  });

  it("refuses empty postings, zero or fractional amounts and bad dates", () => {
    expect(codeOf(() => validatePostingInput({ ...base, movements: [] }))).toBe(
      "empty"
    );
    for (const amountPaise of [0, -5, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      expect(
        codeOf(() =>
          validatePostingInput({
            ...base,
            movements: [{ ...base.movements[0], amountPaise } as MovementInput],
          })
        )
      ).toBe("invalid_amount");
    }
    expect(
      codeOf(() => validatePostingInput({ ...base, economicOn: "2026-02-31" }))
    ).toBe("invalid_date");
  });

  it("never posts anything dated before the cutover", () => {
    expect(
      codeOf(() => validatePostingInput({ ...base, economicOn: "2026-03-31" }))
    ).toBe("before_cutover");
  });

  it("collects every date the posting touches", () => {
    expect(
      postingDates({
        ...base,
        movements: [
          { ...base.movements[0], occurredOn: "2026-05-01" },
        ] as MovementInput[],
      })
    ).toEqual(["2026-04-10", "2026-05-01"]);
  });
});

describe("assertTransfersNetZero", () => {
  const leg = (
    orgAccountId: string,
    direction: "in" | "out",
    amountPaise: number,
    transferId = "t1"
  ): MovementInput => ({
    amountPaise,
    direction,
    kind: "transfer",
    orgAccountId,
    transferId,
  });

  it("accepts linked legs that net to zero across accounts", () => {
    expect(
      codeOf(() =>
        assertTransfersNetZero([leg("bank", "out", 500), leg("fd", "in", 500)])
      )
    ).toBeNull();
  });

  it("refuses legs that don't net to zero, stay in one account or lack a link", () => {
    expect(
      codeOf(() =>
        assertTransfersNetZero([leg("bank", "out", 500), leg("fd", "in", 400)])
      )
    ).toBe("transfer_not_zero");
    expect(
      codeOf(() =>
        assertTransfersNetZero([leg("bank", "out", 5), leg("bank", "in", 5)])
      )
    ).toBe("transfer_not_zero");
    expect(
      codeOf(() =>
        assertTransfersNetZero([{ ...leg("bank", "out", 5), transferId: null }])
      )
    ).toBe("transfer_not_zero");
  });
});

describe("buildOpeningPosting", () => {
  const lines = [
    { amountPaise: 900, kind: "account" as const, orgAccountId: "bank" },
    { amountPaise: 100, kind: "account" as const, orgAccountId: "fd" },
    { amountPaise: 30, kind: "asset" as const, memo: " Sewing machine " },
    { amountPaise: 10, kind: "liability" as const },
    { amountPaise: 20, fundId: "corpus", kind: "fund" as const },
    { amountPaise: 1000, fundId: GENERAL_FUND_ID, kind: "fund" as const },
  ];

  it("turns accounts into opening movements and the rest into entries", () => {
    const posting = buildOpeningPosting({ id: "doc", lines }, "2026-04-01");
    expect(posting.movements).toEqual([
      expect.objectContaining({
        amountPaise: 900,
        direction: "in",
        kind: "opening",
        occurredOn: "2026-04-01",
        orgAccountId: "bank",
      }),
      expect.objectContaining({ amountPaise: 100, orgAccountId: "fd" }),
    ]);
    expect(
      posting.entries.map((e) => [
        e.accountHeadId,
        e.fundId,
        e.amountPaise,
        e.memo,
      ])
    ).toEqual([
      [
        LEDGER_ACCOUNT_HEAD_IDS.fixedAssets,
        GENERAL_FUND_ID,
        30,
        "Sewing machine",
      ],
      [LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable, GENERAL_FUND_ID, 10, null],
      [LEDGER_ACCOUNT_HEAD_IDS.fundBalance, "corpus", 20, null],
      [LEDGER_ACCOUNT_HEAD_IDS.fundBalance, GENERAL_FUND_ID, 1000, null],
    ]);
    expect(posting.entries.every((e) => e.effect === "increase")).toBe(true);
    expect(posting).toMatchObject({
      action: "post",
      sourceId: "doc",
      sourceType: "opening_balance",
    });
  });

  it("refuses opening balances that don't balance", () => {
    expect(
      codeOf(() =>
        buildOpeningPosting(
          { id: "doc", lines: lines.slice(0, 5) },
          "2026-04-01"
        )
      )
    ).toBe("unbalanced");
  });

  it("refuses an account or fund entered twice", () => {
    expect(
      codeOf(() =>
        buildOpeningPosting(
          { id: "doc", lines: [...lines, lines[0] as (typeof lines)[number]] },
          "2026-04-01"
        )
      )
    ).toBe("invalid");
  });
});
