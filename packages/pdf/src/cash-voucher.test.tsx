import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { paiseToWords } from "./amount-to-words";
import {
  type CashVoucherProps,
  claimantDeclarationText,
  formatPayeePhone,
  formatSignedAt,
} from "./cash-voucher";
import { generateCashVoucherPdf } from "./generate-voucher";
import { syntheticSignaturePng } from "./synthetic-signature.test-helper";

/** Embedded font names, without the subset prefix. */
function fontNames(pdf: Buffer): string[] {
  return [
    ...pdf.toString("latin1").matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g),
  ].map((match) => match[1] ?? "");
}

const UNSIGNED_VOUCHER_SHA256 =
  "3eb85483698c855b05d5e0d44972c179030f8994ea78a6a3c109e2f237b8beb5";

function sha256(pdf: Buffer): string {
  return createHash("sha256").update(pdf).digest("hex");
}

function imageCount(pdf: Buffer): number {
  return [...pdf.toString("latin1").matchAll(/\/Subtype \/Image\b/g)].length;
}

function pageCount(pdf: Buffer): number {
  return [...pdf.toString("latin1").matchAll(/\/Type \/Page\b/g)].length;
}

// Synthetic details only.
const sampleVoucher: CashVoucherProps = {
  amountInWords: paiseToWords(200_000),
  amountPaise: 200_000,
  approvedBy: "Test Treasurer",
  category: "Labour",
  claimedBy: "Test Volunteer",
  date: "2026-10-12",
  description: "Cleaning the community hall after the event",
  orgAddress: "1 Test Road, Testville 560001",
  orgEmail: "hello@example.org",
  orgName: "Example Trust",
  orgPhone: "+91 80 0000 0000",
  orgRegistration: "TEST/REG/0001",
  paidTo: "Test Payee",
  payeePhone: "+919876543210",
  voucherNumber: "CV-2026-0042",
};

describe("cash voucher PDF", () => {
  it("renders one A4 page titled with the voucher number", async () => {
    const pdf = await generateCashVoucherPdf(sampleVoucher);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(pageCount(pdf)).toBe(1);
    expect(text).toContain("(CV-2026-0042)");
  });

  it("renders the same bytes every time", async () => {
    const first = await generateCashVoucherPdf(sampleVoucher);
    const second = await generateCashVoucherPdf(sampleVoucher);
    expect(second.equals(first)).toBe(true);
  });

  it("embeds the product fonts and the treasurer's signature", async () => {
    const pdf = await generateCashVoucherPdf(sampleVoucher);
    const text = pdf.toString("latin1");
    for (const font of [
      "Geist-Regular",
      "Geist-SemiBold",
      "BricolageGrotesque-SemiBold",
      "PaperMono-Medium",
      "PaperMono-Regular",
    ]) {
      expect(text).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
    }
    expect(text).toContain("/Subtype /Image");
    expect(fontNames(pdf).filter((font) => font.includes("Helvetica"))).toEqual(
      []
    );
  });

  it("renders without a phone or description", async () => {
    const pdf = await generateCashVoucherPdf({
      ...sampleVoucher,
      description: null,
      payeePhone: null,
    });
    expect(pageCount(pdf)).toBe(1);
  });

  it("keeps long names and descriptions on one page", async () => {
    const pdf = await generateCashVoucherPdf({
      ...sampleVoucher,
      approvedBy: "Example Treasurer With A Rather Long Synthetic Name",
      category: "Event logistics and venue arrangements",
      claimedBy: "Synthetic Volunteer With A Rather Long Name For Testing",
      description: `${"Loading, unloading and arranging chairs, tables and stage props, ".repeat(6)}and returning hired furniture`,
      orgAddress:
        "Synthetic Trust Office, 3rd Floor, 99 Example Industrial Estate, Old Airport Road, Testville 560017",
      orgEmail: "accounts-and-finance@example-charitable-trust.org",
      orgName: "Example Charitable Trust for Optimists and Volunteers",
      paidTo:
        "Venkatanarasimharajuvaripeta Subrahmanyam Lakshminarayanan Ramaswamy Iyengar",
    });
    expect(pageCount(pdf)).toBe(1);
  });

  it("spills a very long description to a second page", async () => {
    // Around 700 characters stay on one page even with long names; the
    // footer with the voucher number is fixed, so it repeats on page two.
    const pdf = await generateCashVoucherPdf({
      ...sampleVoucher,
      description: "Loading and arranging chairs and tables at the hall, "
        .repeat(40)
        .slice(0, 2000),
    });
    expect(pageCount(pdf)).toBe(2);
  });

  it("prints IAST names in embedded fonts, never Helvetica", async () => {
    const pdf = await generateCashVoucherPdf({
      ...sampleVoucher,
      approvedBy: "Ṛṣabh Siṃha",
      description: "Painting the classroom at the Ṭhāṇe centre",
      paidTo: "Kṛṣṇa Veṅkaṭeśa Ḍhaṇḍapāṇi",
    });
    const fonts = fontNames(pdf);
    expect(fonts).toContain("PlusJakartaSans-Regular");
    expect(fonts).toContain("PlusJakartaSans-Bold");
    expect(fonts.filter((font) => font.includes("Helvetica"))).toEqual([]);
  });
});

