import {
  MAX_AMOUNT_PAISE,
  rupeesToPaise,
  sumPaise,
} from "@pi-dash/shared/money";
import readExcelFile, {
  type CellValue,
  type SheetData,
} from "read-excel-file/node";

import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
} from "@/lib/income-import/fields";
import { FOREIGN_CURRENCY_MESSAGE } from "@/lib/income-import/normalize";
import type { ParsedCsv } from "@/lib/income-import/parse-csv";

import {
  GIVE_DO_PAYOUT_CAMPAIGN_HEADERS,
  GIVE_DO_PAYOUT_CAMPAIGN_SHEET,
  GIVE_DO_PAYOUT_DONATION_HEADERS,
  GIVE_DO_PAYOUT_DONATIONS_SHEET,
} from "./fields";
import {
  sanitizeXlsxArchive,
  XlsxArchiveValidationError,
} from "./xlsx-archive";

type RawRow = Record<string, string>;

export interface GiveDoPayoutItem {
  creditPaise: number;
  externalId: string;
  feePaise: number;
}

export interface GiveDoPayoutTotals {
  amountPaise: number;
  feesPaise: number;
  grossPaise: number;
  items: GiveDoPayoutItem[];
  utr: string;
}

export interface ParsedGiveDoPayout extends GiveDoPayoutTotals {
  donations: ParsedCsv;
}

export class GiveDoPayoutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiveDoPayoutParseError";
  }
}

const UTR_PATTERN = /^[a-z0-9]+$/i;
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function fail(message: string): never {
  throw new GiveDoPayoutParseError(message);
}

function validDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function moneyAt(row: RawRow, header: string, rowNumber: number): number {
  try {
    const paise = rupeesToPaise(row[header] ?? "");
    if (paise < 0) {
      fail(`The Donations sheet has a negative amount at row ${rowNumber}.`);
    }
    if (header === "Donation Amount" && paise === 0) {
      fail(
        `The Donations sheet has a zero Donation Amount at row ${rowNumber}.`
      );
    }
    if (header === "Donation Amount" && paise > MAX_AMOUNT_PAISE) {
      fail(
        `The Donations sheet has a Donation Amount above the allowed maximum at row ${rowNumber}.`
      );
    }
    return paise;
  } catch (error) {
    if (error instanceof GiveDoPayoutParseError) {
      throw error;
    }
    return fail(
      `The Donations sheet has an invalid amount at row ${rowNumber}.`
    );
  }
}

function campaignMoneyAt(
  row: RawRow,
  header: string,
  rowNumber: number
): number {
  try {
    const paise = rupeesToPaise(row[header] ?? "");
    if (paise < 0) {
      fail(
        `The Campaign Level sheet has a negative amount at row ${rowNumber}.`
      );
    }
    return paise;
  } catch (error) {
    if (error instanceof GiveDoPayoutParseError) {
      throw error;
    }
    return fail(
      `The Campaign Level sheet has an invalid amount at row ${rowNumber}.`
    );
  }
}

function safeSum(values: Iterable<number>, sheet: string): number {
  try {
    return sumPaise(values);
  } catch {
    return fail(
      `The ${sheet} sheet contains an amount total that is too large.`
    );
  }
}

/**
 * Revalidates retained donation rows before import and derives the settlement
 * values from them. Messages identify only a sheet and row, never cell data.
 */
