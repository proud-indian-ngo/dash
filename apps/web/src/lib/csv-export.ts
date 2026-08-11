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

function escapeCsvValue(raw: string): string {
  const value = CSV_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
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

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
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

export function downloadCsvFiles(
  files: CsvFile[],
  archiveFilename: string
): void {
  const artifact = createCsvDownload(files, archiveFilename);
  const url = URL.createObjectURL(artifact.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = artifact.filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
