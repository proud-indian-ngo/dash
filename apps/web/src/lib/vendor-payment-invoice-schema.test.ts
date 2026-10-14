import { describe, expect, it } from "bun:test";

import { NO_INVOICE_NOTE_MAX_LENGTH } from "@pi-dash/shared/vendor-payment";

import { invoiceFormSchema } from "./vendor-payment-invoice-schema";

const invoiceAttachment = {
  id: "attachment-1",
  type: "url" as const,
  url: "https://example.com/invoice.pdf",
};

const commonFields = {
  attachments: [],
  invoiceDate: new Date("2026-10-01T00:00:00.000Z"),
  invoiceNumber: "",
  noInvoiceNote: "",
  noInvoiceReason: "",
};

describe("invoiceFormSchema", () => {
  it.each([
    {
      input: {
        ...commonFields,
        attachments: [invoiceAttachment],
        invoiceNumber: "INV-1",
        kind: "invoice",
      },
      name: "accepts an invoice with its number, date, and attachment",
      success: true,
    },
    {
      input: {
        ...commonFields,
        invoiceNumber: "INV-1",
        kind: "invoice",
      },
      message: "At least one invoice attachment is required",
      name: "requires an invoice attachment",
      success: false,
    },
    {
      input: {
        ...commonFields,
        attachments: [invoiceAttachment],
        invoiceNumber: "   ",
        kind: "invoice",
      },
      message: "Invoice number is required",
      name: "requires an invoice number",
      success: false,
    },
    {
      input: {
        ...commonFields,
        attachments: [invoiceAttachment],
        invoiceDate: undefined,
        invoiceNumber: "INV-1",
        kind: "invoice",
      },
      message: "Date is required",
      name: "requires an invoice date",
      success: false,
    },
    {
      input: {
        ...commonFields,
        kind: "no_invoice",
        noInvoiceReason: "rent",
      },
      name: "accepts rent without a note or proof",
      success: true,
    },
    {
      input: {
        ...commonFields,
        attachments: [invoiceAttachment],
        kind: "no_invoice",
        noInvoiceReason: "statutory",
      },
      name: "accepts a statutory payment with optional proof",
      success: true,
    },
    {
      input: {
        ...commonFields,
        kind: "no_invoice",
        noInvoiceNote: "Paid to a temporary supplier",
        noInvoiceReason: "other",
      },
      name: "accepts other with an explanatory note",
      success: true,
    },
    {
      input: {
        ...commonFields,
        invoiceDate: undefined,
        kind: "no_invoice",
        noInvoiceReason: "rent",
      },
      message: "Date is required",
      name: "requires a date without an invoice",
      success: false,
    },
    {
      input: {
        ...commonFields,
        kind: "no_invoice",
      },
      message: "Pick a reason",
      name: "requires a no-invoice reason",
      success: false,
    },
    {
      input: {
        ...commonFields,
        kind: "no_invoice",
        noInvoiceNote: "   ",
        noInvoiceReason: "other",
      },
      message: "Add a note explaining why there is no invoice",
      name: "requires a note for other",
      success: false,
    },
    {
      input: {
        ...commonFields,
        kind: "no_invoice",
        noInvoiceNote: "x".repeat(NO_INVOICE_NOTE_MAX_LENGTH + 1),
        noInvoiceReason: "rent",
      },
      name: "limits the no-invoice note length",
      success: false,
    },
  ])("$name", ({ input, message, success }) => {
    const result = invoiceFormSchema.safeParse(input);

    expect(result.success).toBe(success);
    if (!result.success && message) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        message
      );
    }
  });
});
