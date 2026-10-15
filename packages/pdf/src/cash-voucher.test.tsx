import { describe, expect, it } from "bun:test";

import { paiseToWords } from "./amount-to-words";
import { type CashVoucherProps, formatPayeePhone } from "./cash-voucher";
import { generateCashVoucherPdf } from "./generate-voucher";

/** Embedded font names, without the subset prefix. */
function fontNames(pdf: Buffer): string[] {
  return [
    ...pdf.toString("latin1").matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g),
  ].map((match) => match[1] ?? "");
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
});
