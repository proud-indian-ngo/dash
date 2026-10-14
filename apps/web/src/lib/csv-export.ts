import { strToU8, zipSync } from "fflate";

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

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
   * Prefix cells that a spreadsheet would run as a formula with an
   * apostrophe (default on). Off only for files a portal reads as data,
   * where the apostrophe would change the value.
   */
  formulaGuard?: boolean;
}

function escapeCsvValue(raw: string, formulaGuard: boolean): string {
  const value = formulaGuard && CSV_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
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
  const guard = options.formulaGuard ?? true;
  const escape = (value: string) => escapeCsvValue(value, guard);
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
