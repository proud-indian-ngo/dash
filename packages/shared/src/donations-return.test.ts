import { describe, expect, it } from "vitest";

import { GIVE_INDIA_PARTY_ID } from "./constants";
import {
  aggregateReturnRows,
  assessReturn,
  CASH_DEDUCTION_LIMIT_PAISE,
  classifyGift,
  defaultReturnYear,
  formatReturnAmount,
  giftOutcomeLabel,
  MAX_FILING_ROWS,
  planFilingRows,
  idNumberLooksValid,
  joinReturnAddress,
  missingDonorDetailsPartyIds,
  parseReturnRegistration,
  parseReturnYear,
  RETURN_COLUMNS,
  RETURN_DONATION_TYPE_CODES,
  RETURN_ID_CODES,
  RETURN_MODE_CODES,
  effectiveReportingMode,
  hasReturnAddress,
  normalizeIdNumber,
  type ReturnDonorFacts,
  VOLUNTARY_DONATION_TYPE_CODE,
  type ReturnExportGift,
  type ReturnGiftFacts,
  returnDueOn,
  returnCountryName,
  returnFileCells,
  returnIdCode,
  returnRowKey,
  returnYears,
  serializeReturnRegistration,
} from "./donations-return";

const donor = (
  overrides: Partial<ReturnDonorFacts> = {}
): ReturnDonorFacts => ({
  hasAddress: true,
  hasIdNumber: true,
  hasName: true,
  idType: "pan",
  idValid: true,
  partyId: "p1",
  taxCertificateOptOut: false,
  ...overrides,
});

const gift = (overrides: Partial<ReturnGiftFacts> = {}): ReturnGiftFacts => ({
  amountPaise: 500_000,
  channel: "upi",
  currency: "INR",
  deductionEligible: "unknown",
  donationType: "voluntary",
  id: "g1",
  partyId: "p1",
  receivedOn: "2026-06-01",
  refundedPaise: 0,
  reportingMode: "electronic_or_account_payee",
  status: "received",
  ...overrides,
});

describe("return years", () => {
  it("starts at FY 2026-27 and runs to the current year", () => {
    expect(returnYears("2026-10-14").map((fy) => fy.label)).toEqual([
      "2026-27",
    ]);
    expect(returnYears("2028-04-02").map((fy) => fy.label)).toEqual([
      "2026-27",
      "2027-28",
      "2028-29",
    ]);
    // Before the first return year there is still the first year to prepare.
    expect(returnYears("2026-01-10").map((fy) => fy.label)).toEqual([
      "2026-27",
    ]);
  });

  it("is due on 31 May after the year ends", () => {
    const [fy] = returnYears("2026-10-14");
    expect(fy && returnDueOn(fy)).toBe("2027-05-31");
  });

  it("defaults to the year whose return is next due", () => {
    expect(defaultReturnYear("2026-10-14").label).toBe("2026-27");
    // In April and May the previous year's return is still due.
    expect(defaultReturnYear("2027-05-20").label).toBe("2026-27");
    expect(defaultReturnYear("2027-05-31").label).toBe("2026-27");
    expect(defaultReturnYear("2027-06-01").label).toBe("2027-28");
  });

  it("accepts only years a return can be prepared for", () => {
    expect(parseReturnYear("2026-27", "2026-10-14")?.startsOn).toBe(
      "2026-04-01"
    );
    expect(parseReturnYear("2025-26", "2026-10-14")).toBeNull();
    expect(parseReturnYear("2027-28", "2026-10-14")).toBeNull();
    expect(parseReturnYear("nonsense", "2026-10-14")).toBeNull();
  });
});

