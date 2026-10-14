import { describe, expect, it } from "bun:test";

import { planVendorPaymentRepair } from "./vendor-payment-status-repair";

const base = {
  approvedTransactionAmountsPaise: [] as number[],
  invoiceNumber: null,
  invoiceRejectionReason: null,
  invoiceReviewedAt: null,
  latestInvoiceSubmittedAt: null,
  lineItemAmountsPaise: [10_000],
  status: "approved",
};

describe("planVendorPaymentRepair", () => {
  it("leaves a consistent approved request alone", () => {
    expect(planVendorPaymentRepair(base)).toEqual({ kind: "ok" });
  });

  it("lists a paid pending request for approval instead of fixing it", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
        status: "pending",
      })
    ).toEqual({ kind: "approve", paymentStatus: "paid" });
  });

  it("leaves a pending request without approved payments alone", () => {
    expect(planVendorPaymentRepair({ ...base, status: "pending" })).toEqual({
      kind: "ok",
    });
  });

  it("moves an approved request with payments to its payment status", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [4000],
      })
    ).toEqual({ kind: "fix", status: "partially_paid" });
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
      })
    ).toEqual({ kind: "fix", status: "paid" });
  });

  it("moves a paid request with an unreviewed invoice to invoice_pending", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
        invoiceNumber: "INV-1",
      })
    ).toEqual({ kind: "fix", status: "invoice_pending" });
  });

  it("moves a request with an approved invoice to completed", () => {
    for (const status of ["approved", "paid"]) {
      expect(
        planVendorPaymentRepair({
          ...base,
          approvedTransactionAmountsPaise: [10_000],
          invoiceNumber: "INV-1",
          invoiceReviewedAt: new Date(2),
          latestInvoiceSubmittedAt: new Date(1),
          status,
        })
      ).toEqual({ kind: "fix", status: "completed" });
    }
  });

  it("flags an invoice changed after its last approval", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
        invoiceNumber: "INV-1",
        invoiceReviewedAt: new Date(1),
        latestInvoiceSubmittedAt: new Date(2),
      })
    ).toEqual({
      kind: "review",
      paymentStatus: "paid",
      reason: "invoice_review_stale",
    });
  });

  it("flags an approved invoice with no submission entry to date it", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
        invoiceNumber: "INV-1",
        invoiceReviewedAt: new Date(1),
      })
    ).toEqual({
      kind: "review",
      paymentStatus: "paid",
      reason: "invoice_review_stale",
    });
  });

  it("moves an approved request with a rejected invoice to paid", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
        invoiceNumber: "INV-1",
        invoiceRejectionReason: "Wrong GSTIN",
        invoiceReviewedAt: new Date(1),
        latestInvoiceSubmittedAt: new Date(2),
      })
    ).toEqual({ kind: "fix", status: "paid" });
  });

  it("treats a request without line items as paid once anything is paid", () => {
    expect(
      planVendorPaymentRepair({ ...base, lineItemAmountsPaise: [] })
    ).toEqual({ kind: "ok" });
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [500],
        lineItemAmountsPaise: [],
      })
    ).toEqual({ kind: "fix", status: "paid" });
  });

  it("flags a rejected request that has approved payments", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [4000],
        status: "rejected",
      })
    ).toEqual({
      kind: "review",
      paymentStatus: "partially_paid",
      reason: "rejected_with_payments",
    });
  });

  it("keeps a rejected invoice at paid until it is resubmitted", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [10_000],
        invoiceNumber: "INV-1",
        invoiceRejectionReason: "Wrong GSTIN",
        status: "paid",
      })
    ).toEqual({ kind: "ok" });
  });

  it("flags an invoice on a request that is no longer fully paid", () => {
    expect(
      planVendorPaymentRepair({
        ...base,
        approvedTransactionAmountsPaise: [4000],
        invoiceNumber: "INV-1",
      })
    ).toEqual({
      kind: "review",
      paymentStatus: "partially_paid",
      reason: "invoice_not_fully_paid",
    });
  });

  it("ignores locked statuses and rejected requests without payments", () => {
    for (const status of ["invoice_pending", "completed"]) {
      expect(
        planVendorPaymentRepair({
          ...base,
          approvedTransactionAmountsPaise: [10_000],
          status,
        })
      ).toEqual({ kind: "ok" });
    }
    expect(planVendorPaymentRepair({ ...base, status: "rejected" })).toEqual({
      kind: "ok",
    });
  });

  it("leaves locked statuses alone even when the invoice review is stale", () => {
    for (const status of ["invoice_pending", "completed"]) {
      expect(
        planVendorPaymentRepair({
          ...base,
          approvedTransactionAmountsPaise: [10_000],
          invoiceNumber: "INV-1",
          invoiceReviewedAt: new Date(1),
          latestInvoiceSubmittedAt: new Date(2),
          status,
        })
      ).toEqual({ kind: "ok" });
    }
  });
});
