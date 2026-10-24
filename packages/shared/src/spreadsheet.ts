const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const SPREADSHEET_FORMULA_PREFIX_MESSAGE =
  "Cannot begin with =, +, -, or @";

/** Whether a spreadsheet may interpret a text value as a formula. */
export function hasSpreadsheetFormulaPrefix(value: string): boolean {
  return SPREADSHEET_FORMULA_PREFIX.test(value);
}
