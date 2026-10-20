import { describe, expect, it } from "vitest";

import {
  declarationsByTrustee,
  normaliseName,
  paymentWarnings,
  policyVersionOn,
} from "./declarations";

describe("normaliseName", () => {
  it("ignores case, honorifics, company suffixes and punctuation", () => {
    expect(normaliseName("M/s. Rao Printers Pvt. Ltd.")).toBe("rao printers");
    expect(normaliseName("  Shri  Vikram   Menon ")).toBe("vikram menon");
    expect(normaliseName("Menon & Co.")).toBe("menon");
  });
});

describe("paymentWarnings", () => {
  const trustees = [{ legalName: "Asha Rao" }, { legalName: "Vikram Menon" }];
  const declarations = [
    {
      interests: [
        {
          nature: "printing",
          party: "Rao Printers",
          relationship: "Spouse's firm",
        },
      ],
      trusteeName: "Asha Rao",
    },
  ];

  it("warns on a payment to a trustee and to a declared related party", () => {
    expect(
      paymentWarnings({ declarations, payeeName: "Mr. Vikram Menon", trustees })
    ).toMatchObject([{ kind: "trustee", trusteeName: "Vikram Menon" }]);
    expect(
      paymentWarnings({
        declarations,
        payeeName: "M/s Rao Printers Private Limited",
        trustees,
      })
    ).toMatchObject([{ kind: "related_party", trusteeName: "Asha Rao" }]);
  });

  it("stays quiet for anyone else", () => {
    expect(
      paymentWarnings({ declarations, payeeName: "Bengaluru Tents", trustees })
    ).toEqual([]);
    expect(paymentWarnings({ declarations, payeeName: " ", trustees })).toEqual(
      []
    );
  });
});

describe("policyVersionOn", () => {
  it("picks the latest version in effect", () => {
    const versions = [
      { effectiveOn: "2026-01-01", version: 1 },
      { effectiveOn: "2026-11-01", version: 2 },
    ];
    expect(policyVersionOn(versions, "2026-10-17")?.version).toBe(1);
    expect(policyVersionOn(versions, "2026-11-01")?.version).toBe(2);
    expect(policyVersionOn(versions, "2025-12-31")).toBeNull();
  });
});

describe("declarationsByTrustee", () => {
  const row = (
    id: string,
    trusteeId: string,
    status: "awaiting_signature" | "signed" | "confirmed",
    declaredAt: number
  ) => ({ declaredAt, id, status, trusteeId });

  it("counts the last signed declaration, not one waiting for a signature", () => {
    const byTrustee = declarationsByTrustee([
      row("a1", "asha", "confirmed", 1),
      row("a2", "asha", "signed", 3),
      row("a3", "asha", "awaiting_signature", 5),
      row("v1", "vikram", "awaiting_signature", 2),
    ]);
    expect(byTrustee.get("asha")?.inForce?.id).toBe("a2");
    expect(byTrustee.get("asha")?.awaiting?.id).toBe("a3");
    expect(byTrustee.get("vikram")).toEqual({
      awaiting: row("v1", "vikram", "awaiting_signature", 2),
      inForce: null,
    });
  });

  it("keeps a declaration confirmed without a signature in force", () => {
    const byTrustee = declarationsByTrustee([
      row("a1", "asha", "confirmed", 1),
      row("a2", "asha", "awaiting_signature", 2),
    ]);
    expect(byTrustee.get("asha")?.inForce?.id).toBe("a1");
  });
});