export function payoutFromRows(rows: readonly RawRow[]): GiveDoPayoutTotals {
  if (rows.length === 0) {
    return fail("The Donations sheet has no donation rows.");
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return fail(
      `The Donations sheet has more than ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows.`
    );
  }

  const transactionIds = new Set<string>();
  let payoutUtr: string | null = null;
  const items: GiveDoPayoutItem[] = [];
  const grossAmounts: number[] = [];
  const feeAmounts: number[] = [];
  const payableAmounts: number[] = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    if (!validDate(row.Date ?? "")) {
      fail(`The Donations sheet has an invalid date at row ${rowNumber}.`);
    }
    if (
      (row["Donation Currency"] ?? "").trim().toUpperCase() !== "INR" ||
      (row["Converted Currency (If International)"] ?? "").trim() !== ""
    ) {
      fail(FOREIGN_CURRENCY_MESSAGE);
    }

    const externalId = (row["Transaction ID"] ?? "").trim();
    if (!externalId) {
      fail(`The Donations sheet has no Transaction ID at row ${rowNumber}.`);
    }
    if (transactionIds.has(externalId)) {
      fail(`The Donations sheet repeats a Transaction ID at row ${rowNumber}.`);
    }
    transactionIds.add(externalId);

    if (!(row["Campaign ID"] ?? "").trim()) {
      fail(`The Donations sheet has no Campaign ID at row ${rowNumber}.`);
    }

    const utr = (row.UTR ?? "").trim();
    if (!UTR_PATTERN.test(utr)) {
      fail(`The Donations sheet has an invalid UTR at row ${rowNumber}.`);
    }
    if (payoutUtr === null) {
      payoutUtr = utr;
    } else if (payoutUtr !== utr) {
      fail("The Donations sheet contains more than one UTR.");
    }

    const grossPaise = moneyAt(row, "Donation Amount", rowNumber);
    const feePaise = moneyAt(
      row,
      "Payment processing and Applicable promotional charges",
      rowNumber
    );
    const creditPaise = moneyAt(row, "Payable Amount", rowNumber);
    if (grossPaise !== safeSum([feePaise, creditPaise], "Donations")) {
      fail(`The Donations sheet amounts do not add up at row ${rowNumber}.`);
    }
    grossAmounts.push(grossPaise);
    feeAmounts.push(feePaise);
    payableAmounts.push(creditPaise);
    items.push({ creditPaise, externalId, feePaise });
  }

  return {
    amountPaise: safeSum(payableAmounts, "Donations"),
    feesPaise: safeSum(feeAmounts, "Donations"),
    grossPaise: safeSum(grossAmounts, "Donations"),
    items,
    utr: payoutUtr ?? "",
  };
}

function dateText(date: Date): string {
  if (!Number.isFinite(date.valueOf())) {
    return fail("The workbook contains an invalid date cell.");
  }
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

function excelDateText(serial: number, epoch1904: boolean): string {
  if (!Number.isFinite(serial)) {
    return fail("The workbook contains an invalid date cell.");
  }
  if (!epoch1904 && serial >= 60 && serial < 61) {
    return fail("The workbook contains an invalid date cell.");
  }
  const serial1900 = serial + (epoch1904 ? 1462 : 0);
  const unixEpochOffset = serial1900 < 60 ? 25_568 : 25_569;
  return dateText(
    new Date(Math.floor((serial1900 - unixEpochOffset) * 86_400_000))
  );
}

function cellText(
  cell: CellValue | null,
  excelDate = false,
  epoch1904 = false
): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  if (cell instanceof Date) {
    return dateText(cell);
  }
  if (excelDate && typeof cell === "number") {
    return excelDateText(cell, epoch1904);
  }
  return String(cell).trim();
}

function parsedSheet(
  data: SheetData,
  expectedHeaders: readonly string[],
  sheetName: string,
  epoch1904: boolean
): ParsedCsv {
  const [headerCells, ...dataRows] = data;
  const headerTexts = headerCells?.map((cell) => cellText(cell)) ?? [];
  const headers = headerTexts.slice(0, expectedHeaders.length);
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index]) ||
    headerTexts.slice(expectedHeaders.length).some((header) => header !== "")
  ) {
    return fail(
      `The ${sheetName} sheet headers don't match the expected give.do payout format.`
    );
  }
  if (dataRows.length === 0) {
    return fail(`The ${sheetName} sheet has no data rows.`);
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return fail(
      `The ${sheetName} sheet has more than ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows.`
    );
  }
  const rows = dataRows.map((cells, index) => {
    if (cells.slice(headers.length).some((cell) => cellText(cell) !== "")) {
      fail(`The ${sheetName} sheet has extra cells at row ${index + 2}.`);
    }
    return Object.fromEntries(
      headers.map((header, cellIndex) => [
        header,
        cellText(cells[cellIndex] ?? null, header === "Date", epoch1904),
      ])
    );
  });
  return { headers, rowIssues: rows.map(() => null), rows };
}

