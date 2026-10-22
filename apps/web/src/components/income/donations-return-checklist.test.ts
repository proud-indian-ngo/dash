import { describe, expect, it } from "bun:test";

import type { ReadinessGift } from "@/functions/donations-return";

import { buildChecklist, donorCount } from "./donations-return-checklist";

const gift = (
  id: string,
  outcome: ReadinessGift["outcome"],
  overrides: Partial<ReadinessGift> = {}
): ReadinessGift => ({
  donationType: "voluntary",
  id,
  missingDonorDetails: false,
  netPaise: 100_000,
  outcome,
  partyId: `party-${id}`,
  refundedPaise: 0,
  ...overrides,
});

const ids = (sections: ReturnType<typeof buildChecklist>, id: string) =>
  sections
    .find((section) => section.id === id)
    ?.rows.map((row) => row.giftId) ?? [];

describe("buildChecklist", () => {
  const gifts = [
    gift("ready", { kind: "ready" }),
    gift("no-id", { blocks: ["missing_id"], kind: "blocked" }),
    gift(
      "no-address",
      { blocks: ["missing_address"], kind: "blocked" },
      { missingDonorDetails: true }
    ),
    gift(
      "opted-out-no-address",
      { kind: "excluded", reason: "donor_declined" },
      { missingDonorDetails: true }
    ),
    gift("bad-id", { blocks: ["invalid_id"], kind: "blocked" }),
    gift("pending", { kind: "waiting" }),
    gift("excluded", { kind: "excluded", reason: "gift_excluded" }),
    gift("partly", { kind: "ready" }, { refundedPaise: 20_000 }),
    gift("platform", { blocks: ["intermediary_as_donor"], kind: "blocked" }),
    gift("csr", { kind: "ready" }, { donationType: "csr" }),
    gift(
      "filed-csr",
      { filingSequence: 2, kind: "filed" },
      { donationType: "csr" }
    ),
    gift(
      "csr-excluded",
      { kind: "excluded", reason: "gift_excluded" },
      { donationType: "csr" }
    ),
  ];
  const sections = buildChecklist(
    gifts,
    new Map([["excluded", "Not a donation"]])
  );

  it("puts each gift under the checks that concern it", () => {
    expect(ids(sections, "missing_id")).toEqual(["no-id"]);
    // An opted-out donor without an address still needs fixing.
    expect(ids(sections, "missing_details")).toEqual([
      "no-address",
      "opted-out-no-address",
    ]);
    expect(ids(sections, "invalid_id")).toEqual(["bad-id"]);
    expect(ids(sections, "waiting")).toEqual(["pending"]);
    expect(ids(sections, "excluded")).toEqual([
      "opted-out-no-address",
      "excluded",
      "csr-excluded",
    ]);
    expect(ids(sections, "partly_refunded")).toEqual(["partly"]);
    expect(ids(sections, "intermediary")).toEqual(["platform"]);
    // Only CSR gifts in the return, filed or not, with their count and total.
    expect(ids(sections, "csr")).toEqual(["csr", "filed-csr"]);
    expect(
      sections.find((section) => section.id === "csr")?.description
    ).toMatch(/^2 included \(₹2,000\.00\)\. A company's CSR spending/);
    // A filed gift leaves the blocking checks and shows its filing.
    expect(ids(sections, "filed")).toEqual(["filed-csr"]);
    expect(
      sections.find((section) => section.id === "filed")?.rows[0]?.note
    ).toBe("Filing 2");
    expect(
      sections.find((section) => section.id === "partly_refunded")?.showNet
    ).toBe(true);
  });

  it("explains exclusions, with the gift's own reason", () => {
    const excluded = sections.find((section) => section.id === "excluded");
    expect(excluded?.rows.map((row) => row.note)).toEqual([
      "Donor doesn't want a tax certificate",
      "Gift excluded: Not a donation",
      "Gift excluded",
    ]);
  });

  it("counts distinct donors", () => {
    expect(
      donorCount([
        {
          giftId: "a",
          netPaise: 1,
          note: null,
          partyId: "p",
          refundedPaise: 0,
        },
        {
          giftId: "b",
          netPaise: 1,
          note: null,
          partyId: "p",
          refundedPaise: 0,
        },
      ])
    ).toBe(1);
  });
});
