import { describe, expect, it } from "bun:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { generatePayoutFixture } from "../../../../../packages/e2e/fixtures/give-do/generate";
import { FOREIGN_CURRENCY_MESSAGE } from "../income-import/normalize";
import {
  GiveDoPayoutParseError,
  parseGiveDoPayout,
  payoutFromRows,
} from "./parse";

const workbook = () => Buffer.from(generatePayoutFixture());

function replaceInSheet(
  input: Buffer,
  sheet: 1 | 2,
  from: string,
  to: string
): Buffer {
  const files = unzipSync(input);
  const path = `xl/worksheets/sheet${sheet}.xml`;
  const sheetData = files[path];
  if (!sheetData) {
    throw new Error(`Test workbook does not contain ${path}`);
  }
  const source = strFromU8(sheetData);
  if (!source.includes(from)) {
    throw new Error(`Test workbook does not contain ${from}`);
  }
  files[path] = strToU8(source.replace(from, to));
  return Buffer.from(
    zipSync(files, {
      level: 6,
      mtime: new Date("1980-01-01T00:00:00Z"),
    })
  );
}

async function parsedRows() {
  return (await parseGiveDoPayout(workbook())).donations.rows;
}

describe("parseGiveDoPayout", () => {
  it("reads exact named sheets, string and Excel dates, raw rows and totals", async () => {
    const result = await parseGiveDoPayout(workbook());

    expect(result).toMatchObject({
      amountPaise: 146_300,
      feesPaise: 3700,
      grossPaise: 150_000,
      items: [
        {
          creditPaise: 97_500,
          externalId: "LC0000000000001",
          feePaise: 2500,
        },
        {
          creditPaise: 48_800,
          externalId: "LC0000000000002",
          feePaise: 1200,
        },
      ],
      utr: "GIVEDO20261012",
    });
    expect(result.donations.rows.map((row) => row.Date)).toEqual([
      "11/10/2026",
      "12/10/2026",
    ]);
    expect(result.donations.rows[0]?.["Donor Name"]).toBe(
      "Synthetic Donor One"
    );
    expect(result.donations.rowIssues).toEqual([null, null]);
  });

  it("accepts base64 input", async () => {
    const result = await parseGiveDoPayout(workbook().toString("base64"));
    expect(result.utr).toBe("GIVEDO20261012");
  });

  it("requires the exact Donations headers", async () => {
    const changed = replaceInSheet(
      workbook(),
      1,
      "Donor Phone",
      "Donor Telephone"
    );
    await expect(parseGiveDoPayout(changed)).rejects.toThrow(
      "The Donations sheet headers don't match the expected give.do payout format."
    );
  });

  it("rejects nonempty data cells beyond the exact headers", async () => {
    const changed = replaceInSheet(
      workbook(),
      1,
      'GIVEDO20261012</t></is></c></row><row r="3">',
      'GIVEDO20261012</t></is></c><c r="Z2" t="inlineStr"><is><t>unexpected</t></is></c></row><row r="3">'
    );
    await expect(parseGiveDoPayout(changed)).rejects.toThrow(
      "The Donations sheet has extra cells at row 2."
    );
  });

  it("checks Campaign Level totals against grouped donation sums", async () => {
    const changed = replaceInSheet(workbook(), 2, "<v>1463</v>", "<v>1462</v>");
    await expect(parseGiveDoPayout(changed)).rejects.toThrow(
      "The Campaign Level totals do not match the Donations sheet at row 2."
    );
  });

  it("rejects campaigns missing from either sheet", async () => {
    const changed = replaceInSheet(workbook(), 2, "CAMPAIGN001", "CAMPAIGN002");
    await expect(parseGiveDoPayout(changed)).rejects.toThrow(
      "The Campaign Level sheet contains a campaign absent from Donations."
    );
  });

  it("rejects a Campaign Level UTR that differs from Donations", async () => {
    const changed = replaceInSheet(
      workbook(),
      2,
      "GIVEDO20261012",
      "GIVEDO20261013"
    );
    await expect(parseGiveDoPayout(changed)).rejects.toThrow(
      "The Campaign Level sheet UTR does not match the Donations sheet."
    );
  });

  it("uses the shared foreign-currency guard for either sheet", async () => {
    const changed = replaceInSheet(workbook(), 2, ">INR<", ">USD<");
    await expect(parseGiveDoPayout(changed)).rejects.toThrow(
      FOREIGN_CURRENCY_MESSAGE
    );
  });

  it("caps decoded bytes and hides workbook-parser details", async () => {
    await expect(
      parseGiveDoPayout(Buffer.alloc(5 * 1024 * 1024 + 1))
    ).rejects.toThrow("The payout file is larger than 5 MB.");
    await expect(parseGiveDoPayout(Buffer.from("not an xlsx"))).rejects.toThrow(
      "The file could not be read as an XLSX workbook."
    );
    await expect(parseGiveDoPayout("%%%")).rejects.toThrow(
      "The payout file is not valid base64."
    );
  });
});