function validateCampaigns(
  donations: readonly RawRow[],
  campaignRows: readonly RawRow[],
  payout: GiveDoPayoutTotals
): void {
  const donationTotals = new Map<
    string,
    { amount: number[]; fees: number[]; gross: number[] }
  >();
  for (const [index, row] of donations.entries()) {
    const rowNumber = index + 2;
    const campaignId = (row["Campaign ID"] ?? "").trim();
    const totals = donationTotals.get(campaignId) ?? {
      amount: [],
      fees: [],
      gross: [],
    };
    totals.gross.push(moneyAt(row, "Donation Amount", rowNumber));
    totals.fees.push(
      moneyAt(
        row,
        "Payment processing and Applicable promotional charges",
        rowNumber
      )
    );
    totals.amount.push(moneyAt(row, "Payable Amount", rowNumber));
    donationTotals.set(campaignId, totals);
  }

  const seenCampaigns = new Set<string>();
  for (const [index, row] of campaignRows.entries()) {
    const rowNumber = index + 2;
    const campaignId = (row["Campaign ID"] ?? "").trim();
    if (!campaignId || seenCampaigns.has(campaignId)) {
      fail(
        `The Campaign Level sheet has an invalid Campaign ID at row ${rowNumber}.`
      );
    }
    seenCampaigns.add(campaignId);
    const expected = donationTotals.get(campaignId);
    if (!expected) {
      fail(
        "The Campaign Level sheet contains a campaign absent from Donations."
      );
    }
    if ((row.Currency ?? "").trim().toUpperCase() !== "INR") {
      fail(FOREIGN_CURRENCY_MESSAGE);
    }
    if ((row.UTR ?? "").trim() !== payout.utr) {
      fail("The Campaign Level sheet UTR does not match the Donations sheet.");
    }
    const gross = campaignMoneyAt(row, "Total Donation Amount", rowNumber);
    const fees = campaignMoneyAt(row, "Total Retention Amount", rowNumber);
    const amount = campaignMoneyAt(row, "Total Payable Amount", rowNumber);
    if (
      gross !== safeSum(expected.gross, "Donations") ||
      fees !== safeSum(expected.fees, "Donations") ||
      amount !== safeSum(expected.amount, "Donations") ||
      gross !== safeSum([fees, amount], "Campaign Level")
    ) {
      fail(
        `The Campaign Level totals do not match the Donations sheet at row ${rowNumber}.`
      );
    }
  }
  if (seenCampaigns.size !== donationTotals.size) {
    fail("The Campaign Level sheet is missing a campaign from Donations.");
  }
}

function workbookBytes(input: Buffer | string): Buffer {
  if (typeof input !== "string") {
    if (input.byteLength > MAX_IMPORT_FILE_BYTES) {
      return fail("The payout file is larger than 5 MB.");
    }
    return input;
  }
  const base64 = input.trim();
  if (base64.length > Math.ceil(MAX_IMPORT_FILE_BYTES / 3) * 4 + 4) {
    return fail("The payout file is larger than 5 MB.");
  }
  if (!base64 || !/^[a-z\d+/]*={0,2}$/i.test(base64)) {
    return fail("The payout file is not valid base64.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    return fail("The payout file is larger than 5 MB.");
  }
  return bytes;
}

/** Parses and validates one unmodified give.do payout workbook. */
export async function parseGiveDoPayout(
  input: Buffer | string
): Promise<ParsedGiveDoPayout> {
  let sheets: { data: SheetData<number>; sheet: string }[];
  let epoch1904: boolean;
  try {
    const bytes = workbookBytes(input);
    // Only the rebuilt archive reaches the workbook reader, never the upload.
    const sanitized = sanitizeXlsxArchive(bytes);
    epoch1904 = sanitized.epoch1904;
    sheets = await readExcelFile<number>(sanitized.workbook);
  } catch (error) {
    if (error instanceof GiveDoPayoutParseError) {
      throw error;
    }
    if (error instanceof XlsxArchiveValidationError) {
      return fail(error.message);
    }
    return fail("The file could not be read as an XLSX workbook.");
  }
  const donationSheet = sheets.find(
    (sheet) => sheet.sheet === GIVE_DO_PAYOUT_DONATIONS_SHEET
  );
  const campaignSheet = sheets.find(
    (sheet) => sheet.sheet === GIVE_DO_PAYOUT_CAMPAIGN_SHEET
  );
  if (!donationSheet || !campaignSheet) {
    return fail(
      'The workbook must contain sheets named "Donations" and "Campaign Level".'
    );
  }
  const donations = parsedSheet(
    donationSheet.data,
    GIVE_DO_PAYOUT_DONATION_HEADERS,
    GIVE_DO_PAYOUT_DONATIONS_SHEET,
    epoch1904
  );
  const campaignLevel = parsedSheet(
    campaignSheet.data,
    GIVE_DO_PAYOUT_CAMPAIGN_HEADERS,
    GIVE_DO_PAYOUT_CAMPAIGN_SHEET,
    epoch1904
  );
  const payout = payoutFromRows(donations.rows);
  validateCampaigns(donations.rows, campaignLevel.rows, payout);
  return { donations, ...payout };
}
