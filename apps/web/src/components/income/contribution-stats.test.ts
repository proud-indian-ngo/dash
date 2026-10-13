import { describe, expect, it } from "bun:test";

import { financialYearOf } from "@pi-dash/shared/income";

import {
  computeContributionYearStats,
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
  it("counts this financial year's gifts except refunds and reversals", () => {
    expect(computeContributionYearStats(rows, fy)).toEqual({
      count: 3,
      donorCount: 2,
      receivedPaise: 850_00,
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

describe("computeDonorGiving", () => {
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
