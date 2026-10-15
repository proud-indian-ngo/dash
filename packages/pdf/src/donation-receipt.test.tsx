import { describe, expect, it } from "bun:test";
import { inflateSync } from "node:zlib";

import {
  RECEIPT_SETTINGS_ADDRESS_MAX,
  RECEIPT_SETTINGS_TEXT_MAX,
  VOID_REASON_MAX,
} from "@pi-dash/shared/receipts";

import { wholeWords } from "./donation-receipt";
import {
  type DonationReceiptProps,
  generateDonationReceiptPdf,
} from "./generate-donation-receipt";

/** Repeats a phrase to exactly `length` characters. */
function textOf(length: number, phrase: string): string {
  return phrase.repeat(Math.ceil(length / phrase.length)).slice(0, length);
}

/** Embedded font names, without the subset prefix. */
function fontNames(pdf: Buffer): string[] {
  return [
    ...pdf.toString("latin1").matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g),
  ].map((match) => match[1] ?? "");
}

/** Each page's decompressed content stream, in page order. */
function pageContents(pdf: Buffer): string[] {
  const text = pdf.toString("latin1");
  return [...text.matchAll(/\/Type \/Page\b[^]*?\/Contents (\d+) 0 R/g)].map(
    ([, id]) => {
      const start = text.indexOf("stream\n", text.indexOf(`\n${id} 0 obj`)) + 7;
      const end = text.indexOf("\nendstream", start);
      return inflateSync(pdf.subarray(start, end)).toString("latin1");
    }
  );
}

// The receipt's danger colour (#B3261E) as PDFKit writes it: only the void
// banner and the VOID marker use it.
const DANGER_COLOUR = [0xb3, 0x26, 0x1e].map((value) => value / 255).join(" ");

// Synthetic details only.
const sampleReceipt: DonationReceiptProps = {
  donor: {
    address: "2 Test Lane, Testville, Karnataka, India, 560001",
    idNumber: "ABCPE1234F",
    idType: "pan",
    name: "Test Donor",
  },
  gift: {
    amountPaise: 12_505_050,
    channel: "neft",
    donationType: "voluntary",
    donationTypeDescription: null,
    programmeName: "Education",
    projectName: null,
    receivedOn: "2026-05-01",
    reference: "UTR0000TEST",
  },
  issuedOn: "2026-05-04",
  number: "PI/2026-27/0001",
  org: {
    address: "1 Test Road, Testville 560001",
    name: "Example Trust",
    pan: "AAATE0000E",
  },
  registration: {
    sectionCode: "Section 80G",
    urn: "TESTURN0000000",
    urnIssuedOn: "2025-01-01",
  },
  signatory: { designation: "Treasurer", name: "Test Signatory" },
  voided: null,
  with80G: true,
};

