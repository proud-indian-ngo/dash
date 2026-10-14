import { describe, expect, it } from "bun:test";

import { positionsFor, statementLineHashes } from "./identity";
import {
  candidateWindow,
  GIVEINDIA_DISMISS_KEY,
  type LineToMatch,
  lineHasUtr,
  planStatementMatches,
  referenceIsFromNarration,
  sameReference,
} from "./match";
import type { NormalizedStatementLine } from "./normalize";

const line = (overrides: Partial<LineToMatch> = {}): LineToMatch => ({
  amountPaise: 397_500,
  direction: "credit",
  dismissed: [],
  id: "line-1",
  narration: "NEFT CR-RAZORPAY SOFTWARE",
  reference: null,
  valueOn: "2026-10-16",
  ...overrides,
});

const settlement = {
  amountPaise: 397_500,
  id: "setl-1",
  settledOn: "2026-10-15",
  utr: "AXISCN0123456789",
};

const gift = {
  amountPaise: 500_000,
  id: "gift-1",
  receivedOn: "2026-10-14",
  reference: "UPI412345678901",
};

describe("settlement matching", () => {
  it("matches on the UTR in the reference or the narration with the same amount", () => {
    for (const candidate of [
      line({ reference: "AXISCN0123456789" }),
      line({ narration: "NEFT CR-AXISCN0123456789-RAZORPAY" }),
    ]) {
      const plans = planStatementMatches({
        contributions: [],
        lines: [candidate],
        settlements: [{ ...settlement, settledOn: "2026-09-01" }],
      });
      expect(plans.get("line-1")).toEqual({
        kind: "match",
        target: { kind: "settlement", reason: "utr", targetId: "setl-1" },
      });
    }
  });

  it("only suggests a UTR match whose amount differs", () => {
    const plans = planStatementMatches({
      contributions: [],
      lines: [line({ amountPaise: 1, reference: "AXISCN0123456789" })],
      settlements: [settlement],
    });
    expect(plans.get("line-1")).toEqual({
      kind: "suggest",
      target: { kind: "settlement", reason: "utr", targetId: "setl-1" },
    });
  });

  it("suggests the same amount within three days, closest first", () => {
    const plans = planStatementMatches({
      contributions: [],
      lines: [line()],
      settlements: [
        { ...settlement, id: "setl-far", settledOn: "2026-10-13", utr: null },
        { ...settlement, id: "setl-near", utr: null },
        { ...settlement, id: "setl-out", settledOn: "2026-10-10", utr: null },
      ],
    });
    expect(plans.get("line-1")).toEqual({
      kind: "suggest",
      target: {
        kind: "settlement",
        reason: "amount_date",
        targetId: "setl-near",
      },
    });
  });

  it("never matches again what the reviewer unmatched or turned down", () => {
    for (const [lineOverrides, settlements, contributions] of [
      [
        { dismissed: ["setl-1"], reference: "AXISCN0123456789" },
        [settlement],
        [],
      ],
      [
        {
          amountPaise: 500_000,
          dismissed: ["gift-1"],
          reference: "UPI412345678901",
          valueOn: "2026-10-15",
        },
        [],
        [gift],
      ],
    ] as const) {
      const plans = planStatementMatches({
        contributions,
        lines: [line(lineOverrides)],
        settlements,
      });
      expect(plans.get("line-1")).toEqual({ kind: "none" });
    }
  });

  it("matches a UTR only as a whole token", () => {
    const plans = planStatementMatches({
      contributions: [],
      lines: [line({ narration: "NEFT CR-XAXISCN0123456789-RAZORPAY" })],
      settlements: [settlement],
    });
    expect(plans.get("line-1")?.kind).not.toBe("match");
    const inReference = planStatementMatches({
      contributions: [],
      lines: [line({ reference: "NEFT/AXISCN0123456789/RAZORPAY" })],
      settlements: [settlement],
    });
    expect(inReference.get("line-1")?.kind).toBe("match");
  });

  it("does not suggest a settlement the reviewer turned down", () => {
    const plans = planStatementMatches({
      contributions: [],
      lines: [line({ dismissed: ["setl-1"] })],
      settlements: [{ ...settlement, utr: null }],
    });
    expect(plans.get("line-1")).toEqual({ kind: "none" });
  });

  it("gives each settlement to one line", () => {
    const plans = planStatementMatches({
      contributions: [],
      lines: [line({ id: "a" }), line({ id: "b" })],
      settlements: [{ ...settlement, utr: null }],
    });
    expect(plans.get("a")?.kind).toBe("suggest");
    expect(plans.get("b")).toEqual({ kind: "none" });
  });
});

