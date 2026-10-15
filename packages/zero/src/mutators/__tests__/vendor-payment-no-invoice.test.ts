import { describe, expect, it, mock } from "bun:test";

import type { Context } from "../../context";
import { vendorPaymentMutators } from "../vendor-payment";

const context = (permissions: string[] = []): Context => ({
  permissions,
  role: "volunteer",
  userId: "user-1",
});

const ADMIN = ["requests.approve", "requests.edit_all"];

const proof = {
  id: "proof-1",
  type: "url" as const,
  url: "https://example.com/rent-receipt.pdf",
};

/** A client transaction over one vendor payment and its invoice files. */
function invoiceTx(
  entity: Record<string, unknown>,
  invoiceAttachments: { id: string; objectKey?: string }[] = []
) {
  const update = mock();
  const deleteAttachment = mock();
  const insertAttachment = mock();
  const insertHistory = mock();
  const tx = {
    location: "client",
    mutate: {
      vendorPayment: { update },
      vendorPaymentAttachment: {
        delete: deleteAttachment,
        insert: insertAttachment,
      },
      vendorPaymentHistory: { insert: insertHistory },
    },
    run: mock()
      .mockResolvedValueOnce({
        title: "Office rent",
        userId: "user-1",
        ...entity,
      })
      .mockResolvedValueOnce(invoiceAttachments),
  };
  return { deleteAttachment, insertAttachment, insertHistory, tx, update };
}

const validate = (args: unknown) => {
  const result =
    vendorPaymentMutators.submitInvoice.validator?.["~standard"].validate(args);
  return Boolean(result && "issues" in result && result.issues?.length);
};

function validatedInvoiceArgs(
  mutator: "submitInvoice" | "updateInvoice",
  args: unknown
) {
  const result =
    vendorPaymentMutators[mutator].validator?.["~standard"].validate(args);
  if (!result || result instanceof Promise || "issues" in result) {
    throw new Error("Expected valid synchronous invoice details");
  }
  return result.value;
}

