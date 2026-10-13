import { describe, expect, it } from "bun:test";

import {
  REQUEST_CSV_HEADERS,
  type RequestExportRow,
  requestRowToArray,
  TX_CSV_HEADERS,
  transactionRowToArray,
  type VendorPaymentExportRow,
  vendorPaymentRowToArray,
  VP_CSV_HEADERS,
} from "./financial-export-rows";

const requestRow: RequestExportRow = {
  attachments: [],
  city: "bangalore",
  createdAt: "2026-05-01T00:00:00.000Z",
  createdBy: "Asha",
  email: "asha@example.test",
  expenseDate: "2026-04-30",
  programme: "Education",
  status: "approved",
  submittedAt: "2026-05-01T00:00:00.000Z",
  title: "Chalk",
  total: "120",
  type: "Reimbursement",
};

const vendorRow: VendorPaymentExportRow = {
  createdAt: "2026-05-01T00:00:00.000Z",
  createdBy: "Asha",
  email: "asha@example.test",
  invoiceDate: "2026-05-02",
  invoiceNumber: "INV-1",
  paidAmount: "500",
  programme: "",
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

  it("puts Programme in the Programme column, after the original columns", () => {
    const requestIndex = REQUEST_CSV_HEADERS.indexOf("Programme");
    expect(requestIndex).toBe(REQUEST_CSV_HEADERS.indexOf("Attachments") - 1);
    expect(
      requestRowToArray(requestRow, "https://dash.test")[requestIndex]
    ).toBe("Education");

    const vendorIndex = VP_CSV_HEADERS.indexOf("Programme");
    expect(vendorIndex).toBe(VP_CSV_HEADERS.length - 1);
    expect(vendorPaymentRowToArray(vendorRow)[vendorIndex]).toBe("");
  });
});