describe("contribution matching", () => {
  const credit = line({
    amountPaise: 500_000,
    narration: "UPI-ASHA RAO",
    valueOn: "2026-10-16",
  });

  it("matches an equal reference with the same amount within three days", () => {
    const plans = planStatementMatches({
      contributions: [gift],
      lines: [{ ...credit, reference: "upi-412345678901" }],
      settlements: [],
    });
    expect(plans.get("line-1")).toEqual({
      kind: "match",
      target: {
        kind: "contribution",
        reason: "reference",
        targetId: "gift-1",
      },
    });
  });

  it("matches a reference token, but never on short or all-zero references", () => {
    const token = planStatementMatches({
      contributions: [{ ...gift, reference: "412345678901" }],
      lines: [{ ...credit, reference: "UPI/412345678901/ASHA" }],
      settlements: [],
    });
    expect(token.get("line-1")?.kind).toBe("match");
    for (const reference of ["0000", "123"]) {
      const weak = planStatementMatches({
        contributions: [{ ...gift, reference }],
        lines: [{ ...credit, reference }],
        settlements: [],
      });
      expect(weak.get("line-1")?.kind).toBe("suggest");
    }
  });

  it("suggests when one side has no reference, never when they differ", () => {
    const suggested = planStatementMatches({
      contributions: [gift],
      lines: [credit],
      settlements: [],
    });
    expect(suggested.get("line-1")).toEqual({
      kind: "suggest",
      target: {
        kind: "contribution",
        reason: "amount_date",
        targetId: "gift-1",
      },
    });
    const different = planStatementMatches({
      contributions: [gift],
      lines: [{ ...credit, reference: "UPI999999999999" }],
      settlements: [],
    });
    expect(different.get("line-1")).toEqual({ kind: "none" });
  });

  it("never lets a reference read from the narration rule a gift out", () => {
    // The file had no reference column: the reference came from the
    // narration (masked to its last four there) and may be the wrong token.
    const plans = planStatementMatches({
      contributions: [gift],
      lines: [
        {
          ...credit,
          narration: "UPI/••••8901/ASHA",
          reference: "999999998901",
        },
      ],
      settlements: [],
    });
    expect(plans.get("line-1")?.kind).toBe("suggest");
    expect(referenceIsFromNarration("999999998901", "UPI/••••8901/ASHA")).toBe(
      true
    );
    expect(
      referenceIsFromNarration("HDFCN52026101412", "NEFT CR-HDFCN52026101412-X")
    ).toBe(true);
    expect(referenceIsFromNarration("UPI999", "UPI/••••8901/ASHA")).toBe(false);
  });

  it("ignores contributions outside the window or of another amount", () => {
    const plans = planStatementMatches({
      contributions: [
        { ...gift, receivedOn: "2026-10-10" },
        { ...gift, amountPaise: 1, id: "gift-2" },
      ],
      lines: [credit],
      settlements: [],
    });
    expect(plans.get("line-1")).toEqual({ kind: "none" });
  });

  it("matches each contribution to one line only", () => {
    const plans = planStatementMatches({
      contributions: [gift],
      lines: [
        { ...credit, id: "a", reference: "UPI412345678901" },
        { ...credit, id: "b", reference: "UPI412345678901" },
      ],
      settlements: [],
    });
    expect(plans.get("a")?.kind).toBe("match");
    expect(plans.get("b")).toEqual({ kind: "none" });
  });

  it("never matches a debit", () => {
    const plans = planStatementMatches({
      contributions: [gift],
      lines: [{ ...credit, direction: "debit", reference: "UPI412345678901" }],
      settlements: [],
    });
    expect(plans.get("line-1")).toEqual({ kind: "none" });
  });
});

describe("give.do payouts", () => {
  it("suggests a give.do payout from the narration unless turned down", () => {
    const giveIndia = line({ narration: "NEFT CR-GIVEINDIA DONATION PAYOUT" });
    expect(
      planStatementMatches({
        contributions: [],
        lines: [giveIndia],
        settlements: [],
      }).get("line-1")
    ).toEqual({
      kind: "suggest",
      target: {
        kind: "giveindia_payout",
        reason: "giveindia_narration",
        targetId: null,
      },
    });
    expect(
      planStatementMatches({
        contributions: [],
        lines: [{ ...giveIndia, dismissed: [GIVEINDIA_DISMISS_KEY] }],
        settlements: [],
      }).get("line-1")
    ).toEqual({ kind: "none" });
  });
});

describe("helpers", () => {
  it("compares references by token, without punctuation or leading zeros", () => {
    expect(sameReference("000456789", "456789")).toBe(true);
    expect(sameReference("UTR: axis-1", "AXIS1")).toBe(false);
    expect(sameReference("axis-12", "AXIS12")).toBe(true);
    expect(sameReference("NEFT", "NEFT")).toBe(false);
    expect(sameReference("", "")).toBe(false);
  });

  it("finds a UTR as a whole token of the reference or narration", () => {
    expect(
      lineHasUtr({ narration: "X AXIS1234 Y", reference: null }, "AXIS1234")
    ).toBe(true);
    expect(
      lineHasUtr({ narration: "XAXIS1234Y", reference: null }, "AXIS1234")
    ).toBe(false);
    expect(lineHasUtr({ narration: "", reference: "UTR-1234" }, "1234")).toBe(
      true
    );
  });

  it("widens the window by three days each side", () => {
    expect(
      candidateWindow([{ valueOn: "2026-10-05" }, { valueOn: "2026-10-01" }])
    ).toEqual({ from: "2026-09-28", to: "2026-10-08" });
    expect(candidateWindow([])).toBeNull();
  });
});

