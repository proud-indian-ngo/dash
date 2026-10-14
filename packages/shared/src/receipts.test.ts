import { describe, expect, it } from "vitest";

import { integerToIndianWords, paiseToIndianWords } from "./amount-in-words";
import { GIVE_INDIA_PARTY_ID } from "./constants";
import {
  assessReceipt,
  formatReceiptNumber,
  parseReceiptSettings,
  type ReceiptDonorFacts,
  type ReceiptGiftFacts,
  receiptAssessmentLabel,
  receiptFileName,
  receiptIssuerFor,
  serializeReceiptSettings,
} from "./receipts";

const gift = (overrides: Partial<ReceiptGiftFacts> = {}): ReceiptGiftFacts => ({
  amountPaise: 500_000,
  channel: "upi",
  currency: "INR",
  deductionEligible: "unknown",
  hasActiveReceipt: false,
  partyId: "donor-1",
  receivedOn: "2026-05-10",
  refundedPaise: 0,
  reportingMode: "electronic_or_account_payee",
  status: "received",
  ...overrides,
});

const donor = (
  overrides: Partial<ReceiptDonorFacts> = {}
): ReceiptDonorFacts => ({
  hasAddress: true,
  hasIdNumber: true,
  hasName: true,
  idType: "pan",
  idValid: true,
  taxCertificateOptOut: false,
  ...overrides,
});

describe("amount in words", () => {
  it("writes lakhs, thousands and paise", () => {
    expect(paiseToIndianWords(12_505_050)).toBe(
      "One lakh twenty-five thousand fifty rupees and fifty paise"
    );
  });

  it("writes crores, singular units and round amounts", () => {
    expect(paiseToIndianWords(100)).toBe("One rupee");
    expect(paiseToIndianWords(1)).toBe("One paisa");
    expect(paiseToIndianWords(0)).toBe("Zero rupees");
    expect(paiseToIndianWords(50_000_000)).toBe("Five lakh rupees");
    expect(paiseToIndianWords(1_234_567_800)).toBe(
      "One crore twenty-three lakh forty-five thousand six hundred seventy-eight rupees"
    );
    expect(integerToIndianWords(1_000_000_000)).toBe("one hundred crore");
  });

  it("refuses fractions of a paisa", () => {
    expect(() => paiseToIndianWords(1.5)).toThrow();
  });
});

describe("receipt numbers", () => {
  it("pads the sequence within the year's series", () => {
    expect(formatReceiptNumber("2026-27", 1)).toBe("PI/2026-27/0001");
    expect(formatReceiptNumber("2026-27", 12_345)).toBe("PI/2026-27/12345");
    expect(() => formatReceiptNumber("2026-27", 0)).toThrow();
  });

  it("names the file without slashes", () => {
    expect(receiptFileName("PI/2026-27/0007")).toBe("PI-2026-27-0007.pdf");
  });
});

describe("who receipts", () => {
  it("leaves gateway gifts to the gateway and receipts direct gifts", () => {
    expect(receiptIssuerFor("razorpay")).toBe("razorpay");
    expect(receiptIssuerFor("give_do")).toBe("give_do");
    for (const channel of ["upi", "neft", "cheque", "cash"] as const) {
      expect(receiptIssuerFor(channel)).toBe("pi_dash");
    }
    expect(receiptIssuerFor("in_kind")).toBeNull();
  });
});