describe("classifyGift", () => {
  it("puts a received gift from a complete donor in the return as ready", () => {
    expect(classifyGift(gift(), donor())).toEqual({ kind: "ready" });
    expect(classifyGift(gift({ status: "receipted" }), donor())).toEqual({
      kind: "ready",
    });
  });

  it("leaves out gifts received before 1 April 2026", () => {
    expect(classifyGift(gift({ receivedOn: "2026-03-31" }), donor())).toEqual({
      kind: "excluded",
      reason: "before_first_return",
    });
  });

  it("waits for pending gifts and leaves out refunded and reversed ones", () => {
    expect(classifyGift(gift({ status: "pending" }), donor()).kind).toBe(
      "waiting"
    );
    expect(classifyGift(gift({ status: "refunded" }), donor())).toEqual({
      kind: "excluded",
      reason: "fully_refunded",
    });
    expect(classifyGift(gift({ status: "reversed" }), donor())).toEqual({
      kind: "excluded",
      reason: "reversed",
    });
    // A receipted gift refunded in full keeps its status but has nothing left.
    expect(
      classifyGift(
        gift({ refundedPaise: 500_000, status: "receipted" }),
        donor()
      )
    ).toEqual({ kind: "excluded", reason: "fully_refunded" });
  });

  it("keeps a partly refunded gift at its net amount", () => {
    const result = assessReturn(
      [gift({ refundedPaise: 100_000 })],
      new Map([["p1", donor()]])
    );
    expect(result.gifts[0]?.outcome).toEqual({ kind: "ready" });
    expect(result.gifts[0]?.netPaise).toBe(400_000);
    expect(result.summary.readyPaise).toBe(400_000);
  });

  it("leaves out foreign currency, in-kind and cash above the limit", () => {
    expect(classifyGift(gift({ currency: "USD" }), donor())).toEqual({
      kind: "excluded",
      reason: "foreign_currency",
    });
    expect(classifyGift(gift({ reportingMode: "in_kind" }), donor())).toEqual({
      kind: "excluded",
      reason: "in_kind",
    });
    expect(
      classifyGift(
        gift({
          amountPaise: CASH_DEDUCTION_LIMIT_PAISE + 1,
          reportingMode: "cash",
        }),
        donor()
      )
    ).toEqual({ kind: "excluded", reason: "cash_over_limit" });
    expect(
      classifyGift(
        gift({
          amountPaise: CASH_DEDUCTION_LIMIT_PAISE,
          reportingMode: "cash",
        }),
        donor()
      )
    ).toEqual({ kind: "ready" });
  });

  it("judges cash and in kind by the channel as well as the mode", () => {
    expect(
      classifyGift(
        gift({
          amountPaise: CASH_DEDUCTION_LIMIT_PAISE + 1,
          channel: "cash",
          reportingMode: "electronic_or_account_payee",
        }),
        donor()
      )
    ).toEqual({ kind: "excluded", reason: "cash_over_limit" });
    expect(
      classifyGift(
        gift({ channel: "in_kind", reportingMode: "other" }),
        donor()
      )
    ).toEqual({ kind: "excluded", reason: "in_kind" });
    expect(
      effectiveReportingMode({ channel: "cash", reportingMode: "other" })
    ).toBe("cash");
    expect(
      effectiveReportingMode({ channel: "upi", reportingMode: "other" })
    ).toBe("other");
  });

  it("blocks a gift recorded against a donation platform", () => {
    expect(
      classifyGift(gift({ partyId: GIVE_INDIA_PARTY_ID }), undefined)
    ).toEqual({ blocks: ["intermediary_as_donor"], kind: "blocked" });
    const { gifts } = assessReturn(
      [gift({ partyId: GIVE_INDIA_PARTY_ID })],
      new Map()
    );
    // Not counted as a donor with missing details: the fix is the donor.
    expect(missingDonorDetailsPartyIds(gifts)).toEqual([]);
  });

  it("follows the donor's opt-out unless the gift says otherwise", () => {
    const optedOut = donor({ taxCertificateOptOut: true });
    expect(classifyGift(gift(), optedOut)).toEqual({
      kind: "excluded",
      reason: "donor_declined",
    });
    expect(classifyGift(gift({ deductionEligible: "yes" }), optedOut)).toEqual({
      kind: "ready",
    });
    expect(classifyGift(gift({ deductionEligible: "no" }), donor())).toEqual({
      kind: "excluded",
      reason: "gift_excluded",
    });
    // Including a gift never overrides the law's exclusions.
    expect(
      classifyGift(
        gift({ deductionEligible: "yes", reportingMode: "in_kind" }),
        donor()
      )
    ).toEqual({ kind: "excluded", reason: "in_kind" });
  });

  it("blocks gifts whose donor lacks an ID, a name or an address, or has an invalid ID", () => {
    expect(classifyGift(gift(), donor({ hasIdNumber: false }))).toEqual({
      blocks: ["missing_id"],
      kind: "blocked",
    });
    expect(classifyGift(gift(), donor({ idType: "none" }))).toEqual({
      blocks: ["missing_id"],
      kind: "blocked",
    });
    expect(
      classifyGift(gift(), donor({ hasAddress: false, hasName: false }))
    ).toEqual({ blocks: ["missing_name", "missing_address"], kind: "blocked" });
    expect(classifyGift(gift(), donor({ idValid: false }))).toEqual({
      blocks: ["invalid_id"],
      kind: "blocked",
    });
    expect(classifyGift(gift(), undefined)).toEqual({
      blocks: ["missing_name", "missing_address", "missing_id"],
      kind: "blocked",
    });
  });
});

