import { describe, expect, it } from "vitest";

import {
  declarationsByTrustee,
  normaliseName,
  outstandingPolicyVersions,
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

describe("outstandingPolicyVersions", () => {
  const conduct = {
    audience: "everyone" as const,
    id: "conduct",
    versions: [
      { effectiveOn: "2026-01-01", id: "c1", version: 1 },
      { effectiveOn: "2026-10-01", id: "c2", version: 2 },
      { effectiveOn: "2026-12-01", id: "c3", version: 3 },
    ],
  };
  const trusteeCode = {
    audience: "trustees" as const,
    id: "trustees",
    versions: [{ effectiveOn: "2026-01-01", id: "t1", version: 1 }],
  };
  const draft = { audience: "everyone" as const, id: "draft", versions: [] };
  const policies = [conduct, trusteeCode, draft];
  const ids = (input: Parameters<typeof outstandingPolicyVersions>[0]) =>
    outstandingPolicyVersions(input).map((o) => [o.version.id, o.updated]);

  it("asks for the version in force of each policy meant for the person", () => {
    const base = {
      acknowledged: new Set<string>(),
      on: "2026-10-20",
      policies,
    };
    expect(ids({ ...base, inOffice: false })).toEqual([["c2", false]]);
    expect(ids({ ...base, inOffice: true })).toEqual([
      ["c2", false],
      ["t1", false],
    ]);
  });

  it("marks a policy updated since the person acknowledged it", () => {
    expect(
      ids({
        acknowledged: new Set(["c1", "t1"]),
        inOffice: true,
        on: "2026-10-20",
        policies,
      })
    ).toEqual([["c2", true]]);
  });

  it("leaves out acknowledged versions and versions not yet in force", () => {
    const acknowledged = new Set(["c2"]);
    expect(
      ids({ acknowledged, inOffice: false, on: "2026-10-20", policies })
    ).toEqual([]);
    expect(
      ids({ acknowledged, inOffice: false, on: "2026-12-01", policies })
    ).toEqual([["c3", true]]);
  });
});
