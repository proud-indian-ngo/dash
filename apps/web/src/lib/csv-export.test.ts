import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { buildCsv, type CsvFile, createCsvDownload } from "./csv-export";

const firstFile: CsvFile = {
  filename: "requests.csv",
  headers: ["Title", "Amount"],
  rows: [['Travel, "local"', "=2+2"]],
};

const secondFile: CsvFile = {
  filename: "vendor-payments.csv",
  headers: ["Vendor", "Invoice Date"],
  rows: [["Example Vendor", "2026-01-15"]],
};

describe("CSV exports", () => {
  test("escapes CSV values", () => {
    expect(buildCsv(firstFile.headers, firstFile.rows)).toBe(
      'Title,Amount\n"Travel, ""local""","\t=2+2"'
    );
  });

  test("returns a CSV artifact for one file", async () => {
    const artifact = createCsvDownload([firstFile], "exports.zip");

    expect(artifact.filename).toBe("requests.csv");
    expect(artifact.blob.type).toBe("text/csv;charset=utf-8;");
    expect(await artifact.blob.text()).toContain("Travel");
  });

  test("returns one ZIP artifact containing multiple CSV files", async () => {
    const artifact = createCsvDownload(
      [firstFile, secondFile],
      "financial-exports.zip"
    );
    const entries = unzipSync(
      new Uint8Array(await artifact.blob.arrayBuffer())
    );

    expect(artifact.filename).toBe("financial-exports.zip");
    expect(artifact.blob.type).toBe("application/zip");
    expect(Object.keys(entries).sort()).toEqual([
      "requests.csv",
      "vendor-payments.csv",
    ]);
    expect(strFromU8(entries["vendor-payments.csv"] ?? new Uint8Array())).toBe(
      "Vendor,Invoice Date\nExample Vendor,2026-01-15"
    );
  });
});
