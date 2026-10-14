import writeXlsxFile, {
  type Cell,
  type CellObject,
  type Sheet,
} from "write-excel-file/node";

import type { CellValue, WorkbookColumn, WorkbookSheet } from "./sheets";

/**
 * Server only: writes the workbook's sheets as one XLSX file in memory.
 * Amounts are numbers in an INR format with lakh and crore grouping, dates real Excel dates shown
 * dd-mm-yyyy, the header row bold and frozen.
 *
 * Formula guard: a text cell starting with = + - @, a tab or a carriage
 * return gets a leading apostrophe, as the CSV exports do. XLSX stores
 * text as text, so Excel never runs it here; the guard protects a CA who
 * saves a sheet as CSV and opens it again. It applies to every text cell:
 * the values it could touch are names and free text, while the references
 * the CA matches on (UUIDs, UTRs, receipt and PAN numbers) never start with
 * those characters.
 */

/** Rupees with Indian digit grouping (₹12,34,567.00). */
export const INR_FORMAT =
  '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00';
export const DATE_FORMAT = "dd-mm-yyyy";
/** Excel's limit on sheet names. */
export const MAX_SHEET_NAME = 31;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const guardText = (value: string) =>
  FORMULA_PREFIX.test(value) ? `'${value}` : value;

/** "yyyy-MM-dd" as a date at UTC midnight, the calendar day Excel shows. */
export function excelDate(iso: string): Date {
  const [year, month, dayOfMonth] = iso.split("-").map(Number);
  if (!(year && month && dayOfMonth)) {
    throw new Error("Invalid date");
  }
  return new Date(Date.UTC(year, month - 1, dayOfMonth));
}

export function toCell(
  value: CellValue,
  column: WorkbookColumn,
  bold = false
): Cell {
  if (value === null || value === "") {
    return null;
  }
  const style: Partial<CellObject> = bold ? { fontWeight: "bold" } : {};
  if (column.kind === "amount" && typeof value === "number") {
    return { ...style, format: INR_FORMAT, type: Number, value };
  }
  if (column.kind === "date" && typeof value === "string") {
    return {
      ...style,
      format: DATE_FORMAT,
      type: Date,
      value: excelDate(value),
    };
  }
  if (typeof value === "number") {
    return { ...style, type: Number, value };
  }
  return { ...style, type: String, value: guardText(value) };
}

export function toSheet(sheet: WorkbookSheet): Sheet<never> {
  if (sheet.name.length > MAX_SHEET_NAME) {
    throw new Error("Sheet name too long");
  }
  const header = sheet.columns.map((c): Cell => ({
    fontWeight: "bold",
    type: String,
    value: c.header,
  }));
  const rows = sheet.rows.map((row) =>
    sheet.columns.map((column, index) =>
      toCell(row.cells[index] ?? null, column, row.bold)
    )
  );
  return {
    columns: sheet.columns.map((c) => ({ width: c.width })),
    data: [header, ...rows],
    sheet: sheet.name,
    stickyRowsCount: 1,
  } as Sheet<never>;
}

export async function writeWorkbook(
  sheets: readonly WorkbookSheet[]
): Promise<Buffer> {
  return (await writeXlsxFile(sheets.map(toSheet)).toBuffer()) as Buffer;
}
