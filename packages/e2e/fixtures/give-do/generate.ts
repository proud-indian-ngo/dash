import { strToU8, zipSync } from "fflate";

type Cell = Date | number | string;

const DONATION_HEADERS = [
  "Date",
  "Time",
  "Transaction ID",
  "Campaign ID",
  "Campaign Name",
  "Campaign Link",
  "Fundraiser Name",
  "Donor Name",
  "Donor Address Line 1",
  "Donor Address Line 2",
  "Donor City",
  "Donor Town / State",
  "Donor Country",
  "Donor Zipcode / Pincode",
  "Donor Complete Address",
  "Donor Email",
  "Donor Phone",
  "Donor PAN",
  "Donation Currency",
  "Donation Amount",
  "Converted Currency (If International)",
  "Converted Amount (If International)",
  "Payment processing and Applicable promotional charges",
  "Payable Amount",
  "UTR",
] as const;

const CAMPAIGN_HEADERS = [
  "Campaign ID",
  "Total Donation Amount",
  "Total Retention Amount",
  "Campaign Link",
  "Currency",
  "Total Payable Amount",
  "UTR",
] as const;

const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function excelSerial(date: Date): number {
  return date.getTime() / 86_400_000 + 25_569;
}

function cellXml(value: Cell, column: number, row: number): string {
  const reference = `${columnName(column)}${row}`;
  if (value instanceof Date) {
    return `<c r="${reference}" s="1"><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function sheetXml(rows: readonly (readonly Cell[])[]): string {
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, column) => cellXml(cell, column, rowIndex + 1))
          .join("")}</row>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

export function generatePayoutFixture(): Uint8Array {
  const utr = "GIVEDO20261012";
  const campaignId = "CAMPAIGN001";
  const campaignLink = "https://give.do/fake-campaign";
  const donations: Cell[][] = [
    [...DONATION_HEADERS],
    [
      new Date("2026-10-11T00:00:00Z"),
      "9:15 AM",
      "LC0000000000001",
      campaignId,
      "Synthetic education campaign",
      campaignLink,
      "Synthetic fundraiser",
      "Synthetic Donor One",
      "1 Test Lane",
      "",
      "Test City",
      "Test State",
      "India",
      "100001",
      "1 Test Lane, Test City",
      "donor.one@example.invalid",
      "+919999990001",
      "",
      "INR",
      1000,
      "",
      "",
      25,
      975,
      utr,
    ],
    [
      "12/10/2026",
      "10:30 AM",
      "LC0000000000002",
      campaignId,
      "Synthetic education campaign",
      campaignLink,
      "Synthetic fundraiser",
      "Synthetic Donor Two",
      "2 Test Lane",
      "",
      "Test City",
      "Test State",
      "India",
      "100002",
      "2 Test Lane, Test City",
      "donor.two@example.invalid",
      "+919999990002",
      "",
      "INR",
      500,
      "",
      "",
      12,
      488,
      utr,
    ],
  ];
  const campaigns: Cell[][] = [
    [...CAMPAIGN_HEADERS],
    [campaignId, 1500, 37, campaignLink, "INR", 1463, utr],
  ];
  const files = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    ),
    "xl/styles.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>'
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Donations" sheetId="1" r:id="rId1"/><sheet name="Campaign Level" sheetId="2" r:id="rId2"/></sheets></workbook>'
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml(donations)),
    "xl/worksheets/sheet2.xml": strToU8(sheetXml(campaigns)),
  };
  return zipSync(files, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00Z"),
  });
}

if (import.meta.main) {
  await Bun.write(
    new URL("payout-sample.xlsx", import.meta.url),
    generatePayoutFixture()
  );
}
