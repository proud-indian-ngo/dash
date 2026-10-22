import { describe, expect, it } from "vitest";

import { integerToIndianWords, paiseToIndianWords } from "./amount-in-words";
import { GIVE_INDIA_PARTY_ID } from "./constants";
import {
  assessReceipt,
  formatReceiptNumber,
  receiptAwaitsAutoSend,
  receiptDeliveryNote,
  receiptDeliveryState,
  parseReceiptSettings,
  type ReceiptDonorFacts,
  type ReceiptGiftFacts,
  blockedReceiptColumnValue,
  giftReceiptBlocks,
  maskDonorName,
  RECEIPT_COLUMN_LABELS,
  receiptAssessmentLabel,
  receiptBlocksTitle,
  receiptColumnSortKey,
  receiptColumnValue,
  receiptColumnValueWithoutDonor,
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

describe("receipt column", () => {
  const column = (overrides: Partial<ReceiptGiftFacts>, facts = donor()) => {
    const g = gift(overrides);
    return receiptColumnValue(assessReceipt(g, facts), g.status);
  };

  it("names the gateway that receipts, and a dash once the money is gone", () => {
    expect(column({ channel: "razorpay" })).toBe("razorpay");
    expect(column({ channel: "give_do" })).toBe("give_do");
    expect(column({ channel: "razorpay", status: "refunded" })).toBe("none");
    expect(RECEIPT_COLUMN_LABELS.razorpay).toBe("By Razorpay");
    expect(RECEIPT_COLUMN_LABELS.give_do).toBe("By give.do");
  });

  it("shows an issued receipt even when stored as receipted or later refunded", () => {
    expect(column({ hasActiveReceipt: true, status: "receipted" })).toBe(
      "issued"
    );
    expect(column({ hasActiveReceipt: true, status: "refunded" })).toBe(
      "issued"
    );
  });

  it("splits direct gifts into ready, needs details and not needed", () => {
    expect(column({})).toBe("ready");
    expect(column({}, donor({ hasAddress: false }))).toBe("needs_details");
    expect(column({}, donor({ hasIdNumber: false }))).toBe("needs_details");
    expect(column({}, donor({ idValid: false }))).toBe("needs_details");
    expect(column({ status: "receipted" })).toBe("cant_issue");
    expect(column({ receivedOn: "2026-03-31" })).toBe("not_needed");
    expect(column({ channel: "in_kind" })).toBe("not_needed");
    expect(column({ channel: "in_kind", status: "pending" })).toBe("none");
    expect(column({ status: "pending" })).toBe("none");
    expect(column({ status: "reversed" })).toBe("none");
    expect(RECEIPT_COLUMN_LABELS.ready).toBe("Ready to issue");
    expect(RECEIPT_COLUMN_LABELS.needs_details).toBe("Needs details");
    expect(RECEIPT_COLUMN_LABELS.not_needed).toBe("Not needed");
    expect(RECEIPT_COLUMN_LABELS.none).toBe("—");
  });

  it("says Can't issue when the gift itself blocks the receipt", () => {
    expect(column({ refundedPaise: 100 })).toBe("cant_issue");
    expect(column({ currency: "USD" })).toBe("cant_issue");
    expect(column({ partyId: GIVE_INDIA_PARTY_ID })).toBe("cant_issue");
    // Gift-level and donor-level together: details alone won't help.
    expect(column({ refundedPaise: 100 }, donor({ hasAddress: false }))).toBe(
      "cant_issue"
    );
    expect(RECEIPT_COLUMN_LABELS.cant_issue).toBe("Can't issue");
    expect(blockedReceiptColumnValue(["missing_address", "missing_id"])).toBe(
      "needs_details"
    );
    expect(giftReceiptBlocks(["missing_name", "refund_recorded"])).toEqual([
      "refund_recorded",
    ]);
    expect(receiptBlocksTitle(["refund_recorded", "foreign_currency"])).toBe(
      "A refund is recorded against it; Foreign currency (FCRA is not activated)"
    );
  });

  it("sorts ready first, receipts by number, and the dash last", () => {
    const keys = [
      receiptColumnSortKey("none"),
      receiptColumnSortKey("issued", "PI/2026-27/0002"),
      receiptColumnSortKey("ready"),
      receiptColumnSortKey("issued", "PI/2026-27/0001"),
      receiptColumnSortKey("razorpay"),
      receiptColumnSortKey("needs_details"),
      receiptColumnSortKey("cant_issue"),
      receiptColumnSortKey("give_do"),
      receiptColumnSortKey("not_needed"),
    ].sort();
    expect(keys).toEqual([
      receiptColumnSortKey("ready"),
      receiptColumnSortKey("needs_details"),
      receiptColumnSortKey("cant_issue"),
      receiptColumnSortKey("issued", "PI/2026-27/0001"),
      receiptColumnSortKey("issued", "PI/2026-27/0002"),
      receiptColumnSortKey("razorpay"),
      receiptColumnSortKey("give_do"),
      receiptColumnSortKey("not_needed"),
      receiptColumnSortKey("none"),
    ]);
  });

  it("leaves receiptable direct gifts to the server, which reads the donor", () => {
    expect(receiptColumnValueWithoutDonor(gift())).toBeNull();
    expect(
      receiptColumnValueWithoutDonor(gift({ refundedPaise: 100 }))
    ).toBeNull();
    expect(receiptColumnValueWithoutDonor(gift({ channel: "razorpay" }))).toBe(
      "razorpay"
    );
    expect(
      receiptColumnValueWithoutDonor(gift({ hasActiveReceipt: true }))
    ).toBe("issued");
    expect(
      receiptColumnValueWithoutDonor(gift({ receivedOn: "2026-01-02" }))
    ).toBe("not_needed");
    expect(receiptColumnValueWithoutDonor(gift({ status: "pending" }))).toBe(
      "none"
    );
  });
});

describe("receipt settings", () => {
  const settings = {
    orgAddress: "1 Test Street, Testville 560001",
    orgName: "Example Trust",
    orgPan: "aaatx1234x",
    signatoryDesignation: "Treasurer",
    signatoryName: "A. Signatory",
    signatureKey: "app/attachments/receipt-signatures/signature.png",
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

  it("needs a claimed signature: none, or a key outside the signature folder, fails", () => {
    const { signatureKey: _, ...unsigned } = settings;
    expect(parseReceiptSettings(JSON.stringify(unsigned))).toBeNull();
    expect(
      parseReceiptSettings(
        JSON.stringify({
          ...settings,
          signatureKey: "app/attachments/reimbursements/r/receipt.png",
        })
      )
    ).toBeNull();
  });
});

describe("maskDonorName", () => {
  it("keeps each word's first letter and hides its length", () => {
    expect(maskDonorName("  Test   Donor ")).toBe("T••• D•••");
    expect(maskDonorName("Ā Śarmā")).toBe("Ā••• Ś•••");
    expect(maskDonorName("Donor")).toBe("D•••");
  });

  it("starts each word at its first letter or digit and drops bare symbols", () => {
    expect(maskDonorName("(HUF) Sharma & Sons")).toBe("H••• S••• S•••");
    expect(maskDonorName("M/s 3M India")).toBe("M••• 3••• I•••");
    expect(maskDonorName("   ")).toBe("");
  });
});

describe("receipt delivery", () => {
  const NOW = 1_000_000;
  const waiting = { autoSendAt: NOW + 1000 };

  it("waits for the automatic send, then shows it sending", () => {
    expect(receiptDeliveryState(waiting, NOW)).toEqual({
      at: NOW + 1000,
      kind: "scheduled",
    });
    expect(receiptAwaitsAutoSend(waiting, NOW)).toBe(true);
    // Past the window it is the job's turn, not Send now's.
    expect(receiptDeliveryState(waiting, NOW + 2000)).toEqual({
      kind: "sending",
    });
    expect(receiptAwaitsAutoSend(waiting, NOW + 2000)).toBe(false);
    expect(receiptDeliveryState({}, NOW)).toEqual({ kind: "not_sent" });
  });

  it("stops waiting once sent or voided, but not after a failed attempt", () => {
    for (const receipt of [
      { ...waiting, emailedAt: NOW },
      { ...waiting, whatsappSentAt: NOW },
      { ...waiting, voidedAt: NOW },
    ]) {
      expect(receiptAwaitsAutoSend(receipt, NOW)).toBe(false);
    }
    // A manual WhatsApp send failed; the automatic email still comes.
    const failed = { ...waiting, deliveryFailure: "whatsapp_no_template" };
    expect(receiptAwaitsAutoSend(failed, NOW)).toBe(true);
    expect(receiptDeliveryNote(failed, NOW)).toBe("whatsapp_no_template");
  });

  it("shows the failure, not a past schedule, once the automatic send gave up", () => {
    const gaveUp = { autoSendAt: NOW - 1000, deliveryFailure: "email_failed" };
    expect(receiptDeliveryState(gaveUp, NOW)).toEqual({
      failure: "email_failed",
      kind: "failed",
    });
    expect(receiptDeliveryNote(gaveUp, NOW)).toBeNull();
  });

  it("lets a send that went out win over a later failure, kept as a note", () => {
    const resendFailed = {
      deliveryFailure: "whatsapp_no_template",
      emailedAt: NOW,
    };
    expect(receiptDeliveryState(resendFailed, NOW)).toEqual({
      at: NOW,
      channel: "email",
      kind: "sent",
    });
    expect(receiptDeliveryNote(resendFailed, NOW)).toBe("whatsapp_no_template");
    expect(
      receiptDeliveryState({ emailedAt: NOW, whatsappSentAt: NOW + 1 }, NOW)
    ).toEqual({ at: NOW + 1, channel: "whatsapp", kind: "sent" });
  });
});
