import { describe, expect, it } from "bun:test";

import { parseCsv } from "@/lib/income-import/parse-csv";

import {
  type BankMapping,
  checkBankMapping,
  findStatementHeaderRow,
  isGiveIndiaNarration,
  suggestBankMapping,
} from "./fields";
import {
  normalizeStatementRow,
  parseStatementAmount,
  parseStatementDate,
} from "./normalize";

const TODAY = "2026-10-14";

const SPLIT: BankMapping = {
  "Chq./Ref.No.": "reference",
  "Closing Balance": "balance",
  Date: "valueOn",
  "Deposit Amt.": "credit",
  Narration: "narration",
  "Withdrawal Amt.": "debit",
};

const split = (raw: Record<string, string>) =>
  normalizeStatementRow(raw, SPLIT, {
    dateFormat: "dmy",
    layout: "split",
    today: TODAY,
  });

describe("amount layouts", () => {
  it("reads separate withdrawal and deposit columns", () => {
    const credit = split({
      "Chq./Ref.No.": "000123",
      "Closing Balance": "1,02,500.00",
      Date: "01/10/2026",
      "Deposit Amt.": "2,500.00",
      Narration: "NEFT CR-ASHA RAO",
      "Withdrawal Amt.": "",
    });
    expect(credit).toEqual({
      kind: "line",
      line: {
        amountPaise: 250_000,
        balancePaise: 10_250_000,
        direction: "credit",
        hashNarration: "NEFT CR-ASHA RAO",
        narration: "NEFT CR-ASHA RAO",
        reference: "000123",
        valueOn: "2026-10-01",
      },
      warnings: [],
    });
    const debit = split({
      Date: "02/10/2026",
      "Deposit Amt.": "0.00",
      Narration: "RENT",
      "Withdrawal Amt.": "15,000",
    });
    expect(debit.kind === "line" && debit.line.direction).toBe("debit");
    expect(debit.kind === "line" && debit.line.amountPaise).toBe(1_500_000);
  });

  it("refuses a negative or Dr-marked deposit and a Cr-marked withdrawal", () => {
    for (const cells of [
      { "Deposit Amt.": "-500.00" } as Record<string, string>,
      { "Deposit Amt.": "500.00 Dr" },
      { "Withdrawal Amt.": "500.00 Cr" },
    ]) {
      expect(split({ Date: "02/10/2026", Narration: "x", ...cells }).kind).toBe(
        "error"
      );
    }
  });

  it("refuses a row with both a withdrawal and a deposit", () => {
    const result = split({
      Date: "02/10/2026",
      "Deposit Amt.": "10",
      Narration: "x",
      "Withdrawal Amt.": "10",
    });
    expect(result.kind).toBe("error");
  });

  it("reads one signed amount column, with a trailing Dr or Cr too", () => {
    const mapping: BankMapping = { Amount: "amount", Date: "valueOn" };
    const options = {
      dateFormat: "dmy" as const,
      layout: "signed" as const,
      today: TODAY,
    };
    const minus = normalizeStatementRow(
      { Amount: "-1,250.50", Date: "03/10/2026" },
      mapping,
      options
    );
    expect(minus.kind === "line" && minus.line).toMatchObject({
      amountPaise: 125_050,
      direction: "debit",
    });
    const brackets = normalizeStatementRow(
      { Amount: "(500.00)", Date: "03/10/2026" },
      mapping,
      options
    );
    expect(brackets.kind === "line" && brackets.line.direction).toBe("debit");
    const suffix = normalizeStatementRow(
      { Amount: "700.00 Cr", Date: "03/10/2026" },
      mapping,
      options
    );
    expect(suffix.kind === "line" && suffix.line.direction).toBe("credit");
  });

  it("reads an amount with a Dr/Cr column", () => {
    const mapping: BankMapping = {
      Amount: "amount",
      Date: "valueOn",
      Type: "drCr",
    };
    const options = {
      dateFormat: "dmy" as const,
      layout: "indicator" as const,
      today: TODAY,
    };
    const debit = normalizeStatementRow(
      { Amount: "300", Date: "04/10/2026", Type: "DR" },
      mapping,
      options
    );
    expect(debit.kind === "line" && debit.line.direction).toBe("debit");
    const credit = normalizeStatementRow(
      { Amount: "300", Date: "04/10/2026", Type: "Credit" },
      mapping,
      options
    );
    expect(credit.kind === "line" && credit.line.direction).toBe("credit");
    const unknown = normalizeStatementRow(
      { Amount: "300", Date: "04/10/2026", Type: "?" },
      mapping,
      options
    );
    expect(unknown.kind).toBe("error");
  });

  it("parses amount cells", () => {
    expect(parseStatementAmount("")).toEqual({ empty: true });
    expect(parseStatementAmount("-")).toEqual({ empty: true });
    expect(parseStatementAmount("0.00")).toEqual({ empty: true });
    expect(parseStatementAmount("₹ 1,00,000.50")).toEqual({
      paise: 10_000_050,
      side: null,
    });
    expect(parseStatementAmount("250.00Cr")).toEqual({
      paise: 25_000,
      side: "credit",
    });
    expect(parseStatementAmount("1,234.00(Cr)")).toEqual({
      paise: 123_400,
      side: "credit",
    });
    expect(parseStatementAmount("500 Dr.")).toEqual({
      paise: 50_000,
      side: "debit",
    });
    expect(parseStatementAmount("12.345")).toHaveProperty("error");
    expect(parseStatementAmount("abc")).toHaveProperty("error");
  });
});

