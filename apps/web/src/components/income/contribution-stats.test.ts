import { describe, expect, it } from "bun:test";

import { financialYearOf } from "@pi-dash/shared/income";

import {
  computeContributionYearStats,
  contributionsSignature,
  computeDonorGiving,
} from "./contribution-stats";

const fy = financialYearOf("2026-10-13");
const day = (iso: string) => Date.UTC(...isoParts(iso));
function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y ?? 0, (m ?? 1) - 1, d ?? 1];
}

const rows = [
  {
    amountPaise: 100_00,
    partyId: "a",
    receivedOn: day("2026-04-01"),
    status: "received",
  },
  {
    amountPaise: 250_00,
    partyId: "a",
    receivedOn: day("2026-09-10"),
    status: "receipted",
  },
  {
    amountPaise: 999_00,
    partyId: "b",
    receivedOn: day("2026-08-01"),
    status: "refunded",
  },
  {
    amountPaise: 500_00,
    partyId: "c",
    receivedOn: day("2027-03-31"),
    status: "pending",
  },
  {
    amountPaise: 700_00,
    partyId: "a",
    receivedOn: day("2026-03-31"),
    status: "received",
  },
];

describe("computeContributionYearStats", () => {
  it("counts this financial year's received gifts, not pending, refunded or reversed", () => {
    expect(computeContributionYearStats(rows, fy)).toEqual({
      count: 2,
      donorCount: 1,
      receivedPaise: 350_00,
    });
  });

  it("is zero for an empty list", () => {
    expect(computeContributionYearStats([], fy)).toEqual({
      count: 0,
      donorCount: 0,
      receivedPaise: 0,
    });
  });
});

describe("partial refunds", () => {
  const refunded = [
    {
      amountPaise: 100_00,
      partyId: "a",
      receivedOn: day("2026-04-01"),
      refunds: [{ amountPaise: 40_00 }],
      status: "received",
    },
    {
      amountPaise: 250_00,
      partyId: "a",
      receivedOn: day("2025-09-10"),
      refunds: [{ amountPaise: 50_00 }, { amountPaise: 25_00 }],
      status: "receipted",
    },
  ];

  it("come off this year's received total, while the gift still counts", () => {
    expect(computeContributionYearStats(refunded, fy)).toEqual({
      count: 1,
      donorCount: 1,
      receivedPaise: 60_00,
    });
  });

  it("come off a donor's lifetime and this-year giving", () => {
    expect(computeDonorGiving(refunded, fy)).toEqual({
      lastGiftOn: day("2026-04-01"),
      lifetimePaise: 235_00,
      yearPaise: 60_00,
    });
  });
});

describe("computeDonorGiving", () => {
  it("leaves pending gifts out of a donor's giving", () => {
    const donorC = rows.filter((row) => row.partyId === "c");
    expect(computeDonorGiving(donorC, fy)).toEqual({
      lastGiftOn: null,
      lifetimePaise: 0,
      yearPaise: 0,
    });
  });

  it("sums lifetime and this-year giving and finds the last gift", () => {
    const donorA = rows.filter((row) => row.partyId === "a");
    expect(computeDonorGiving(donorA, fy)).toEqual({
      lastGiftOn: day("2026-09-10"),
      lifetimePaise: 1050_00,
      yearPaise: 350_00,
    });
    expect(computeDonorGiving([], fy)).toEqual({
      lastGiftOn: null,
      lifetimePaise: 0,
      yearPaise: 0,
    });
  });
});

describe("contributionsSignature", () => {
  interface Row {
    id: string;
    partyId: string;
    receivedOn: number;
    status: string;
    updatedAt: number;
  }
  const base: Row[] = [
    {
      id: "c1",
      partyId: "a",
      receivedOn: day("2026-04-01"),
      status: "received",
      updatedAt: 1,
    },
    {
      id: "c2",
      partyId: "b",
      receivedOn: day("2026-05-01"),
      status: "pending",
      updatedAt: 2,
    },
  ];

  it("is stable for the same rows", () => {
    expect(contributionsSignature(base)).toBe(
      contributionsSignature(base.map((row) => ({ ...row })))
    );
  });

  it("changes when a row's donor, date, status or edit time changes", () => {
    const before = contributionsSignature(base);
    const changed = (patch: Partial<Row>) =>
      contributionsSignature(
        base.map((row, i) => (i === 0 ? { ...row, ...patch } : row))
      );
    expect(changed({ partyId: "z" })).not.toBe(before);
    expect(changed({ receivedOn: day("2026-04-02") })).not.toBe(before);
    expect(changed({ status: "refunded" })).not.toBe(before);
    expect(changed({ updatedAt: 3 })).not.toBe(before);
  });

  it("changes when a row is added or removed", () => {
    expect(contributionsSignature(base.slice(0, 1))).not.toBe(
      contributionsSignature(base)
    );
  });
});
