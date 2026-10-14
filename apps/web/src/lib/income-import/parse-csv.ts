import Papa from "papaparse";

import { MAX_IMPORT_ROWS } from "./fields";

/** A data row the parser could not read cleanly; it can only be skipped. */
export type CsvRowIssue = "extra_cells" | "malformed_quotes";

export const CSV_ROW_ISSUE_MESSAGES: Record<CsvRowIssue, string> = {
  extra_cells:
    "The row has more cells than the header; a comma inside a value may need quotes",
  malformed_quotes:
    "A quote in this row is not closed or is misplaced; later lines may have been read into it",
};

export interface ParsedCsv {
  headers: string[];
  /** Per data row, what was wrong with it as CSV, or null. */
  rowIssues: (CsvRowIssue | null)[];
  /** One record per data row, keyed by header; cells trimmed. */
  rows: Record<string, string>[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

const NOT_UTF8_MESSAGE =
  "This file isn't CSV UTF-8. In Excel use Save As → CSV UTF-8.";

/**
 * A UTF-16 file (Excel's "Unicode Text") read as UTF-8 starts with its byte
 * order mark turned into replacement characters and has a NUL between every
 * letter. A NUL also cannot be stored, so any file with one is refused.
 */
function isNotUtf8Text(text: string): boolean {
  return (
    text.includes("\u0000") ||
    text.startsWith("\uFFFE") ||
    text.startsWith("\uFFFD\uFFFD")
  );
}

/**
 * Header names made unique and non-empty, so every column can be mapped:
 * a blank header becomes "Column 3", a repeated one "Amount (2)".
 */
function uniqueHeaders(raw: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

export interface ParseCsvOptions {
  /**
   * Index of the header row among the file's non-blank rows; rows above it
   * (a bank export's account details and period) are dropped, never stored.
   * The first row when absent.
   */
  findHeaderRow?: (rows: readonly (readonly string[])[]) => number;
}

/**
 * Parses CSV text into header-keyed rows. Refuses text that is not UTF-8
 * (see isNotUtf8Text). Handles a byte-order mark, quoted
 * commas and newlines, and comma, semicolon or tab delimiters; skips blank
 * lines. Both the browser (for the mapping preview) and the server (the copy
 * that is stored) call it, so they always agree.
 */
export function parseCsv(text: string, options?: ParseCsvOptions): ParsedCsv {
  if (isNotUtf8Text(text)) {
    throw new CsvParseError(NOT_UTF8_MESSAGE);
  }
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const data: string[][] = [];
  const quoteErrors = new Set<number>();
  let fatal = false;
  // Step mode reports errors per row, so each can be tied to the row it broke.
  Papa.parse<string[]>(input, {
    delimitersToGuess: [",", ";", "\t"],
    skipEmptyLines: "greedy",
    step: (result) => {
      for (const error of result.errors) {
        if (error.type === "Quotes") {
          quoteErrors.add(data.length);
        }
        if (error.type === "Quotes" || error.code === "UndetectableDelimiter") {
          fatal = true;
        }
      }
      data.push(result.data);
    },
  });
  if (fatal && data.length <= 1) {
    throw new CsvParseError(
      "The file could not be read as CSV. Save it as CSV (comma separated) and try again."
    );
  }
  const headerIndex = Math.max(0, options?.findHeaderRow?.(data) ?? 0);
  const [headerRow, ...dataRows] = data.slice(headerIndex);
  if (!headerRow || headerRow.every((cell) => cell.trim() === "")) {
    throw new CsvParseError("The file has no header row.");
  }
  if (dataRows.length === 0) {
    throw new CsvParseError("The file has a header row but no data rows.");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new CsvParseError(
      `The file has ${dataRows.length.toLocaleString("en-IN")} rows; split it into files of at most ${MAX_IMPORT_ROWS.toLocaleString("en-IN")}.`
    );
  }
  const headers = uniqueHeaders(headerRow);
  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      record[header] = (cells[index] ?? "").trim();
    }
    return record;
  });
  // Blank trailing cells ("a,b,c,") are common in spreadsheet exports and harmless.
  const rowIssues = dataRows.map((cells, index): CsvRowIssue | null => {
    if (quoteErrors.has(index + headerIndex + 1)) {
      return "malformed_quotes";
    }
    return cells.slice(headers.length).some((cell) => cell.trim() !== "")
      ? "extra_cells"
      : null;
  });
  return { headers, rowIssues, rows };
}

/** Up to `count` non-empty values of a column, for the mapping preview. */
export function sampleValues(
  rows: readonly Record<string, string>[],
  header: string,
  count = 3
): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = row[header];
    if (value) {
      samples.push(value);
      if (samples.length === count) {
        break;
      }
    }
  }
  return samples;
}
