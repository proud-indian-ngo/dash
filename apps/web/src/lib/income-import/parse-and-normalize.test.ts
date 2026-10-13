import { describe, expect, it } from "bun:test";

import { saveDonorSchema } from "@/lib/donor-schema";

import { checkMapping, IGNORE_FIELD, suggestMapping } from "./fields";
import {
  donorSaveInput,
  maskPans,
  normalizeRow,
  parseAmount,
  parseDate,
} from "./normalize";
import { CsvParseError, parseCsv, sampleValues } from "./parse-csv";

describe("parseCsv", () => {
  it("strips a byte-order mark and keeps quoted commas and newlines", () => {
    const parsed = parseCsv(
      '﻿Name,Amount,Note\n"Rao, Priya","1,00,000.00","line one\nline two"\n'
    );
    expect(parsed.headers).toEqual(["Name", "Amount", "Note"]);
    expect(parsed.rows).toEqual([
      { Amount: "1,00,000.00", Name: "Rao, Priya", Note: "line one\nline two" },
    ]);
  });

  it("names blank and repeated headers and skips blank lines", () => {
    const parsed = parseCsv("Amount,,Amount\n1,2,3\n\n,,\n4,5,6\n");
    expect(parsed.headers).toEqual(["Amount", "Column 2", "Amount (2)"]);
    expect(parsed.rows).toHaveLength(2);
  });

  it("flags a row with an unclosed quote instead of silently merging lines", () => {
    const parsed = parseCsv(
      'Name,Amount,Date\nAsha,1,01/10/2026\nDev,"2,02/10/2026\nRavi,3,03/10/2026\n'
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rowIssues).toEqual([null, "malformed_quotes"]);
  });

  it("flags extra non-blank cells beyond the header, not trailing blank ones", () => {
    const parsed = parseCsv(
      "Name,Amount,Date\nAsha,1,000,01/10/2026\nDev,2,02/10/2026,,\n"
    );
    expect(parsed.rowIssues).toEqual(["extra_cells", null]);
  });

  it("reads semicolon-separated files", () => {
    expect(parseCsv("a;b\n1;2").rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("refuses files without data rows", () => {
    expect(() => parseCsv("Name,Amount\n")).toThrow(CsvParseError);
    expect(() => parseCsv("")).toThrow(CsvParseError);
  });

  it("samples the first non-empty values", () => {
    const rows = [{ a: "" }, { a: "x" }, { a: "y" }, { a: "z" }, { a: "w" }];
    expect(sampleValues(rows, "a")).toEqual(["x", "y", "z"]);
  });
});

describe("parseAmount", () => {
  it("reads Indian and international grouping and currency marks", () => {
    expect(parseAmount("1,00,000.50")).toEqual({ paise: 10_000_050 });
    expect(parseAmount("₹ 2,500")).toEqual({ paise: 250_000 });
    expect(parseAmount("Rs. 100,000.00")).toEqual({ paise: 10_000_000 });
    expect(parseAmount("INR 19.99")).toEqual({ paise: 1999 });
    expect(parseAmount("500")).toEqual({ paise: 50_000 });
  });

  it("refuses zero, negatives, three decimals, bad grouping and huge amounts", () => {
    for (const bad of ["0", "-5", "10.555", "1,5", "12,34,5", "abc", ""]) {
      expect("error" in parseAmount(bad)).toBe(true);
    }
    expect("error" in parseAmount("9,99,99,99,999.99")).toBe(false);
    expect("error" in parseAmount("10,00,00,00,000")).toBe(true);
  });
});

describe("parseDate", () => {
  it("reads day-first and month-first numeric dates by the chosen format", () => {
    expect(parseDate("03/04/2026", "dmy")).toEqual({ iso: "2026-04-03" });
    expect(parseDate("03/04/2026", "mdy")).toEqual({ iso: "2026-03-04" });
    expect(parseDate("3-4-2026", "dmy")).toEqual({ iso: "2026-04-03" });
  });

  it("reads year-first and month-name dates as written", () => {
    expect(parseDate("2026-04-03", "dmy")).toEqual({ iso: "2026-04-03" });
    expect(parseDate("2026-04-03T10:00:00Z", "mdy")).toEqual({
      iso: "2026-04-03",
    });
    expect(parseDate("12-Oct-2026", "mdy")).toEqual({ iso: "2026-10-12" });
    expect(parseDate("Oct 12, 2026", "dmy")).toEqual({ iso: "2026-10-12" });
    expect(parseDate("12/10/2026 14:30", "dmy")).toEqual({
      iso: "2026-10-12",
    });
  });

  it("refuses impossible dates, two-digit years and a day-first date under year-first", () => {
    expect("error" in parseDate("31/02/2026", "dmy")).toBe(true);
    expect("error" in parseDate("03/04/26", "dmy")).toBe(true);
    expect("error" in parseDate("03/04/2026", "ymd")).toBe(true);
    expect("error" in parseDate("soon", "dmy")).toBe(true);
  });
});

describe("mapping", () => {
  it("maps headers by synonym and fills each field once", () => {
    const mapping = suggestMapping(
      ["Donor Name", "Amount (INR)", "Date", "PAN", "E-mail", "Amount"],
      null
    );
    expect(mapping).toEqual({
      Amount: IGNORE_FIELD,
      "Amount (INR)": "amount",
      Date: "receivedOn",
      "Donor Name": "donorName",
      "E-mail": "email",
      PAN: "idNumber",
    });
  });

  it("prefers the mapping remembered from the last batch of the source", () => {
    const mapping = suggestMapping(["Payer", "Paid", "On"], {
      On: "receivedOn",
      Paid: "amount",
      Payer: "donorName",
    });
    expect(mapping).toEqual({
      On: "receivedOn",
      Paid: "amount",
      Payer: "donorName",
    });
  });

  it("reports missing required fields, duplicates and a missing external ID", () => {
    expect(checkMapping({ a: "donorName", b: "amount", c: "amount" })).toEqual({
      duplicates: ["amount"],
      missing: ["receivedOn"],
      weakIdentity: true,
    });
    expect(
      checkMapping({
        a: "donorName",
        b: "amount",
        c: "receivedOn",
        d: "externalId",
      }).weakIdentity
    ).toBe(false);
  });
});

describe("normalizeRow", () => {
  const mapping = {
    Amount: "amount",
    Channel: "channel",
    Date: "receivedOn",
    Email: "email",
    Name: "donorName",
    PAN: "idNumber",
    Phone: "phone",
    Type: "donationType",
  } as const;
  const options = {
    dateFormat: "dmy",
    defaultChannel: "upi",
    today: "2026-10-13",
  } as const;

  it("normalises a good row", () => {
    const result = normalizeRow(
      {
        Amount: "1,000",
        Channel: "",
        Date: "01/10/2026",
        Email: "Asha@Example.com",
        Name: "  Asha   Rao ",
        PAN: "abcde1234f",
        Phone: "98765 43210",
        Type: "CSR",
      },
      mapping,
      options
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.row).toMatchObject({
      amountPaise: 100_000,
      channel: "upi",
      donationType: "csr",
      donorName: "Asha Rao",
      email: "asha@example.com",
      idNumber: "ABCDE1234F",
      idType: "pan",
      phone: "+919876543210",
      receivedOn: "2026-10-01",
    });
  });

  it("drops an invalid PAN, email or phone with a warning and keeps the row", () => {
    const result = normalizeRow(
      {
        Amount: "10",
        Channel: "NEFT",
        Date: "01/10/2026",
        Email: "not-an-email",
        Name: "Asha",
        PAN: "ABC123",
        Phone: "12",
        Type: "",
      },
      mapping,
      options
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.field).sort()).toEqual([
      "email",
      "idNumber",
      "phone",
    ]);
    expect(result.row).toMatchObject({
      channel: "neft",
      email: "",
      idType: "none",
      phone: "",
    });
  });

  it("errors on an ID number the donor form would refuse", () => {
    const result = normalizeRow(
      {
        Amount: "10",
        Channel: "",
        Date: "01/10/2026",
        Email: "",
        IdType: "passport",
        Name: "Asha",
        PAN: "P".repeat(41),
        Phone: "",
        Type: "",
      },
      { ...mapping, IdType: "idType" },
      options
    );
    expect(result.errors.map((e) => e.field)).toContain("idNumber");
  });

  it("gives the donor form exactly what a valid row would save", () => {
    const result = normalizeRow(
      {
        Amount: "10",
        Channel: "",
        Date: "01/10/2026",
        Email: "a@x.in",
        Name: "Asha",
        PAN: "ABCDE1234F",
        Phone: "9876543210",
        Type: "",
      },
      mapping,
      options
    );
    expect(result.errors).toEqual([]);
    const donor = donorSaveInput(result.row, {
      id: "0190a000-0000-7000-8000-000000000001",
      withId: true,
    });
    expect(saveDonorSchema.safeParse(donor).success).toBe(true);
    expect(donor).toMatchObject({ idNumber: "ABCDE1234F", idType: "pan" });
    expect(
      donorSaveInput(result.row, { id: donor.id, withId: false })
    ).toMatchObject({ idNumber: "", idType: "none" });
  });

  it("errors on a missing name, a bad amount, a future date or an unknown type", () => {
    const result = normalizeRow(
      {
        Amount: "10.123",
        Channel: "bitcoin",
        Date: "01/11/2026",
        Email: "",
        Name: "",
        PAN: "",
        Phone: "",
        Type: "gift",
      },
      mapping,
      options
    );
    expect(result.errors.map((e) => e.field).sort()).toEqual([
      "amount",
      "channel",
      "donationType",
      "donorName",
      "receivedOn",
    ]);
  });
});

describe("maskPans", () => {
  it("masks PAN-shaped text anywhere, in any case or spacing", () => {
    expect(maskPans("ABCDE1234F")).toBe("••••234F");
    expect(maskPans("pan: abcde 1234 f, ok")).toBe("pan: ••••234F, ok");
    expect(maskPans("UTR 123456")).toBe("UTR 123456");
  });
});