describe("dates", () => {
  it("reads the chosen format, month names and two-digit years", () => {
    expect(parseStatementDate("01/10/2026", "dmy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("10/01/2026", "mdy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("2026-10-01", "dmy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("01-Oct-2026", "dmy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("01/10/26", "dmy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("01-Oct-26", "dmy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("01/10/26 10:30", "dmy")).toEqual({
      iso: "2026-10-01",
    });
    expect(parseStatementDate("31/02/2026", "dmy")).toHaveProperty("error");
  });

  it("shows a transaction whose date can't be read as an error, not a skip", () => {
    const wrongFormat = normalizeStatementRow(
      { Date: "10/31/2026", "Deposit Amt.": "500", Narration: "x" },
      SPLIT,
      { dateFormat: "dmy", layout: "split", today: TODAY }
    );
    expect(wrongFormat.kind).toBe("error");
    expect(wrongFormat.kind === "error" && wrongFormat.errors[0]?.field).toBe(
      "valueOn"
    );
  });

  it("refuses a date in the future", () => {
    const result = split({
      Date: "15/10/2026",
      "Deposit Amt.": "10",
      Narration: "x",
    });
    expect(result.kind).toBe("error");
  });
});

describe("rows that are not transactions", () => {
  it("skips rows without a date and dated rows without an amount", () => {
    expect(
      split({ Date: "", "Deposit Amt.": "5,000", Narration: "Total" })
    ).toEqual({ kind: "skip", reason: "no_date" });
    expect(
      split({ Date: "Opening Balance", Narration: "", "Deposit Amt.": "" })
    ).toEqual({ kind: "skip", reason: "no_date" });
    expect(
      split({
        "Closing Balance": "1,00,000.00",
        Date: "01/10/2026",
        Narration: "OPENING BALANCE",
      })
    ).toEqual({ kind: "skip", reason: "no_amount" });
  });

  it("finds the header row below a bank's account details", () => {
    const text = [
      "Account Statement,,,,,,",
      "Account No: 50100123456789,,,,,,",
      "Period: 01/10/2026 to 31/10/2026,,,,,,",
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      "01/10/2026,UPI-ASHA,123,01/10/2026,,500.00,500.00",
    ].join("\n");
    const parsed = parseCsv(text, { findHeaderRow: findStatementHeaderRow });
    expect(parsed.headers[0]).toBe("Date");
    expect(parsed.rows).toHaveLength(1);
    expect(JSON.stringify(parsed.rows)).not.toContain("50100123456789");
  });
});

describe("masking", () => {
  it("masks PAN- and Aadhaar-shaped runs in the narration only", () => {
    const result = split({
      "Chq./Ref.No.": "UTR123456789012",
      Date: "05/10/2026",
      "Deposit Amt.": "1,000",
      Narration: "NEFT ABCDE1234F 1234 5678 9012 PRIYA",
    });
    expect(result.kind === "line" && result.line.narration).toBe(
      "NEFT ••••234F ••••9012 PRIYA"
    );
    expect(result.kind === "line" && result.line.reference).toBe(
      "UTR123456789012"
    );
  });
});

describe("references", () => {
  it("takes a reference from the narration when the file has none", () => {
    const upi = split({
      Date: "05/10/2026",
      "Deposit Amt.": "500",
      Narration: "UPI/412345678901/PAYMENT FROM ASHA/asha@okaxis",
    });
    expect(upi.kind === "line" && upi.line.reference).toBe("412345678901");
    // The narration itself is masked; the reference is kept for matching.
    expect(upi.kind === "line" && upi.line.narration).toBe(
      "UPI/••••8901/PAYMENT FROM ASHA/asha@okaxis"
    );
    const neft = split({
      Date: "05/10/2026",
      "Deposit Amt.": "500",
      Narration: "NEFT CR-HDFCN52026101412345678-ASHA RAO",
    });
    expect(neft.kind === "line" && neft.line.reference).toBe(
      "HDFCN52026101412345678"
    );
    const given = split({
      "Chq./Ref.No.": "000123",
      Date: "05/10/2026",
      "Deposit Amt.": "500",
      Narration: "UPI/412345678901/X",
    });
    expect(given.kind === "line" && given.line.reference).toBe("000123");
    const none = split({
      Date: "05/10/2026",
      "Deposit Amt.": "500",
      Narration: "CASH DEPOSIT BRANCH",
    });
    expect(none.kind === "line" && none.line.reference).toBe("");
  });
});

describe("mapping", () => {
  it("maps a typical Indian export, preferring the value date", () => {
    const mapping = suggestBankMapping(
      [
        "Date",
        "Narration",
        "Chq./Ref.No.",
        "Value Dt",
        "Withdrawal Amt.",
        "Deposit Amt.",
        "Closing Balance",
      ],
      null
    );
    expect(mapping).toEqual({
      "Chq./Ref.No.": "reference",
      "Closing Balance": "balance",
      Date: "ignore",
      "Deposit Amt.": "credit",
      Narration: "narration",
      "Value Dt": "valueOn",
      "Withdrawal Amt.": "debit",
    });
    expect(checkBankMapping(mapping).layout).toBe("split");
  });

  it("keeps what the last upload for the account chose", () => {
    const mapping = suggestBankMapping(["Txn Date", "Particulars", "Amt"], {
      Amt: "amount",
      Particulars: "ignore",
      "Txn Date": "valueOn",
    });
    expect(mapping).toEqual({
      Amt: "amount",
      Particulars: "ignore",
      "Txn Date": "valueOn",
    });
    expect(checkBankMapping(mapping).layout).toBe("signed");
  });

  it("explains an unusable mapping", () => {
    expect(checkBankMapping({ Amount: "amount" }).problem).toBe(
      "Map the date column."
    );
    expect(
      checkBankMapping({ Date: "valueOn", Dr: "debit" }).problem
    ).toContain("Map the amounts");
    expect(
      checkBankMapping({ A: "valueOn", B: "valueOn", C: "amount" }).problem
    ).toContain("more than once");
  });
});

describe("give.do payouts", () => {
  it("recognises GiveIndia and give.do in a narration", () => {
    expect(isGiveIndiaNarration("NEFT CR-GIVE INDIA FOUNDATION")).toBe(true);
    expect(isGiveIndiaNarration("IMPS/GIVEINDIA/PAYOUT")).toBe(true);
    expect(isGiveIndiaNarration("give.do settlement")).toBe(true);
    expect(isGiveIndiaNarration("UPI-GIVE DONATION")).toBe(false);
    expect(isGiveIndiaNarration("FORGIVE INDIANA")).toBe(false);
  });
});