describe("assessReceipt", () => {
  it("never receipts gateway gifts", () => {
    expect(assessReceipt(gift({ channel: "razorpay" }), donor())).toEqual({
      issuer: "razorpay",
      kind: "external",
    });
    expect(
      receiptAssessmentLabel(
        assessReceipt(gift({ channel: "give_do" }), donor())
      )
    ).toBe("Receipted by give.do");
  });

  it("receipts a complete direct gift with the 80G line", () => {
    expect(assessReceipt(gift(), donor())).toEqual({
      kind: "eligible",
      with80G: true,
    });
  });

  it("skips gifts before the start date, pending, refunded and reversed", () => {
    expect(assessReceipt(gift({ receivedOn: "2026-03-31" }), donor())).toEqual({
      kind: "skipped",
      reason: "before_start",
    });
    expect(assessReceipt(gift({ status: "pending" }), donor())).toEqual({
      kind: "skipped",
      reason: "pending",
    });
    expect(assessReceipt(gift({ status: "refunded" }), donor())).toEqual({
      kind: "skipped",
      reason: "refunded",
    });
    expect(assessReceipt(gift({ status: "reversed" }), donor())).toEqual({
      kind: "skipped",
      reason: "reversed",
    });
    expect(assessReceipt(gift({ channel: "in_kind" }), donor())).toEqual({
      kind: "skipped",
      reason: "in_kind",
    });
  });

  it("reports an existing receipt", () => {
    expect(
      assessReceipt(
        gift({ hasActiveReceipt: true, status: "receipted" }),
        donor()
      )
    ).toEqual({ kind: "receipted" });
  });

  it("blocks a gift with a refund or missing donor details", () => {
    expect(assessReceipt(gift({ refundedPaise: 100 }), donor())).toEqual({
      blocks: ["refund_recorded"],
      kind: "blocked",
      with80G: true,
    });
    expect(
      assessReceipt(gift(), donor({ hasAddress: false, hasName: false }))
    ).toEqual({
      blocks: ["missing_name", "missing_address"],
      kind: "blocked",
      with80G: true,
    });
    expect(assessReceipt(gift(), undefined)).toMatchObject({
      blocks: ["missing_name", "missing_address", "missing_id"],
      kind: "blocked",
    });
  });

  it("needs a valid ID only when the 80G line is printed", () => {
    expect(
      assessReceipt(gift(), donor({ hasIdNumber: false, idType: "none" }))
    ).toMatchObject({ blocks: ["missing_id"], kind: "blocked" });
    expect(assessReceipt(gift(), donor({ idValid: false }))).toMatchObject({
      blocks: ["invalid_id"],
    });
    // Opted out: receipt without the 80G line, no ID needed.
    expect(
      assessReceipt(
        gift(),
        donor({
          hasIdNumber: false,
          idType: "none",
          taxCertificateOptOut: true,
        })
      )
    ).toEqual({ kind: "eligible", with80G: false });
    // The gift's own Include beats the donor's opt-out.
    expect(
      assessReceipt(
        gift({ deductionEligible: "yes" }),
        donor({ taxCertificateOptOut: true })
      )
    ).toEqual({ kind: "eligible", with80G: true });
    expect(
      assessReceipt(
        gift({ deductionEligible: "no" }),
        donor({ idValid: false })
      )
    ).toEqual({ kind: "eligible", with80G: false });
  });

  it("prints no 80G line for cash above the limit", () => {
    expect(
      assessReceipt(
        gift({ amountPaise: 300_000, channel: "cash", reportingMode: "cash" }),
        donor()
      )
    ).toEqual({ kind: "eligible", with80G: false });
  });

  it("blocks platform donors and foreign currency", () => {
    expect(
      assessReceipt(
        gift({ currency: "USD", partyId: GIVE_INDIA_PARTY_ID }),
        donor()
      )
    ).toMatchObject({ blocks: ["foreign_currency", "intermediary_as_donor"] });
  });
});

describe("receipt settings", () => {
  const settings = {
    orgAddress: "1 Test Street, Testville 560001",
    orgName: "Example Trust",
    orgPan: "aaatx1234x",
    signatoryDesignation: "Treasurer",
    signatoryName: "A. Signatory",
  };

  it("round-trips and normalises the PAN", () => {
    expect(parseReceiptSettings(serializeReceiptSettings(settings))).toEqual({
      ...settings,
      orgPan: "AAATX1234X",
    });
  });

  it("rejects incomplete or malformed settings", () => {
    expect(parseReceiptSettings(null)).toBeNull();
    expect(parseReceiptSettings("not json")).toBeNull();
    expect(
      parseReceiptSettings(JSON.stringify({ ...settings, orgPan: "BAD" }))
    ).toBeNull();
    expect(
      parseReceiptSettings(JSON.stringify({ ...settings, signatoryName: " " }))
    ).toBeNull();
  });
});