describe("closing a vendor payment without an invoice", () => {
  it.each(["submitInvoice", "updateInvoice"] as const)(
    "requires a note for other on the server in %s",
    async (mutator) => {
      const { tx, update } = invoiceTx({
        status: mutator === "submitInvoice" ? "paid" : "invoice_pending",
      });
      tx.location = "server";

      await expect(
        vendorPaymentMutators[mutator].fn({
          args: {
            attachments: [],
            id: "vp-1",
            invoiceDate: 1,
            kind: "no_invoice",
            noInvoiceNote: "   ",
            noInvoiceReason: "other",
          },
          ctx: context(),
          tx,
        } as never)
      ).rejects.toThrow("Add a note explaining why there is no invoice");
      expect(update).not.toHaveBeenCalled();
    }
  );

  it("accepts rent without proof", async () => {
    const { tx, update } = invoiceTx({ status: "paid" });

    await vendorPaymentMutators.submitInvoice.fn({
      args: {
        attachments: [],
        id: "vp-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceReason: "rent",
      },
      ctx: context(),
      tx,
    } as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        noInvoiceReason: "rent",
        status: "invoice_pending",
      })
    );
  });

  it("stores a statutory payment's proof, with the note optional", async () => {
    const { insertAttachment, insertHistory, tx, update } = invoiceTx({
      status: "paid",
    });
    await vendorPaymentMutators.submitInvoice.fn({
      args: {
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceReason: "statutory",
      },
      ctx: context(),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceDate: 1,
        invoiceNumber: null,
        invoiceRejectionReason: null,
        noInvoiceNote: null,
        noInvoiceReason: "statutory",
        status: "invoice_pending",
      })
    );
    expect(insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "invoice", url: proof.url })
    );
    expect(insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invoice_submitted",
        metadata: { invoiceKind: "no_invoice", noInvoiceReason: "statutory" },
        note: "No invoice: Tax / statutory payment",
      })
    );
  });

  it("needs a note for other, with proof optional", async () => {
    const refused = invoiceTx({ status: "paid" });
    await expect(
      vendorPaymentMutators.submitInvoice.fn({
        args: {
          attachments: [proof],
          id: "vp-1",
          invoiceDate: 1,
          kind: "no_invoice",
          noInvoiceNote: "   ",
          noInvoiceReason: "other",
        },
        ctx: context(),
        tx: refused.tx,
      } as never)
    ).rejects.toThrow("Add a note explaining why there is no invoice");
    expect(refused.update).not.toHaveBeenCalled();

    const { tx, update } = invoiceTx({ status: "paid" });
    await vendorPaymentMutators.submitInvoice.fn({
      args: {
        attachments: [],
        id: "vp-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceNote: " Paid in cash at the venue ",
        noInvoiceReason: "other",
      },
      ctx: context(),
      tx,
    } as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        noInvoiceNote: "Paid in cash at the venue",
        noInvoiceReason: "other",
        status: "invoice_pending",
      })
    );
  });

  it("refuses invoice details and a no-invoice reason together", () => {
    expect(
      validate({
        attachments: [proof],
        id: "vp-1",
        invoiceNumber: "INV-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceReason: "rent",
      })
    ).toBe(true);
    expect(
      validate({
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        invoiceNumber: "INV-1",
        kind: "invoice",
        noInvoiceReason: "rent",
      })
    ).toBe(true);
    expect(
      validate({
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceReason: "rent",
      })
    ).toBe(false);
  });

  it("refuses a blank invoice number at the mutator boundary", () => {
    expect(
      validate({
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        invoiceNumber: "   ",
        kind: "invoice",
      })
    ).toBe(true);
  });

  it.each(["submitInvoice", "updateInvoice"] as const)(
    "requires a date for no-invoice details in %s",
    (mutator) => {
      const result = vendorPaymentMutators[mutator].validator?.[
        "~standard"
      ].validate({
        attachments: [],
        id: "vp-1",
        kind: "no_invoice",
        noInvoiceReason: "rent",
      });

      expect(
        result && "issues" in result && result.issues?.length
      ).toBeTruthy();
    }
  );

  it.each(["submitInvoice", "updateInvoice"] as const)(
    "treats a missing kind as invoice in %s for one-release compatibility",
    async (mutator) => {
      const args = validatedInvoiceArgs(mutator, {
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        invoiceNumber: "INV-LEGACY",
      });
      const { tx, update } = invoiceTx({
        status: mutator === "submitInvoice" ? "paid" : "invoice_pending",
      });

      expect(args).toEqual(
        expect.objectContaining({
          kind: "invoice",
          invoiceNumber: "INV-LEGACY",
        })
      );
      await vendorPaymentMutators[mutator].fn({
        args,
        ctx: context(),
        tx,
      } as never);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceDate: 1,
          invoiceNumber: "INV-LEGACY",
          noInvoiceNote: null,
          noInvoiceReason: null,
          status: "invoice_pending",
        })
      );
    }
  );

  it("lets the owner resubmit without an invoice after a rejection, clearing the invoice", async () => {
    const { deleteAttachment, tx, update } = invoiceTx(
      {
        invoiceDate: "2026-09-01",
        invoiceNumber: "INV-1",
        invoiceRejectionReason: "This is rent, there is no invoice",
        status: "paid",
      },
      [{ id: "old-invoice" }]
    );

    await vendorPaymentMutators.submitInvoice.fn({
      args: {
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceReason: "rent",
      },
      ctx: context(),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceDate: 1,
        invoiceNumber: null,
        invoiceRejectionReason: null,
        noInvoiceReason: "rent",
        status: "invoice_pending",
      })
    );
    expect(deleteAttachment).toHaveBeenCalledWith({ id: "old-invoice" });
  });

  it("reopens review and notifies approvers when a completed request switches kind", async () => {
    const { deleteAttachment, insertHistory, tx, update } = invoiceTx(
      {
        invoiceReviewedAt: 100,
        invoiceReviewedBy: "reviewer-1",
        noInvoiceNote: "Paid in cash",
        noInvoiceReason: "other",
        status: "completed",
        userId: "owner-1",
      },
      [{ id: "old-proof" }]
    );
    tx.location = "server";
    tx.run.mockResolvedValueOnce({ name: "Admin User" });
    const asyncTasks: NonNullable<Context["asyncTasks"]> = [];
    const ctx = { ...context(ADMIN), asyncTasks };

    await vendorPaymentMutators.updateInvoice.fn({
      args: {
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        invoiceNumber: "INV-9",
        kind: "invoice",
      },
      ctx,
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceDate: 1,
        invoiceNumber: "INV-9",
        invoiceReviewedAt: null,
        invoiceReviewedBy: null,
        noInvoiceNote: null,
        noInvoiceReason: null,
        status: "invoice_pending",
      })
    );
    expect(deleteAttachment).toHaveBeenCalledWith({ id: "old-proof" });
    expect(insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invoice_updated",
        metadata: {
          invoiceKind: "invoice",
          oldInvoiceKind: "no_invoice",
          newInvoiceKind: "invoice",
        },
        note: null,
      })
    );
    expect(asyncTasks.map((task) => task.meta)).toEqual([
      // The books follow: a reopened review reverses a posted expense.
      {
        mutator: "vendorPayment.updateInvoice",
        sourceId: "vp-1",
        sourceType: "vendor_payment",
      },
      {
        mutator: "updateVendorPaymentInvoice",
        vendorPaymentId: "vp-1",
      },
    ]);
  });

  it("keeps a completed request and its review when an admin edits the same kind", async () => {
    const { tx, update } = invoiceTx({
      invoiceReviewedAt: 100,
      invoiceReviewedBy: "reviewer-1",
      noInvoiceReason: "rent",
      status: "completed",
      userId: "owner-1",
    });

    await vendorPaymentMutators.updateInvoice.fn({
      args: {
        attachments: [proof],
        id: "vp-1",
        invoiceDate: 1,
        kind: "no_invoice",
        noInvoiceReason: "statutory",
      },
      ctx: context(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        noInvoiceReason: "statutory",
        status: "completed",
      })
    );
    const updateArgs = update.mock.calls[0]?.[0];
    expect(updateArgs).not.toHaveProperty("invoiceReviewedAt");
    expect(updateArgs).not.toHaveProperty("invoiceReviewedBy");
  });

  it("is approved to completed like an invoice", async () => {
    const update = mock();
    const tx = {
      location: "client",
      mutate: {
        vendorPayment: { update },
        vendorPaymentHistory: { insert: mock() },
      },
      run: mock().mockResolvedValueOnce({
        noInvoiceReason: "rent",
        status: "invoice_pending",
      }),
    };

    await vendorPaymentMutators.approveInvoice.fn({
      args: { id: "vp-1" },
      ctx: context(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vp-1", status: "completed" })
    );
  });

  it("returns a rejected no-invoice submission to paid with the rejection reason", async () => {
    const { insertHistory, tx, update } = invoiceTx({
      noInvoiceReason: "rent",
      status: "invoice_pending",
    });

    await vendorPaymentMutators.rejectInvoice.fn({
      args: { id: "vp-1", reason: "Attach the signed rent receipt" },
      ctx: context(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "vp-1",
        invoiceRejectionReason: "Attach the signed rent receipt",
        status: "paid",
      })
    );
    expect(insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invoice_rejected",
        note: "Attach the signed rent receipt",
      })
    );
  });
});
