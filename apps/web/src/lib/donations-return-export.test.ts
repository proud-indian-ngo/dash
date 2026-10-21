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
  identifiersAvailable: true,
  gifts: [
    gift({ id: "g1" }),
    gift({ amountPaise: 50_000, id: "g2", refundedPaise: 10_000 }),
    gift({ channel: "razorpay", id: "g3", partyId: "p2" }),
    gift({
      deductionEligible: "no",
      eligibilityReason: "Not a donation",
      id: "g4",
    }),
  ],
});

mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadLiveReceiptNumbers: async () => new Map([["g1", "PI/2026-27/0001"]]),
}));

let filed = new Map<string, number>();
mock.module("@pi-dash/db/queries/donation-filings", () => ({
  loadFiledSequences: async () => filed,
}));

mock.module("@pi-dash/db/queries/donations-return", () => ({
  loadReturnFacts: async (_range: unknown, idMode: string) => {
    idModes.push(idMode);
    return facts();
  },
  loadReturnRegistration: async () => registration,
}));

const {
  buildAllGiftsFile,
  buildUploadFile,
  DonationsReturnError,
  loadAllGiftsRows,
} = await import("./donations-return-export");

const fy = {
  endsOn: "2027-03-31",
  label: "2026-27",
  startsOn: "2026-04-01",
};

const firstFiling = {
  filedSequences: new Map<string, number>(),
  reader: undefined,
  sequence: 1,
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
    await expect(buildUploadFile(fy, firstFiling)).rejects.toBeInstanceOf(
      DonationsReturnError
    );
    expect(idModes).toEqual([]);
  });

  it("writes ready gifts only, aggregated, net of refunds, with CSV escaping", async () => {
    const built = await buildUploadFile(fy, firstFiling);
    expect(idModes).toEqual(["reveal"]);
    expect(built.giftCount).toBe(2);
    expect(built.rows).toHaveLength(1);
    expect(built.rows[0]).toMatchObject({
      giftIds: ["g1", "g2"],
      idType: "pan",
      preArn: "PI2627F01R00001",
      srNo: 1,
    });
    expect(built.file.filename).toBe("donations-return-FY2026-27-filing-1.csv");
    const lines = built.file.csv.split("\n");
    expect(lines[0]).toBe(
      "Sr. No.,Pre Acknowledgement Number,ID Code,Unique Identification Number,Section Code,Unique Registration Number (URN),Date of Issuance of Unique Registration Number,Name of donor,Address of donor,Donation Type,Mode of receipt,Amount of donation (Indian Rupees)"
    );
    expect(lines[1]).toBe(
      `1,PI2627F01R00001,Permanent Account Number,${PAN},Section 80G,AAATP1234AF20214,28-05-2021,Asha Rao,"Flat 2, ""Rose Villa"", Bengaluru, 560001",Specific grant,Electronic modes including account payee cheque/draft,1400.00`
    );
    expect(lines).toHaveLength(2);
  });

  it("writes each cash gift on its own row and normalises ID numbers", async () => {
    const original = facts;
    facts = () => {
      const base = original();
      const p1 = base.exportDetails.get("p1");
      if (p1) {
        p1.idNumber = "abcde 1234-f";
        p1.name = "-Asha";
      }
      return {
        ...base,
        gifts: [
          gift({ channel: "cash", id: "c1", reportingMode: "cash" }),
          gift({ channel: "cash", id: "c2", reportingMode: "cash" }),
        ],
      };
    };
    try {
      const built = await buildUploadFile(fy, firstFiling);
      expect(built.rows).toHaveLength(2);
      const lines = built.file.csv.split("\n");
      expect(lines[1]).toContain(`Permanent Account Number,${PAN},`);
      // No formula apostrophe in the portal file.
      expect(lines[1]).toContain(",-Asha,");
      expect(lines[1]?.endsWith(",Cash,1000.00")).toBe(true);
      expect(lines[2]?.startsWith("2,")).toBe(true);
    } finally {
      facts = original;
    }
  });

  it("leaves out gifts already in a filing and numbers the next filing's rows", async () => {
    const built = await buildUploadFile(fy, {
      filedSequences: new Map([["g1", 1]]),
      reader: undefined,
      sequence: 2,
    });
    expect(built.giftCount).toBe(1);
    expect(built.rows.map((row) => [row.giftIds, row.preArn])).toEqual([
      [["g2"], "PI2627F02R00001"],
    ]);
    expect(built.file.csv.split("\n")[1]).toContain(
      "1,PI2627F02R00001,Permanent Account Number,"
    );
    expect(built.file.csv.split("\n")[1]?.endsWith(",400.00")).toBe(true);
  });

  it("refuses when every ready gift is already filed", async () => {
    await expect(
      buildUploadFile(fy, {
        filedSequences: new Map([
          ["g1", 1],
          ["g2", 1],
        ]),
        reader: undefined,
        sequence: 2,
      })
    ).rejects.toThrow("No gift is ready for a new filing");
  });

  it("refuses without the encryption key", async () => {
    const original = facts;
    facts = () => ({ ...original(), identifiersAvailable: false });
    try {
      await expect(buildUploadFile(fy, firstFiling)).rejects.toThrow(
        "Identifiers unavailable"
      );
    } finally {
      facts = original;
    }
  });

  it("refuses when no gift is ready", async () => {
    const original = facts;
    facts = () => ({
      ...original(),
      gifts: [gift({ id: "g3", partyId: "p2" })],
    });
    try {
      await expect(buildUploadFile(fy, firstFiling)).rejects.toThrow(
        "No gift is ready"
      );
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
    expect(built.file.csv.startsWith("\uFEFF")).toBe(true);
    const lines = built.file.csv.slice(1).split("\n");
    expect(lines[0]?.split(",")).toEqual([
      "Received on",
      "Donor",
      "ID (last 4)",
      "Amount (INR)",
      "Refunded (INR)",
      "Net (INR)",
      "Channel",
      "Mode of receipt",
      "Donation type",
      "Tax certificate",
      "Status",
      "Reason",
      "Receipt issued by",
      "Receipt number",
      "Contribution ID",
    ]);
    expect(lines[1]).toContain("PAN ending 234F");
    expect(lines[1]).toContain("Proud Indian,PI/2026-27/0001,g1");
    expect(lines[2]).toContain("Proud Indian,Not issued yet,g2");
    expect(lines[3]).toContain("Razorpay,,g3");
    expect(lines[2]).toContain("500.00,100.00,400.00");
    expect(lines[3]).toContain("Needs attention,No ID number");
    expect(lines[4]).toContain("Excluded,Gift excluded: Not a donation");
  });

  it("marks gifts already in a filing", async () => {
    filed = new Map([["g1", 2]]);
    try {
      const lines = (await buildAllGiftsFile(fy)).file.csv.split("\n");
      expect(lines[1]).toContain("Filed,Filing 2");
      expect(lines[2]).toContain("Ready,");
    } finally {
      filed = new Map();
    }
  });
});

describe("loadAllGiftsRows (CA workbook)", () => {
  beforeEach(() => {
    idModes = [];
  });

  it("masks every ID to its last four characters", async () => {
    const rows = await loadAllGiftsRows(fy);
    expect(idModes).toEqual(["validate"]);
    expect(JSON.stringify(rows)).not.toContain(PAN);
    expect(rows[0]?.id).toBe("PAN ending 234F");
    expect([rows[0]?.receiptIssuer, rows[0]?.receiptNumber]).toEqual([
      "Proud Indian",
      "PI/2026-27/0001",
    ]);
    // A donor without an ID stays blank.
    expect(rows[2]?.id).toBe("");
  });
});