describe("assessReturn and missing donor details", () => {
  it("totals ready, blocked and excluded gifts and counts donors in the return", () => {
    const donors = new Map([
      ["p1", donor()],
      ["p2", donor({ hasIdNumber: false, partyId: "p2" })],
      [
        "p3",
        donor({
          hasAddress: false,
          hasIdNumber: false,
          partyId: "p3",
          taxCertificateOptOut: true,
        }),
      ],
    ]);
    const { gifts, summary } = assessReturn(
      [
        gift({ id: "a" }),
        gift({ amountPaise: 200_000, id: "b", partyId: "p2" }),
        gift({ amountPaise: 300_000, id: "c", partyId: "p3" }),
        gift({ id: "d", status: "pending" }),
      ],
      donors
    );
    expect(summary).toEqual({
      blockedCount: 1,
      blockedPaise: 200_000,
      donorCount: 2,
      excludedCount: 1,
      excludedPaise: 300_000,
      filedCount: 0,
      filedPaise: 0,
      inReturnCount: 2,
      inReturnPaise: 700_000,
      readyCount: 1,
      readyPaise: 500_000,
      waitingCount: 1,
    });
    // p2 lacks an ID for a gift in the return; p3 opted out (no ID needed)
    // but still lacks an address.
    expect(missingDonorDetailsPartyIds(gifts).sort()).toEqual(["p2", "p3"]);
  });

  it("counts a filed gift as filed, never ready again, whatever it looks like now", () => {
    const { gifts, summary } = assessReturn(
      [
        gift({ id: "a" }),
        gift({ amountPaise: 200_000, id: "b" }),
        // Filed while the donor had an ID; the donor has none now.
        gift({ amountPaise: 300_000, id: "c", partyId: "p2" }),
      ],
      new Map([
        ["p1", donor()],
        ["p2", donor({ hasIdNumber: false, partyId: "p2" })],
      ]),
      new Map([
        ["a", { amountPaise: 450_000, filingSequence: 1 }],
        ["c", { amountPaise: 300_000, filingSequence: 1 }],
      ])
    );
    expect(gifts.map((assessed) => assessed.outcome)).toEqual([
      { filingSequence: 1, kind: "filed" },
      { kind: "ready" },
      { filingSequence: 1, kind: "filed" },
    ]);
    expect(summary).toMatchObject({
      blockedCount: 0,
      filedCount: 2,
      filedPaise: 750_000,
      inReturnCount: 3,
      readyCount: 1,
      readyPaise: 200_000,
    });
    expect(giftOutcomeLabel(gifts[0]?.outcome ?? { kind: "ready" })).toEqual({
      reason: "Filing 1",
      status: "Filed",
    });
  });

  it("does not chase an opted-out donor for an ID number", () => {
    const { gifts } = assessReturn(
      [gift()],
      new Map([
        ["p1", donor({ hasIdNumber: false, taxCertificateOptOut: true })],
      ])
    );
    expect(missingDonorDetailsPartyIds(gifts)).toEqual([]);
  });

  it("ignores donors whose only gifts are pending or fully refunded", () => {
    const { gifts } = assessReturn(
      [
        gift({ id: "a", status: "pending" }),
        gift({ id: "b", status: "refunded" }),
      ],
      new Map([["p1", donor({ hasAddress: false, hasIdNumber: false })]])
    );
    expect(missingDonorDetailsPartyIds(gifts)).toEqual([]);
  });
});

