import { cityValues } from "@pi-dash/shared";
import { startOfDay } from "date-fns";
import z from "zod";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";
import type { RequestType } from "@/lib/reimbursement-types";

const baseFields = {
  title: z.string().min(1, "Title is required"),
  city: z
    .enum(cityValues)
    .optional()
    .refine((value): value is "bangalore" | "mumbai" => value !== undefined, {
      message: "City is required",
    }),
  bankAccountName: z.string().min(1, "Bank account is required"),
  bankAccountNumber: z.string().min(1, "Bank account number is required"),
  bankAccountIfscCode: z.string().optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  attachments: z.array(attachmentSchema),
};

export const reimbursementRequestFormSchema = z.object({
  ...baseFields,
  type: z.literal("reimbursement"),
  expenseDate: z
    .date()
    .optional()
    .refine((d): d is Date => d != null, "Expense date is required")
    .refine(
      (d) => startOfDay(d) <= startOfDay(new Date()),
      "Expense date cannot be in the future"
    ),
});

export const advancePaymentRequestFormSchema = z.object({
  ...baseFields,
  type: z.literal("advance_payment"),
});

export const requestFormSchema = z.discriminatedUnion("type", [
  reimbursementRequestFormSchema,
  advancePaymentRequestFormSchema,
]);

export type RequestFormValues = z.infer<typeof requestFormSchema>;

export function getFormSchema(type: RequestType) {
  if (type === "reimbursement") {
    return reimbursementRequestFormSchema;
  }
  return advancePaymentRequestFormSchema;
}

export function getDefaultValues(type: RequestType): RequestFormValues {
  const base = {
    title: "",
    city: undefined as "bangalore" | "mumbai" | undefined,
    bankAccountName: "",
    bankAccountNumber: "",
    bankAccountIfscCode: "",
    lineItems: [newLineItem()],
    attachments: [] as RequestFormValues["attachments"],
  };

  if (type === "reimbursement") {
    return {
      ...base,
      type: "reimbursement",
      expenseDate: undefined,
    };
  }
  return { ...base, type: "advance_payment" };
}
