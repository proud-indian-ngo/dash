import Papa from "papaparse";

import { MAX_IMPORT_ROWS } from "./fields";

export interface ParsedCsv {
  headers: string[];
  /** One record per data row, keyed by header; cells trimmed. */
  rows: Record<string, string>[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
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

/**
 * Parses CSV text into header-keyed rows. Handles a byte-order mark, quoted
 * commas and newlines, and comma, semicolon or tab delimiters; skips blank
 * lines. Both the browser (for the mapping preview) and the server (the copy
 * that is stored) call it, so they always agree.
 */
export function parseCsv(text: string): ParsedCsv {
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const result = Papa.parse<string[]>(input, {
    delimitersToGuess: [",", ";", "\t"],
    skipEmptyLines: "greedy",
  });
  const fatal = result.errors.find(
    (error) => error.type === "Quotes" || error.code === "UndetectableDelimiter"
  );
  if (fatal && result.data.length <= 1) {
    throw new CsvParseError(
      "The file could not be read as CSV. Save it as CSV (comma separated) and try again."
    );
  }
  const [headerRow, ...dataRows] = result.data;
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
  return { headers, rows };
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
