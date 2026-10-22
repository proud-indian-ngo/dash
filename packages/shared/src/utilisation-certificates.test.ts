import { describe, expect, it } from "vitest";

import type { BoardMember } from "./governance";
import {
  type CertificateFigures,
  certificateDrift,
  certificateHolding,
  certificateLockMessage,
  certificateSignatories,
  certificateSteps,
  defaultCertificatePeriod,
} from "./utilisation-certificates";

const member = (
  id: string,
  legalName: string,
  offices: BoardMember["offices"]
): BoardMember => ({
  offices,
  term: {
    endedOn: null,
    endsOn: null,
    id: `term-${id}`,
    startsOn: "2020-01-01",
    trusteeId: id,
  } as unknown as BoardMember["term"],
  trustee: { id, isCoFounder: false, legalName },
});

describe("certificateSignatories", () => {
  it("has the Managing Trustee sign first and the Treasurer second", () => {
    const result = certificateSignatories([
      member("mt", "Asha Rao", ["managing_trustee"]),
      member("jmt", "Vikram Menon", ["joint_managing_trustee"]),
      member("tr", "Meera Iyer", ["treasurer"]),
    ]);
    expect(result).toEqual({
      finance: { name: "Meera Iyer", office: "treasurer", trusteeId: "tr" },
      head: { name: "Asha Rao", office: "managing_trustee", trusteeId: "mt" },
    });
  });

  it("falls back to the Joint Managing Trustee while no one else is Treasurer", () => {
    const result = certificateSignatories([
      member("mt", "Asha Rao", ["managing_trustee", "treasurer"]),
      member("jmt", "Vikram Menon", ["joint_managing_trustee", "secretary"]),
    ]);
    expect("finance" in result && result.finance.trusteeId).toBe("jmt");
  });

  it("refuses a register with two holders of one office", () => {
    expect(
      certificateSignatories([
        member("a", "Asha Rao", ["managing_trustee"]),
        member("b", "Rahul Das", ["managing_trustee"]),
        member("jmt", "Vikram Menon", ["joint_managing_trustee"]),
      ])
    ).toEqual({
      problem: expect.stringContaining("more than one Managing Trustee"),
    });
  });

  it("says who is missing", () => {
    expect(
      certificateSignatories([
        member("jmt", "Vikram Menon", ["joint_managing_trustee"]),
      ])
    ).toEqual({ problem: expect.stringContaining("No Managing Trustee") });
    expect(
      certificateSignatories([member("mt", "Asha Rao", ["managing_trustee"])])
    ).toEqual({ problem: expect.stringContaining("No Treasurer") });
  });
});

describe("certificateHolding", () => {
  const certificates = [
    {
      grantId: "g1",
      number: "UC/2026-27/001",
      status: "final",
      toOn: "2026-09-30",
    },
    {
      grantId: "g1",
      number: "UC/2026-27/002",
      status: "cancelled",
      toOn: "2027-03-31",
    },
    {
      grantId: "g2",
      number: "UC/2026-27/003",
      status: "awaiting_head",
      toOn: "2027-03-31",
    },
  ];

  it("finds the live certificate of the grant ending on or after the day", () => {
    expect(certificateHolding(certificates, "g1", "2026-09-30")?.number).toBe(
      "UC/2026-27/001"
    );
    // Before the period still changes the balance it brings forward.
    expect(certificateHolding(certificates, "g1", "2026-04-01")?.number).toBe(
      "UC/2026-27/001"
    );
    expect(certificateHolding(certificates, "g1", "2026-10-01")).toBeNull();
    expect(certificateHolding(certificates, "g3", "2026-04-01")).toBeNull();
  });

  it("names the certificate and the way out", () => {
    const [final, , unsigned] = certificates;
    expect(
      certificateLockMessage(final as never, "unlinking this contribution")
    ).toBe(
      "Utilisation certificate UC/2026-27/001 covers this, so unlinking this contribution would change its figures. Cancel it first, then prepare a new one."
    );
    expect(certificateLockMessage(unsigned as never, "x")).toContain(
      "Discard it first"
    );
  });
});

describe("defaultCertificatePeriod", () => {
  const grant = { endsOn: "2027-03-31", startsOn: "2026-06-01" };

  it("starts after the last live certificate and ends today or at the grant's end", () => {
    expect(defaultCertificatePeriod(grant, [], "2026-12-02")).toEqual({
      from: "2026-06-01",
      to: "2026-12-02",
    });
    expect(
      defaultCertificatePeriod(
        grant,
        [
          { status: "final", toOn: "2026-09-30" },
          { status: "awaiting_head", toOn: "2026-11-30" },
        ],
        "2027-05-01"
      )
    ).toEqual({ from: "2026-12-01", to: "2027-03-31" });
    // A cancelled one frees its period.
    expect(
      defaultCertificatePeriod(
        grant,
        [{ status: "cancelled", toOn: "2026-11-30" }],
        "2027-05-01"
      )
    ).toEqual({ from: "2026-06-01", to: "2027-03-31" });
  });
});

describe("certificateSteps", () => {
  it("adds the CA step only when the agreement asks for it", () => {
    expect(
      certificateSteps({ caRequired: true, status: "awaiting_ca" }).map(
        (s) => `${s.key}:${s.state}`
      )
    ).toEqual([
      "prepared:done",
      "awaiting_head:done",
      "awaiting_finance:done",
      "awaiting_ca:current",
      "final:upcoming",
    ]);
    expect(
      certificateSteps({ caRequired: false, status: "final" }).every(
        (s) => s.state === "done"
      )
    ).toBe(true);
  });
});

describe("certificateDrift", () => {
  const figures: CertificateFigures = {
    broughtForwardPaise: 100,
    closingPaise: 150,
    heads: [
      {
        accountHeadId: "h",
        budgetPaise: null,
        name: "Travel",
        periodPaise: 50,
        toDatePaise: 50,
      },
    ],
    interestBroughtForwardPaise: 0,
    interestPaise: 0,
    received: [
      { contributionId: "c", on: "2026-10-01", paise: 100, reference: "U1" },
    ],
    receivedPaise: 100,
    refunds: [],
    refundedPaise: 0,
    spentPaise: 50,
    totalAvailablePaise: 200,
  };

  it("is empty when nothing changed and lists each change otherwise", () => {
    expect(certificateDrift(figures, figures)).toEqual([]);
    const now = {
      ...figures,
      closingPaise: 180,
      heads: [
        { ...figures.heads[0], periodPaise: 20 },
      ] as CertificateFigures["heads"],
      received: [],
    };
    expect(certificateDrift(figures, now)).toEqual([
      "Receipt of ₹1.00 on 2026-10-01 (U1) no longer counts",
      "Spent on Travel: ₹0.50 then, ₹0.20 now",
      "Closing unspent: ₹1.50 then, ₹1.80 now",
    ]);
  });
});
