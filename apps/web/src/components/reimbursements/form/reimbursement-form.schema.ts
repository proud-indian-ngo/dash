import { DEFAULT_CASH_VOUCHER_LIMIT_PAISE } from "@pi-dash/shared/cash-voucher";
import { startOfDay } from "date-fns";
import z from "zod";

import {
  chargedToFormFields,
  refineChargedTo,
  refineRequestCity,
} from "@/components/expenses/charged-to-schema";
import {
  addVoucherPayeeIssues,
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";
import type { RequestType } from "@/lib/reimbursement-types";

const baseFields = {
  attachments: z.array(attachmentSchema),
  bankAccountIfscCode: z.string().optional(),
  bankAccountName: z.string().min(1, "Choose a bank account or UPI"),
  // A saved account has bank details, UPI or both; the picker fills these.
  bankAccountNumber: z.string().optional(),
  bankAccountUpiId: z.string().optional(),
  /** Asked only without an event, when there is a choice (`refineRequestCity`). */
  costCentreId: z.string().optional(),
  eventId: z.string().optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  title: z.string().min(1, "Title is required"),
};

const reimbursementRequestFields = z.object({
  ...baseFields,
  ...chargedToFormFields,
  expenseDate: z
    .date()
    .optional()
    .refine((d): d is Date => d !== undefined, "Expense date is required")
    .refine(
      (d) => startOfDay(d) <= startOfDay(new Date()),
      "Expense date cannot be in the future"
    ),
  type: z.literal("reimbursement"),
});

/**
 * The reimbursement form, checking voucher payees against
 * `voucherLimitPaise`, and the city when `asksCity`.
 */
export function createReimbursementRequestFormSchema(
  voucherLimitPaise: number = DEFAULT_CASH_VOUCHER_LIMIT_PAISE,
  asksCity = false
) {
  return reimbursementRequestFields.superRefine((value, context) => {
    refineChargedTo(value, context);
    refineRequestCity(value, context, asksCity);
    addVoucherPayeeIssues(value.lineItems, voucherLimitPaise, context);
  });
}

export const reimbursementRequestFormSchema =
  createReimbursementRequestFormSchema();

const advancePaymentRequestFields = z.object({
  ...baseFields,
  type: z.literal("advance_payment"),
});

export function createAdvancePaymentRequestFormSchema(asksCity = false) {
  return advancePaymentRequestFields.superRefine((value, context) =>
    refineRequestCity(value, context, asksCity)
  );
}

export const advancePaymentRequestFormSchema =
  createAdvancePaymentRequestFormSchema();

/** Either request form, with the cash-voucher limit in force. */
export function createRequestFormSchema(
  voucherLimitPaise: number,
  asksCity = false
) {
  return z.discriminatedUnion("type", [
    createReimbursementRequestFormSchema(voucherLimitPaise, asksCity),
    createAdvancePaymentRequestFormSchema(asksCity),
  ]);
}

export const requestFormSchema = createRequestFormSchema(
  DEFAULT_CASH_VOUCHER_LIMIT_PAISE
);

export type RequestFormValues = z.infer<typeof requestFormSchema>;

export function getDefaultValues(type: RequestType): RequestFormValues {
  const base = {
    attachments: [] as RequestFormValues["attachments"],
    bankAccountIfscCode: "",
    bankAccountName: "",
    bankAccountNumber: "",
    bankAccountUpiId: "",
    costCentreId: undefined as string | undefined,
    lineItems: [newLineItem()],
    title: "",
  };

  if (type === "reimbursement") {
    return {
      ...base,
      // Most claims are for an event; the claimant switches otherwise.
      chargedTo: "event",
      expenseDate: undefined,
      type: "reimbursement",
    };
  }
  return { ...base, type: "advance_payment" };
}