describe("payoutFromRows", () => {
  it("revalidates retained rows and derives the payout", async () => {
    const payout = payoutFromRows(await parsedRows());
    expect(payout).toMatchObject({
      amountPaise: 146_300,
      feesPaise: 3700,
      grossPaise: 150_000,
      utr: "GIVEDO20261012",
    });
  });

  it("requires unique Transaction IDs and one alphanumeric UTR", async () => {
    const rows = await parsedRows();
    rows[1]!["Transaction ID"] = rows[0]!["Transaction ID"] ?? "";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet repeats a Transaction ID at row 3."
    );

    rows[1]!["Transaction ID"] = "LC0000000000002";
    rows[1]!.UTR = "different-utr";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet has an invalid UTR at row 3."
    );
  });

  it("requires valid dates, nonnegative money, and gross = fees + payable", async () => {
    const rows = await parsedRows();
    rows[0]!.Date = "31/02/2026";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet has an invalid date at row 2."
    );

    rows[0]!.Date = "11/10/2026";
    rows[0]!["Payment processing and Applicable promotional charges"] = "-1";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet has a negative amount at row 2."
    );

    rows[0]!["Payment processing and Applicable promotional charges"] = "25";
    rows[0]!["Payable Amount"] = "974";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet amounts do not add up at row 2."
    );
  });

  it("requires a positive Donation Amount within the shared contribution cap", async () => {
    const rows = await parsedRows();
    rows[0]!["Donation Amount"] = "0";
    rows[0]!["Payment processing and Applicable promotional charges"] = "0";
    rows[0]!["Payable Amount"] = "0";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet has a zero Donation Amount at row 2."
    );

    rows[0]!["Donation Amount"] = "10000000000";
    rows[0]!["Payable Amount"] = "9999999975";
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet has a Donation Amount above the allowed maximum at row 2."
    );
  });

  it("rejects foreign and converted currencies with the exact shared message", async () => {
    const rows = await parsedRows();
    rows[0]!["Donation Currency"] = "USD";
    expect(() => payoutFromRows(rows)).toThrow(FOREIGN_CURRENCY_MESSAGE);

    rows[0]!["Donation Currency"] = "INR";
    rows[0]!["Converted Currency (If International)"] = "INR";
    expect(() => payoutFromRows(rows)).toThrow(FOREIGN_CURRENCY_MESSAGE);
  });

  it("caps retained rows before inspecting their contents", async () => {
    const [row] = await parsedRows();
    const rows = Array.from({ length: 5001 }, () => ({ ...row }));
    expect(() => payoutFromRows(rows)).toThrow(
      "The Donations sheet has more than 5,000 rows."
    );
  });

  it("never includes private cell contents in validation errors", async () => {
    const rows = await parsedRows();
    rows[0]!["Donor Name"] = "PRIVATE-SYNTHETIC-DONOR";
    rows[0]!["Transaction ID"] = "PRIVATE-TRANSACTION";
    rows[0]!["Donation Amount"] = "PRIVATE-AMOUNT";

    let error: unknown;
    try {
      payoutFromRows(rows);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GiveDoPayoutParseError);
    expect(String(error)).not.toContain("PRIVATE-");
  });
});
