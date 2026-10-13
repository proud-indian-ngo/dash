import {
  formatPaise,
  rupeesToPaise,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import z from "zod";

import {
  type Attachment,
  attachmentSchema,
  positiveRupeesSchema,
} from "@/lib/form-schemas";

export function buildTransactionFormSchema(remainingPaise?: number) {
  return z.object({
    amount: positiveRupeesSchema.refine(
      (v) =>
        remainingPaise === undefined ||
        (tryRupeesToPaise(v) ?? 0) <= remainingPaise,
      {
        message: `Exceeds remaining balance of ${formatPaise(remainingPaise ?? 0)}`,
      }
    ),
    attachments: z.array(attachmentSchema),
    description: z.string(),
    paymentMethod: z.string(),
    paymentReference: z.string(),
    transactionDate: z.date({ message: "Date is required" }),
  });
}

export interface TransactionFormValues {
  amount: string;
  attachments: Attachment[];
  description: string;
  paymentMethod: string;
  paymentReference: string;
  transactionDate: Date;
}

/** Validated form values to the fields shared by the create and update mutators. */
export function toTransactionPayload(values: TransactionFormValues) {
  return {
    amountPaise: rupeesToPaise(values.amount),
    attachments: values.attachments,
    description: values.description || undefined,
    paymentMethod: values.paymentMethod || undefined,
    paymentReference: values.paymentReference || undefined,
    transactionDate: values.transactionDate.getTime(),
  };
}
