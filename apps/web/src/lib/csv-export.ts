import { hasSpreadsheetFormulaPrefix } from "@pi-dash/shared/spreadsheet";
import { strToU8, zipSync } from "fflate";

export interface CsvFile {
  filename: string;
  headers: string[];
  rows: string[][];
}

export interface DownloadArtifact {
  blob: Blob;
  filename: string;
}

export interface CsvOptions {
  /**
   * Escape formula-leading cells with an apostrophe (the default), or reject
   * them for machine-read files where an apostrophe would change the value.
   */
  formulaPolicy?: "escape" | "reject";
}

export class UnsafeSpreadsheetFormulaError extends Error {
  constructor() {
    super("A CSV cell begins with a spreadsheet formula prefix");
    this.name = "UnsafeSpreadsheetFormulaError";
  }
}

function escapeCsvValue(
  raw: string,
  formulaPolicy: NonNullable<CsvOptions["formulaPolicy"]>
): string {
  let value = raw;
  if (hasSpreadsheetFormulaPrefix(raw)) {
    if (formulaPolicy === "reject") {
      throw new UnsafeSpreadsheetFormulaError();
    }
    value = `'${raw}`;
  }
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes("\t")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(
  headers: string[],
  rows: string[][],
  options: CsvOptions = {}
): string {
  const formulaPolicy = options.formulaPolicy ?? "escape";
  const escape = (value: string) => escapeCsvValue(value, formulaPolicy);
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  return lines.join("\n");
}

export function createCsvDownload(
  files: CsvFile[],
  archiveFilename: string
): DownloadArtifact {
  if (files.length === 0) {
    throw new Error("At least one CSV file is required");
  }

  if (files.length === 1) {
    const [file] = files;
    if (!file) {
      throw new Error("CSV file is required");
    }
    return {
      blob: new Blob([buildCsv(file.headers, file.rows)], {
        type: "text/csv;charset=utf-8;",
      }),
      filename: file.filename,
    };
  }

  const zipFiles = Object.fromEntries(
    files.map((file) => [
      file.filename,
      strToU8(buildCsv(file.headers, file.rows)),
    ])
  );
  const zipped = zipSync(zipFiles);

  return {
    blob: new Blob([zipped], { type: "application/zip" }),
    filename: archiveFilename,
  };
}