describe("donation receipt PDF", () => {
  it("renders one A4 page titled with the receipt number", async () => {
    const pdf = await generateDonationReceiptPdf(sampleReceipt);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect([
      ...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g),
    ]).toHaveLength(1);
    expect(text).toContain("(PI/2026-27/0001)");
  });

  it("renders the same bytes every time", async () => {
    const first = await generateDonationReceiptPdf(sampleReceipt);
    const second = await generateDonationReceiptPdf(sampleReceipt);
    expect(second.equals(first)).toBe(true);
  });

  it("embeds the product fonts", async () => {
    const text = (await generateDonationReceiptPdf(sampleReceipt)).toString(
      "latin1"
    );
    for (const font of [
      "Geist-Regular",
      "Geist-SemiBold",
      "BricolageGrotesque-SemiBold",
      "PaperMono-Medium",
    ]) {
      expect(text).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
    }
    expect(text).not.toContain("PlusJakartaSans");
  });

  it("keeps a voided receipt with long details on one page", async () => {
    const pdf = await generateDonationReceiptPdf({
      ...sampleReceipt,
      donor: {
        address: `${"Flat 1204, Block C, Synthetic Heights, 14th Cross, ".repeat(3)}Testville, Karnataka, India, 560102`,
        idNumber: "Z1234567",
        idType: "passport",
        name: "Dr. Venkatanarasimharajuvaripeta Subrahmanyam Lakshminarayanan Ramaswamy Iyengar",
      },
      gift: {
        ...sampleReceipt.gift,
        amountPaise: 9_876_543_210,
        channel: "cheque",
        donationType: "other",
        donationTypeDescription:
          "Specific grant towards the annual arts festival and student travel",
        programmeName: "Kalakriti Arts and Culture Programme for Schools",
        projectName: "Kalakriti 2026 Regional Finals and Travel Support",
        reference: "CHQ-000123-SYNTHETIC-BANK-OF-TESTVILLE-BRANCH-0042",
      },
      org: {
        ...sampleReceipt.org,
        address:
          "Synthetic Trust Office, 3rd Floor, 99 Example Industrial Estate, Old Airport Road, Testville 560017",
        name: "Example Charitable Trust for Optimists and Volunteers",
      },
      voided: {
        reason:
          "Issued against the wrong contribution after a duplicated statement import",
      },
    });
    expect([
      ...pdf.toString("latin1").matchAll(/\/Type \/Page\b/g),
    ]).toHaveLength(1);
  });

  it("prints IAST names and places in embedded fonts, never Helvetica", async () => {
    const pdf = await generateDonationReceiptPdf({
      ...sampleReceipt,
      donor: {
        ...sampleReceipt.donor,
        address: "12 Synthetic Galli, Ṭhāṇe, Mahārāṣṭra, India, 400601",
        name: "Kṛṣṇa Veṅkaṭeśa Ḍhaṇḍapāṇi",
      },
      signatory: { designation: "Treasurer", name: "Ṛṣabh Siṃha" },
    });
    const fonts = fontNames(pdf);
    expect(fonts).toContain("PlusJakartaSans-Regular");
    expect(fonts).toContain("PlusJakartaSans-Bold");
    expect(fonts.filter((font) => font.includes("Helvetica"))).toEqual([]);
  });

  it("marks every page of a voided receipt at the maximum lengths", async () => {
    const pdf = await generateDonationReceiptPdf({
      ...sampleReceipt,
      donor: {
        ...sampleReceipt.donor,
        address: textOf(
          500,
          "Flat 1204, Block C, Synthetic Heights, 14th Cross, "
        ),
        name: textOf(RECEIPT_SETTINGS_TEXT_MAX, "Synthetic Long Donor Name "),
      },
      gift: {
        ...sampleReceipt.gift,
        donationType: "other",
        donationTypeDescription: textOf(
          300,
          "Specific grant for student travel "
        ),
        projectName: "Kalakriti 2026 Regional Finals and Travel Support",
      },
      org: {
        ...sampleReceipt.org,
        address: textOf(
          RECEIPT_SETTINGS_ADDRESS_MAX,
          "99 Example Estate, Old Airport Road, "
        ),
        name: textOf(RECEIPT_SETTINGS_TEXT_MAX, "Example Charitable Trust "),
      },
      voided: {
        reason: textOf(VOID_REASON_MAX, "Issued against the wrong gift "),
      },
    });
    const pages = pageContents(pdf);
    // At these lengths the receipt spills over; the marker must follow it.
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page).toContain(DANGER_COLOUR);
    }
  });

  it("has no VOID marker on a valid receipt", async () => {
    const [page] = pageContents(
      await generateDonationReceiptPdf(sampleReceipt)
    );
    expect(page).not.toContain(DANGER_COLOUR);
  });

  it("renders a voided receipt without the 80G line", async () => {
    const pdf = await generateDonationReceiptPdf({
      ...sampleReceipt,
      donor: { ...sampleReceipt.donor, idNumber: null, idType: null },
      voided: { reason: "Wrong donor" },
      with80G: false,
    });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe("wholeWords", () => {
  it("keeps words and references up to 40 characters whole", () => {
    expect(wholeWords("Ḍhaṇḍapāṇi")).toEqual(["Ḍhaṇḍapāṇi"]);
    const reference = "pay_SYNTHETIC0000000000000000000000000AB";
    expect(reference).toHaveLength(40);
    expect(wholeWords(reference)).toEqual([reference]);
  });

  it("lets a longer run break between characters", () => {
    const run = "pay_SYNTHETIC00000000000000000000000000ABC";
    expect(wholeWords(run)).toEqual(Array.from(run));
  });
});
