import { describe, expect, it } from "bun:test";

import type { UtilisationCertificateSnapshot } from "@pi-dash/shared/utilisation-certificates";

import { pdfWords } from "./pdf-text.test-helper";
import { generateUtilisationCertificatePdf } from "./utilisation-certificate";

const snapshot: UtilisationCertificateSnapshot = {
  caRequired: true,
  figures: {
    broughtForwardPaise: 150_000,
    closingPaise: 535_000,
    heads: [
      {
        accountHeadId: "h1",
        budgetPaise: 200_000,
        name: "Travel",
        periodPaise: 40_000,
        toDatePaise: 140_000,
      },
      {
        accountHeadId: "h2",
        budgetPaise: null,
        name: "Food",
        periodPaise: 25_000,
        toDatePaise: 25_000,
      },
    ],
    interestBroughtForwardPaise: 0,
    interestPaise: 10_000,
    received: [
      {
        contributionId: "c1",
        on: "2026-10-10",
        paise: 300_000,
        reference: "UTR-77",
      },
      {
        contributionId: "c2",
        on: "2026-10-20",
        paise: 160_000,
        reference: null,
      },
    ],
    receivedPaise: 460_000,
    refunds: [
      {
        contributionId: "c1",
        on: "2026-10-15",
        paise: 20_000,
        reference: "R-1",
      },
    ],
    refundedPaise: 20_000,
    spentPaise: 65_000,
    totalAvailablePaise: 600_000,
  },
  grant: {
    agreementOn: "2026-05-20",
    agreementReference: "CSR/2026/14",
    grantor: "Fictional Industries Ltd",
    programme: "Education",
    project: "Reading rooms",
    sanctionedPaise: 1_000_000,
    scheduleViiItem: "(ii) promoting education",
    title: "Reading rooms 2026",
  },
  number: "UC/2026-27/001",
  period: { from: "2026-10-01", to: "2026-11-30" },
  place: "Bengaluru",
  preparedOn: "2026-12-02",
  signatories: {
    finance: {
      name: "Vikram Menon",
      office: "joint_managing_trustee",
      trusteeId: "01930000-0000-7000-8000-00000000d102",
    },
    head: {
      name: "Asha Rao",
      office: "managing_trustee",
      trusteeId: "01930000-0000-7000-8000-00000000d101",
    },
  },
  trust: {
    address: "Bengaluru 560016",
    csr1: "CSR00012345",
    name: "Proud Indian",
    pan: "AAATP1234C",
    registration12ab: "AAATP1234CE20201",
    registration80g: "AAATP1234CF20211",
  },
  version: 1,
};

describe("generateUtilisationCertificatePdf", () => {
  it("prints the balance chain, the particulars and the signature page", async () => {
    const pdf = await generateUtilisationCertificatePdf(snapshot);
    const words = (await pdfWords(pdf)).join(" ");
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
    for (const expected of [
      "UC/2026-27/001",
      "CSR00012345",
      "UTR-77",
      "Closing unspent balance",
      "Head of the Organisation (Managing Trustee)",
      "Chief Finance Officer (Joint Managing Trustee)",
      "UDIN",
    ]) {
      expect(words).toContain(expected);
    }
  });

  it("renders the same bytes twice and leaves out the CA slot when not asked", async () => {
    const plain = { ...snapshot, caRequired: false };
    const [a, b] = await Promise.all([
      generateUtilisationCertificatePdf(plain),
      generateUtilisationCertificatePdf(plain),
    ]);
    expect(a.equals(b)).toBe(true);
    expect((await pdfWords(a)).join(" ")).not.toContain("UDIN");
  });
});
