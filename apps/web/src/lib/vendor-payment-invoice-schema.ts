import { vendorPaymentNoInvoiceReasonValues } from "@pi-dash/shared/constants";
import {
  NO_INVOICE_NOTE_MAX_LENGTH,
  noInvoiceDetailsError,
} from "@pi-dash/shared/vendor-payment";
import z from "zod";

import { attachmentSchema } from "./form-schemas";

const invoiceFormFields = z.object({
  attachments: z.array(attachmentSchema),
  invoiceDate: z
    .date()
    .optional()
    .pipe(z.date({ error: "Date is required" })),
  invoiceNumber: z.string(),
  noInvoiceNote: z.string(),
  noInvoiceReason: z.string(),
});

export const invoiceFormSchema = z.discriminatedUnion("kind", [
  invoiceFormFields.extend({
    attachments: z
      .array(attachmentSchema)
      .min(1, "At least one invoice attachment is required"),
    invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
    kind: z.literal("invoice"),
  }),
  invoiceFormFields
    .extend({
      kind: z.literal("no_invoice"),
      noInvoiceNote: z.string().trim().max(NO_INVOICE_NOTE_MAX_LENGTH),
      noInvoiceReason: z
        .string()
        .pipe(
          z.enum(vendorPaymentNoInvoiceReasonValues, { error: "Pick a reason" })
        ),
    })
    .superRefine((value, context) => {
      const message = noInvoiceDetailsError({
        note: value.noInvoiceNote,
        reason: value.noInvoiceReason,
      });
      if (message) {
        context.addIssue({ code: "custom", message, path: ["noInvoiceNote"] });
      }
    }),
]);
