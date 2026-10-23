import { describe, expect, it } from "bun:test";

import {
  REQUEST_CSV_HEADERS,
  type RequestExportRow,
  requestRowToArray,
  requestTotalCell,
  sumToPaise,
  TX_CSV_HEADERS,
  transactionAmountCell,
  transactionRowToArray,
  type VendorPaymentExportRow,
  vendorPaymentAmountCells,
  vendorPaymentRowToArray,
  VP_CSV_HEADERS,
} from "./financial-export-rows";

const requestRow: RequestExportRow = {
  attachments: [],
  chargedTo: "Programme",
  city: "bangalore",
  createdAt: "2026-05-01T00:00:00.000Z",
  createdBy: "Asha",
  email: "asha@example.test",
  expenseDate: "2026-04-30",
  programme: "Education",
  project: "Maths class",
  status: "approved",
  submittedAt: "2026-05-01T00:00:00.000Z",
  title: "Chalk",
  total: "120",
  type: "Reimbursement",
};

const vendorRow: VendorPaymentExportRow = {
  chargedTo: "Organisation (admin)",
  createdAt: "2026-05-01T00:00:00.000Z",
  createdBy: "Asha",
  email: "asha@example.test",
  invoiceDate: "2026-05-02",
  invoiceNumber: "INV-1",
  paidAmount: "500",
  programme: "Admin",
  project: "",
  remaining: "0",
  status: "completed",
  submittedAt: "2026-05-01T00:00:00.000Z",
  title: "Banners",
  totalAmount: "500",
  vendorName: "Print Co",
};

describe("financial export row contract", () => {
  it("keeps every row aligned with its header", () => {
    expect(requestRowToArray(requestRow, "https://dash.test")).toHaveLength(
      REQUEST_CSV_HEADERS.length
    );
    expect(vendorPaymentRowToArray(vendorRow)).toHaveLength(
      VP_CSV_HEADERS.length
    );
    expect(
      transactionRowToArray({
        amount: "1",
        description: "",
        paymentMethod: "upi",
        paymentReference: "",
        recordedBy: "",
        status: "approved",
        transactionDate: "2026-05-02",
        vendorPaymentTitle: "Banners",
      })
    ).toHaveLength(TX_CSV_HEADERS.length);
  });
});

describe("financial export amount cells", () => {
  it("keeps the request total in the two-decimal form numeric(12,2) produced", () => {
    // PostgreSQL returns sum(bigint) as a numeric string.
    expect(requestTotalCell("150000")).toBe("1500.00");
    expect(requestTotalCell("1999")).toBe("19.99");
    expect(requestTotalCell("5")).toBe("0.05");
    expect(requestTotalCell(null)).toBe("0");
  });

  it("keeps the transaction amount in the two-decimal form", () => {
    expect(transactionAmountCell(150_000)).toBe("1500.00");
    expect(transactionAmountCell(1)).toBe("0.01");
  });

  it("keeps vendor payment amounts as plain numbers", () => {
    expect(vendorPaymentAmountCells(150_000, 50_000)).toEqual({
      paidAmount: "500",
      remaining: "1000",
      totalAmount: "1500",
    });
    expect(vendorPaymentAmountCells(1990, 0)).toEqual({
      paidAmount: "0",
      remaining: "19.9",
      totalAmount: "19.9",
    });
    expect(vendorPaymentAmountCells(10_000, 12_000).remaining).toBe("0");
    // Float subtraction used to print 0.009999999999990905 here.
    expect(vendorPaymentAmountCells(100_001, 100_000).remaining).toBe("0.01");
  });

  it("rejects a sum outside the safe-integer range", () => {
    expect(() => sumToPaise("9007199254740993")).toThrow(RangeError);
  });
});
