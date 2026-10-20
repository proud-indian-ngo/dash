import { describe, expect, it } from "vitest";

import {
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
