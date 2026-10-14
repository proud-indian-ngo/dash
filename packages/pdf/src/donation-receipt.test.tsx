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