describe("idNumberLooksValid", () => {
  it("normalises an ID number as it is checked and exported", () => {
    expect(normalizeIdNumber(" abcde-1234/f ")).toBe("ABCDE1234F");
  });

  it("checks a PAN's shape and the other documents loosely", () => {
    expect(idNumberLooksValid("pan", "ABCDE1234F")).toBe(true);
    expect(idNumberLooksValid("pan", "abcde1234f")).toBe(true);
    expect(idNumberLooksValid("pan", "ABCDE12345")).toBe(false);
    expect(idNumberLooksValid("passport", "K1234567")).toBe(true);
    expect(idNumberLooksValid("voter_id", "ABC 1234567")).toBe(true);
    expect(idNumberLooksValid("driving_licence", "KA01-2020-0001234")).toBe(
      true
    );
    expect(idNumberLooksValid("ration_card", "12")).toBe(false);
    expect(idNumberLooksValid("none", "ABCDE1234F")).toBe(false);
  });
});

describe("upload file", () => {
  const readyGift = (
    overrides: Partial<ReturnExportGift> = {}
  ): ReturnExportGift => ({
    address: "1 MG Road, Bengaluru, Karnataka, India, 560001",
    channel: "upi",
    donationType: "voluntary",
    giftId: "g1",
    idNumber: "ABCDE1234F",
    idType: "pan",
    name: "Asha Rao",
    netPaise: 100_000,
    partyId: "p1",
    reportingMode: "electronic_or_account_payee",
    ...overrides,
  });

  it("keeps the template's column order", () => {
    expect(RETURN_COLUMNS.map((column) => column.header)).toEqual([
      "Sr. No.",
      "Pre Acknowledgement Number",
      "ID Code",
      "Unique Identification Number",
      "Section Code",
      "Unique Registration Number (URN)",
      "Date of Issuance of Unique Registration Number",
      "Name of donor",
      "Address of donor",
      "Donation Type",
      "Mode of receipt",
      "Amount of donation (Indian Rupees)",
    ]);
  });

  it("maps ID types, donation types and modes to the template's codes", () => {
    expect(returnIdCode("pan")).toBe("Permanent Account Number");
    expect(returnIdCode("voter_id")).toBe("Elector's photo identity number");
    expect(returnIdCode("none")).toBeNull();
    expect(RETURN_ID_CODES.aadhaar).toBe("Aadhaar Number");
    // The trust filed every donation for FY 2025-26, CSR included, as
    // "Specific grant".
    expect(VOLUNTARY_DONATION_TYPE_CODE).toBe("Specific grant");
    expect(RETURN_DONATION_TYPE_CODES).toEqual({
      corpus: "Corpus",
      csr: "Specific grant",
      other: "Others",
      specific_grant: "Specific grant",
      voluntary: "Specific grant",
    });
    expect(RETURN_MODE_CODES).toEqual({
      cash: "Cash",
      electronic_or_account_payee:
        "Electronic modes including account payee cheque/draft",
      in_kind: "Kind",
      other: "Others",
    });
  });

  it("aggregates by donor, donation type code and mode code, cash gifts one by one", () => {
    const key = (overrides: Partial<ReturnExportGift>) => {
      const value = readyGift(overrides);
      return returnRowKey({ ...value, id: value.giftId });
    };
    expect(key({})).toBe(key({ donationType: "csr", giftId: "g2" }));
    expect(key({})).not.toBe(key({ donationType: "other" }));
    // Cash gifts are never added together: the limit is per donation.
    expect(key({ reportingMode: "cash" })).not.toBe(
      key({ giftId: "g2", reportingMode: "cash" })
    );
    expect(key({ channel: "cash" })).not.toBe(
      key({ channel: "cash", giftId: "g2" })
    );
    expect(key({})).not.toBe(key({ donationType: "corpus" }));
    const rows = aggregateReturnRows([
      readyGift(),
      readyGift({ donationType: "csr", giftId: "g2", netPaise: 50_000 }),
      readyGift({ giftId: "g3", netPaise: 20_000, reportingMode: "cash" }),
      readyGift({ giftId: "g4", netPaise: 10_000, reportingMode: "cash" }),
      readyGift({
        idNumber: "ZZZZZ9999Z",
        name: "Bina Shah",
        partyId: "p2",
      }),
    ]);
    expect(
      rows.map((row) => [row.name, row.modeCode, row.amountPaise, row.giftIds])
    ).toEqual([
      ["Asha Rao", "Cash", 20_000, ["g3"]],
      ["Asha Rao", "Cash", 10_000, ["g4"]],
      [
        "Asha Rao",
        "Electronic modes including account payee cheque/draft",
        150_000,
        ["g1", "g2"],
      ],
      [
        "Bina Shah",
        "Electronic modes including account payee cheque/draft",
        100_000,
        ["g1"],
      ],
    ]);
  });

  it("refuses a gift without an ID type", () => {
    expect(() =>
      aggregateReturnRows([readyGift({ idType: "none" })])
    ).toThrow();
  });

  it("fills every column in order", () => {
    const cells = returnFileCells(
      planFilingRows(aggregateReturnRows([readyGift()])),
      {
        sectionCode: "Section 80G",
        urn: "AAATP1234AF20214",
        urnIssuedOn: "2021-05-28",
      }
    );
    expect(cells.headers).toHaveLength(12);
    expect(cells.rows).toEqual([
      [
        "1",
        "",
        "Permanent Account Number",
        "ABCDE1234F",
        "Section 80G",
        "AAATP1234AF20214",
        "28-05-2021",
        "Asha Rao",
        "1 MG Road, Bengaluru, Karnataka, India, 560001",
        "Specific grant",
        "Electronic modes including account payee cheque/draft",
        "1000.00",
      ],
    ]);
  });

  it("numbers a filing's rows in upload order and enforces the row limit", () => {
    const rows = aggregateReturnRows([
      readyGift(),
      readyGift({ giftId: "g2", name: "Bina Shah", partyId: "p2" }),
    ]);
    expect(planFilingRows(rows).map((row) => [row.srNo, row.name])).toEqual([
      [1, "Asha Rao"],
      [2, "Bina Shah"],
    ]);
    expect(() =>
      planFilingRows(
        Array.from({ length: MAX_FILING_ROWS + 1 }, () => rows[0]!)
      )
    ).toThrow("at most 25000 rows");
  });

  it("formats amounts in rupees with two decimals", () => {
    expect(formatReturnAmount(123_456)).toBe("1234.56");
    expect(formatReturnAmount(100)).toBe("1.00");
  });

  it("needs address line 1 and a PIN code for an address", () => {
    expect(
      hasReturnAddress({ addressLine1: "1 MG Road", pincode: "560001" })
    ).toBe(true);
    expect(hasReturnAddress({ addressLine1: "1 MG Road", pincode: " " })).toBe(
      false
    );
    expect(hasReturnAddress({ addressLine1: null, pincode: "560001" })).toBe(
      false
    );
  });

  it("names India as the portal does", () => {
    expect(returnCountryName("IN")).toBe("India");
    expect(returnCountryName(" in ")).toBe("India");
    expect(returnCountryName("GB")).toBe("GB");
  });

  it("joins the address and flattens line breaks", () => {
    expect(
      joinReturnAddress([
        "Flat 2,\nRose Villa",
        null,
        " Bengaluru ",
        "",
        "560001",
      ])
    ).toBe("Flat 2, Rose Villa, Bengaluru, 560001");
  });
});

