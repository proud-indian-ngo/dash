import { hasSpreadsheetFormulaPrefix } from "@pi-dash/shared/spreadsheet";
import Papa from "papaparse";

/**
 * Checks an existing CSV artifact before it crosses a download boundary.
 * Malformed or non-UTF-8 files fail closed because their cell boundaries
 * cannot be established safely.
 */
export function isSpreadsheetSafeCsv(input: ArrayBuffer | Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return false;
  }
  const parsed = Papa.parse<string[]>(
    text.startsWith("\uFEFF") ? text.slice(1) : text,
    {
      delimiter: ",",
      skipEmptyLines: "greedy",
    }
  );
  return (
    parsed.errors.length === 0 &&
    parsed.data.every((row) =>
      row.every((cell) => !hasSpreadsheetFormulaPrefix(cell))
    )
  );
}