describe("line identity", () => {
  const base: NormalizedStatementLine = {
    amountPaise: 50_000,
    balancePaise: null,
    direction: "credit",
    hashNarration: "UPI-ASHA",
    narration: "UPI-ASHA",
    reference: "",
    valueOn: "2026-10-01",
  };

  it("numbers identical lines within a file so both are kept", () => {
    const [a, b] = statementLineHashes("acc-1", [base, base]);
    expect(a).not.toBe(b);
  });

  it("hashes the same lines the same in an overlapping upload", () => {
    const later = {
      ...base,
      hashNarration: "RENT",
      narration: "RENT",
      valueOn: "2026-10-20",
    };
    const october = statementLineHashes("acc-1", [base, base, later]);
    const overlap = statementLineHashes("acc-1", [
      null,
      base,
      base,
      later,
      { ...later, valueOn: "2026-11-02" },
    ]);
    expect(overlap.slice(1, 4)).toEqual(october);
    expect(overlap[4]).not.toBe(october[2]);
  });

  it("tells lines apart by account, balance and folded narration", () => {
    const [plain] = statementLineHashes("acc-1", [base]);
    const [otherAccount] = statementLineHashes("acc-2", [base]);
    const [withBalance] = statementLineHashes("acc-1", [
      { ...base, balancePaise: 100 },
    ]);
    const [spaced] = statementLineHashes("acc-1", [
      { ...base, hashNarration: "upi-asha " },
    ]);
    expect(otherAccount).not.toBe(plain);
    expect(withBalance).not.toBe(plain);
    expect(spaced).toBe(plain);
    expect(plain?.startsWith("h1:")).toBe(true);
  });
});

describe("line identity and masking", () => {
  it("hashes the narration as printed, so lines that mask alike stay apart", () => {
    const line = (pan: string) => ({
      amountPaise: 50_000,
      balancePaise: null,
      direction: "credit" as const,
      hashNarration: `NEFT ${pan}`,
      narration: "NEFT ••••234F",
      reference: "",
      valueOn: "2026-10-01",
    });
    const [a, b] = statementLineHashes("acc-1", [
      line("ABCDE1234F"),
      line("ZYXWV1234F"),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("file order", () => {
  const row = (
    rowNumber: number,
    valueOn: string | null,
    money: {
      amountPaise?: number;
      balancePaise?: number | null;
      direction?: "credit" | "debit";
    } = {}
  ) => ({
    line: valueOn
      ? {
          amountPaise: money.amountPaise ?? 100,
          balancePaise: money.balancePaise ?? null,
          direction: money.direction ?? ("credit" as const),
          valueOn,
        }
      : null,
    record: { id: `r${rowNumber}`, rowNumber },
  });

  it("turns a newest-first file round and keeps a one-day file as given", () => {
    const newestFirst = positionsFor([
      row(1, null),
      row(2, "2026-10-05"),
      row(3, "2026-10-01"),
    ]);
    expect(newestFirst.get("r2")).toBeGreaterThan(newestFirst.get("r3") ?? 0);
    const oneDay = positionsFor([
      row(1, "2026-10-05"),
      row(2, "2026-10-05"),
      row(3, "2026-10-05"),
    ]);
    expect([oneDay.get("r1"), oneDay.get("r2"), oneDay.get("r3")]).toEqual([
      1, 2, 3,
    ]);
  });

  it("reads a one-day file's order from its running balances", () => {
    // Newest first: 1,500 after a 500 credit on 1,000, then 1,000.
    const newestFirst = positionsFor([
      row(1, "2026-10-05", { amountPaise: 50_000, balancePaise: 150_000 }),
      row(2, "2026-10-05", {
        amountPaise: 20_000,
        balancePaise: 100_000,
        direction: "debit",
      }),
      row(3, "2026-10-05", { amountPaise: 30_000, balancePaise: 120_000 }),
    ]);
    expect(newestFirst.get("r1")).toBe(3);
    expect(newestFirst.get("r3")).toBe(1);
    const oldestFirst = positionsFor([
      row(1, "2026-10-05", { amountPaise: 30_000, balancePaise: 120_000 }),
      row(2, "2026-10-05", {
        amountPaise: 20_000,
        balancePaise: 100_000,
        direction: "debit",
      }),
      row(3, "2026-10-05", { amountPaise: 50_000, balancePaise: 150_000 }),
    ]);
    expect(oldestFirst.get("r1")).toBe(1);
    expect(oldestFirst.get("r3")).toBe(3);
  });
});
