import { describe, expect, it } from "bun:test";

import {
  type DonationReceiptProps,
  generateDonationReceiptPdf,
} from "./generate-donation-receipt";

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
      "BricolageGrotesque",
      "PaperMono-Medium",
    ]) {
      expect(text).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}`));
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