describe("registration settings", () => {
  it("round-trips and rejects incomplete values", () => {
    const value = serializeReturnRegistration({
      sectionCode: " Section 80G ",
      urn: " AAATP1234AF20214 ",
      urnIssuedOn: "2021-05-28",
    });
    expect(parseReturnRegistration(value)).toEqual({
      sectionCode: "Section 80G",
      urn: "AAATP1234AF20214",
      urnIssuedOn: "2021-05-28",
    });
    expect(parseReturnRegistration(null)).toBeNull();
    expect(parseReturnRegistration("not json")).toBeNull();
    expect(
      parseReturnRegistration(
        JSON.stringify({
          sectionCode: "Section 80G",
          urn: "X",
          urnIssuedOn: "",
        })
      )
    ).toBeNull();
    expect(
      parseReturnRegistration(
        JSON.stringify({
          sectionCode: "Section 80G",
          urn: "X".repeat(61),
          urnIssuedOn: "2021-05-28",
        })
      )
    ).toBeNull();
  });
});

describe("giftOutcomeLabel", () => {
  it("names each outcome for the CA's file", () => {
    expect(giftOutcomeLabel({ kind: "ready" })).toEqual({
      reason: "",
      status: "Ready",
    });
    expect(
      giftOutcomeLabel({
        blocks: ["missing_id", "missing_address"],
        kind: "blocked",
      })
    ).toEqual({
      reason: "No ID number; No address with PIN code",
      status: "Needs attention",
    });
    expect(
      giftOutcomeLabel({ kind: "excluded", reason: "donor_declined" }).status
    ).toBe("Excluded");
  });
});
