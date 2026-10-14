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

function replaceInFile(
  input: Buffer,
  path: string,
  from: string,
  to: string
): Buffer {
  const files = unzipSync(input);
  const fileData = files[path];
  if (!fileData) {
    throw new Error(`Test workbook does not contain ${path}`);
  }
  const source = strFromU8(fileData);
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

function replaceInSheet(
  input: Buffer,
  sheet: 1 | 2,
  from: string,
  to: string
): Buffer {
  return replaceInFile(input, `xl/worksheets/sheet${sheet}.xml`, from, to);
}

function setDeclaredUncompressedSize(
  input: Buffer,
  fileName: string,
  uncompressedBytes: number
): Buffer {
  const changed = Buffer.from(input);
  const name = Buffer.from(fileName);
  const centralNameOffset = changed.lastIndexOf(name);
  const centralHeaderOffset = centralNameOffset - 46;
  if (
    centralNameOffset < 0 ||
    changed.readUInt32LE(centralHeaderOffset) !== 0x0201_4b50
  ) {
    throw new Error(`Test archive has no central entry for ${fileName}`);
  }
  const localHeaderOffset = changed.readUInt32LE(centralHeaderOffset + 42);
  changed.writeUInt32LE(uncompressedBytes, centralHeaderOffset + 24);
  changed.writeUInt32LE(uncompressedBytes, localHeaderOffset + 22);
  return changed;
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

  it("reads unstyled numeric dates with the workbook's 1900 or 1904 epoch", async () => {
    const epoch1900 = replaceInSheet(
      workbook(),
      1,
      '<c r="A2" s="1"><v>46306</v></c>',
      '<c r="A2"><v>46306</v></c>'
    );
    expect(
      (await parseGiveDoPayout(epoch1900)).donations.rows.map((row) => row.Date)
    ).toEqual(["11/10/2026", "12/10/2026"]);

    const early1900 = replaceInSheet(
      workbook(),
      1,
      '<c r="A2" s="1"><v>46306</v></c>',
      '<c r="A2"><v>1</v></c>'
    );
    expect((await parseGiveDoPayout(early1900)).donations.rows[0]?.Date).toBe(
      "01/01/1900"
    );

    const fictionalLeapDay = replaceInSheet(
      workbook(),
      1,
      '<c r="A2" s="1"><v>46306</v></c>',
      '<c r="A2"><v>60</v></c>'
    );
    await expect(parseGiveDoPayout(fictionalLeapDay)).rejects.toThrow(
      "The workbook contains an invalid date cell."
    );

    const epoch1904 = replaceInFile(
      replaceInSheet(
        workbook(),
        1,
        '<c r="A2" s="1"><v>46306</v></c>',
        '<c r="A2"><v>44844</v></c>'
      ),
      "xl/workbook.xml",
      "<sheets>",
      '<workbookPr date1904="1"/><sheets>'
    );
    expect(
      (await parseGiveDoPayout(epoch1904)).donations.rows.map((row) => row.Date)
    ).toEqual(["11/10/2026", "12/10/2026"]);
  });

  it("rejects a highly compressible archive before reading its sheets", async () => {
    const files = unzipSync(workbook());
    files["xl/highly-compressible.bin"] = new Uint8Array(1024 * 1024).fill(65);
    const compressed = Buffer.from(
      zipSync(files, {
        level: 9,
        mtime: new Date("1980-01-01T00:00:00Z"),
      })
    );

    expect(compressed.byteLength).toBeLessThan(20_000);
    await expect(parseGiveDoPayout(compressed)).rejects.toThrow(
      "The XLSX workbook exceeds the safe archive limits."
    );
  });

  it("enforces per-entry and total expanded sizes from ZIP metadata", async () => {
    const files = unzipSync(workbook());
    files["padding/large.bin"] = new Uint8Array([1]);
    const oneEntry = Buffer.from(
      zipSync(files, {
        level: 0,
        mtime: new Date("1980-01-01T00:00:00Z"),
      })
    );
    await expect(
      parseGiveDoPayout(
        setDeclaredUncompressedSize(
          oneEntry,
          "padding/large.bin",
          25 * 1024 * 1024 + 1
        )
      )
    ).rejects.toThrow("The XLSX workbook exceeds the safe archive limits.");

    files["padding/one.bin"] = new Uint8Array([1]);
    files["padding/two.bin"] = new Uint8Array([2]);
    files["padding/three.bin"] = new Uint8Array([3]);
    let combined: Buffer = Buffer.from(
      zipSync(files, {
        level: 0,
        mtime: new Date("1980-01-01T00:00:00Z"),
      })
    );
    for (const name of [
      "padding/one.bin",
      "padding/two.bin",
      "padding/three.bin",
    ]) {
      combined = setDeclaredUncompressedSize(combined, name, 17 * 1024 * 1024);
    }
    await expect(parseGiveDoPayout(combined)).rejects.toThrow(
      "The XLSX workbook exceeds the safe archive limits."
    );
  });

  it("rejects forged small expanded sizes before the workbook reader", async () => {
    const files = unzipSync(workbook());
    const fileName = "padding/forged.bin";
    files[fileName] = new Uint8Array(1024 * 1024).fill(65);
    const compressed = Buffer.from(
      zipSync(files, {
        level: 9,
        mtime: new Date("1980-01-01T00:00:00Z"),
      })
    );
    const centralNameOffset = compressed.lastIndexOf(Buffer.from(fileName));
    const compressedBytes = compressed.readUInt32LE(
      centralNameOffset - 46 + 20
    );
    const forged = setDeclaredUncompressedSize(
      compressed,
      fileName,
      compressedBytes * 50
    );

    await expect(parseGiveDoPayout(forged)).rejects.toThrow(
      "The file could not be read as an XLSX workbook."
    );
  });

  it("rejects excessive entries and unsupported ZIP64 metadata", async () => {
    const files = unzipSync(workbook());
    for (let index = 0; index < 1000; index += 1) {
      files[`padding/${index}`] = new Uint8Array();
    }
    await expect(
      parseGiveDoPayout(
        Buffer.from(
          zipSync(files, {
            level: 0,
            mtime: new Date("1980-01-01T00:00:00Z"),
          })
        )
      )
    ).rejects.toThrow("The XLSX workbook exceeds the safe archive limits.");

    const zip64 = workbook();
    const endRecord = zip64.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(endRecord).toBeGreaterThanOrEqual(0);
    zip64.writeUInt16LE(0xffff, endRecord + 10);
    await expect(parseGiveDoPayout(zip64)).rejects.toThrow(
      "ZIP64 XLSX workbooks are not supported."
    );
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

    // One genuinely foreign donation: converted from USD on the second row.
    const foreignRow = replaceInSheet(
      workbook(),
      1,
      '<c r="U3" t="inlineStr"><is><t xml:space="preserve">INR</t>',
      '<c r="U3" t="inlineStr"><is><t xml:space="preserve">USD</t>'
    );
    await expect(parseGiveDoPayout(foreignRow)).rejects.toThrow(
      FOREIGN_CURRENCY_MESSAGE
    );
  });

  it("imports domestic rows whose converted columns repeat INR", async () => {
    const result = await parseGiveDoPayout(workbook());
    expect(
      result.donations.rows.map((row) => [
        row["Converted Currency (If International)"],
        row["Converted Amount (If International)"],
      ])
    ).toEqual([
      ["INR", "1000"],
      ["INR", "500"],
    ]);

    const spaced = replaceInSheet(workbook(), 2, ">INR<", "> inr <");
    expect((await parseGiveDoPayout(spaced)).utr).toBe("GIVEDO20261012");
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
    rows[0]!["Converted Currency (If International)"] = "USD";
    expect(() => payoutFromRows(rows)).toThrow(FOREIGN_CURRENCY_MESSAGE);

    for (const domestic of ["INR", " inr ", ""]) {
      rows[0]!["Donation Currency"] = " Inr ";
      rows[0]!["Converted Currency (If International)"] = domestic;
      expect(payoutFromRows(rows).grossPaise).toBe(150_000);
    }
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
