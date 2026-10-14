import { beforeEach, describe, expect, it, mock } from "bun:test";

const PAN = "ABCDE1234F";

let registration: Record<string, string> | null = null;
let idModes: string[] = [];

const donor = (partyId: string, overrides: Record<string, unknown> = {}) => ({
  hasAddress: true,
  hasIdNumber: true,
  hasName: true,
  idType: "pan",
  idValid: true,
  partyId,
  taxCertificateOptOut: false,
  ...overrides,
});

const gift = (overrides: Record<string, unknown>) => ({
  amountPaise: 100_000,
  channel: "upi",
  currency: "INR",
  deductionEligible: "unknown",
  donationType: "voluntary",
  eligibilityReason: null,
  partyId: "p1",
  receivedOn: "2026-06-01",
  refundedPaise: 0,
  reportingMode: "electronic_or_account_payee",
  status: "received",
  ...overrides,
});

let facts = () => ({
  donors: new Map([
    ["p1", donor("p1")],
    ["p2", donor("p2", { hasIdNumber: false, idType: "none" })],
  ]),
  exportDetails: new Map([
    [
      "p1",
      {
        address: 'Flat 2, "Rose Villa", Bengaluru, 560001',
        idNumber: PAN,
        idNumberLast4: "234F",
        name: "Asha Rao",
      },
    ],
    [
      "p2",
      {
        address: "",
        idNumber: null,
        idNumberLast4: null,
        name: "Bina Shah",
      },
    ],
  ]),
  gifts: [
    gift({ id: "g1" }),
    gift({ amountPaise: 50_000, id: "g2", refundedPaise: 10_000 }),
    gift({ id: "g3", partyId: "p2" }),
    gift({
      deductionEligible: "no",
      eligibilityReason: "Not a donation",
      id: "g4",
    }),
  ],
});

mock.module("@pi-dash/db/queries/donations-return", () => ({
  loadReturnFacts: async (_range: unknown, idMode: string) => {
    idModes.push(idMode);
    return facts();
  },
  loadReturnRegistration: async () => registration,
}));

const { buildAllGiftsFile, buildUploadFile, DonationsReturnError } =
  await import("./donations-return-export");

const fy = {
  endsOn: "2027-03-31",
  label: "2026-27",
  startsOn: "2026-04-01",
};

describe("buildUploadFile", () => {
  beforeEach(() => {
    registration = {
      sectionCode: "Section 80G",
      urn: "AAATP1234AF20214",
      urnIssuedOn: "2021-05-28",
    };
    idModes = [];
  });

  it("needs the 80G registration", async () => {
    registration = null;
    await expect(buildUploadFile(fy)).rejects.toBeInstanceOf(
      DonationsReturnError
    );
    expect(idModes).toEqual([]);
  });

  it("writes ready gifts only, aggregated, net of refunds, with CSV escaping", async () => {
    const built = await buildUploadFile(fy);
    expect(idModes).toEqual(["reveal"]);
    expect(built.giftCount).toBe(2);
    expect(built.rowCount).toBe(1);
    expect(built.file.filename).toBe("donations-return-FY2026-27-upload.csv");
    const lines = built.file.csv.split("\n");
    expect(lines[0]).toBe(
      "Sr. No.,Pre Acknowledgement Number,ID Code,Unique Identification Number,Section Code,Unique Registration Number (URN),Date of Issuance of Unique Registration Number,Name of donor,Address of donor,Donation Type,Mode of receipt,Amount of donation (Indian Rupees)"
    );
    expect(lines[1]).toBe(
      `1,,Permanent Account Number,${PAN},Section 80G,AAATP1234AF20214,28-05-2021,Asha Rao,"Flat 2, ""Rose Villa"", Bengaluru, 560001",Others,Electronic modes including account payee cheque/draft,1400.00`
    );
    expect(lines).toHaveLength(2);
  });

  it("refuses when no gift is ready", async () => {
    const original = facts;
    facts = () => ({
      ...original(),
      gifts: [gift({ id: "g3", partyId: "p2" })],
    });
    try {
      await expect(buildUploadFile(fy)).rejects.toThrow("No gift is ready");
    } finally {
      facts = original;
    }
  });
});

describe("buildAllGiftsFile", () => {
  beforeEach(() => {
    idModes = [];
  });

  it("lists every gift with its status and a masked ID only", async () => {
    const built = await buildAllGiftsFile(fy);
    expect(idModes).toEqual(["validate"]);
    expect(built.rowCount).toBe(4);
    expect(built.file.csv).not.toContain(PAN);
    const lines = built.file.csv.split("\n");
    expect(lines[0]?.split(",")).toEqual([
      "Received on",
      "Donor",
      "ID (last 4)",
      "Amount (₹)",
      "Refunded (₹)",
      "Net (₹)",
      "Channel",
      "Mode of receipt",
      "Donation type",
      "Tax certificate",
      "Status",
      "Reason",
      "Contribution ID",
    ]);
    expect(lines[1]).toContain("PAN ending 234F");
    expect(lines[2]).toContain("500.00,100.00,400.00");
    expect(lines[3]).toContain("Needs attention,No ID number");
    expect(lines[4]).toContain("Excluded,Gift excluded: Not a donation");
  });
});