describe("formatPayeePhone", () => {
  it("groups an Indian mobile in fives", () => {
    expect(formatPayeePhone("+919876543210")).toBe("+91 98765 43210");
  });

  it("prints anything else as given", () => {
    expect(formatPayeePhone("+14155550123")).toBe("+14155550123");
  });

  describe("with the payee's signature", () => {
    const signed: CashVoucherProps = {
      ...sampleVoucher,
      // 12 Oct 2026, 3:40 pm in India.
      payeeSignature: {
        capturedAt: Date.UTC(2026, 9, 12, 10, 10),
        image: syntheticSignaturePng(),
      },
    };

    it("embeds the signature beside the treasurer's", async () => {
      const [plain, withSignature] = await Promise.all([
        generateCashVoucherPdf(sampleVoucher),
        generateCashVoucherPdf(signed),
      ]);
      expect(imageCount(withSignature)).toBeGreaterThan(imageCount(plain));
      expect(pageCount(withSignature)).toBe(1);
    });

    it("renders the same bytes every time", async () => {
      const first = await generateCashVoucherPdf(signed);
      const second = await generateCashVoucherPdf(signed);
      expect(second.equals(first)).toBe(true);
    });

    it("keeps a long payee name and a square signature on one page", async () => {
      const pdf = await generateCashVoucherPdf({
        ...signed,
        paidTo:
          "Venkatanarasimharajuvaripeta Subrahmanyam Lakshminarayanan Ramaswamy Iyengar",
        payeeSignature: {
          capturedAt: Date.UTC(2026, 9, 12, 10, 10),
          image: syntheticSignaturePng(200, 200),
        },
      });
      expect(pageCount(pdf)).toBe(1);
    });

    it("prints an unsigned voucher exactly as before", async () => {
      // The SHA-256 of the sample voucher rendered before payee signatures
      // existed (master at b4185eb4): an unsigned voucher must not change.
      const [unsigned, explicitNull] = await Promise.all([
        generateCashVoucherPdf(sampleVoucher),
        generateCashVoucherPdf({ ...sampleVoucher, payeeSignature: null }),
      ]);
      expect(sha256(unsigned)).toBe(UNSIGNED_VOUCHER_SHA256);
      expect(sha256(explicitNull)).toBe(UNSIGNED_VOUCHER_SHA256);
    });
  });

  it("dates the signature in India", () => {
    expect(formatSignedAt(Date.UTC(2026, 9, 12, 10, 10))).toBe(
      "12 Oct 2026, 3:40 pm"
    );
    expect(formatSignedAt(Date.UTC(2026, 9, 11, 19, 0))).toBe(
      "12 Oct 2026, 12:30 am"
    );
  });

  describe("paid to the claimant", () => {
    // 12 Oct 2026, 3:40 pm in India.
    const declaredAt = Date.UTC(2026, 9, 12, 10, 10);
    const claimantPaid: CashVoucherProps = {
      ...sampleVoucher,
      claimantDeclaration: {
        claimantName: "Test Volunteer",
        declaredAt,
        kind: "self",
      },
      paidTo: "Test Volunteer",
    };

    it("declares a self-submitted claim", () => {
      expect(
        claimantDeclarationText({
          claimantName: "Test Volunteer",
          declaredAt,
          kind: "self",
        })
      ).toBe(
        "Declared electronically by Test Volunteer (claimant) on 12 Oct 2026, 3:40 pm, when the claim was submitted."
      );
    });

    it("says who raised a claim for the claimant", () => {
      expect(
        claimantDeclarationText({
          claimantName: "Test Volunteer",
          creatorName: "Test Finance",
          declaredAt,
          kind: "raised",
        })
      ).toBe(
        "Raised by Test Finance for Test Volunteer on 12 Oct 2026, 3:40 pm; no payee signature needed as the claimant was paid."
      );
    });

    it("prints the declaration on one page, unlike the empty box", async () => {
      const [declared, raised, empty] = await Promise.all([
        generateCashVoucherPdf(claimantPaid),
        generateCashVoucherPdf({
          ...claimantPaid,
          claimantDeclaration: {
            claimantName:
              "Venkatanarasimharajuvaripeta Subrahmanyam Lakshminarayanan Ramaswamy Iyengar",
            creatorName:
              "Synthetic Finance Volunteer With A Rather Long Name For Testing",
            declaredAt,
            kind: "raised",
          },
        }),
        generateCashVoucherPdf({ ...claimantPaid, claimantDeclaration: null }),
      ]);
      expect(pageCount(declared)).toBe(1);
      expect(pageCount(raised)).toBe(1);
      expect(declared.equals(empty)).toBe(false);
    });

    it("keeps a third-party payee's unsigned voucher as before", async () => {
      const pdf = await generateCashVoucherPdf({
        ...sampleVoucher,
        claimantDeclaration: null,
      });
      expect(sha256(pdf)).toBe(UNSIGNED_VOUCHER_SHA256);
    });
  });
});
