import { cityValues } from "@pi-dash/shared/constants";
import { startOfDay } from "date-fns";
import z from "zod";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";
import type { RequestType } from "@/lib/reimbursement-types";

const baseFields = {
  attachments: z.array(attachmentSchema),
  bankAccountIfscCode: z.string().optional(),
  bankAccountName: z.string().min(1, "Bank account is required"),
  bankAccountNumber: z.string().min(1, "Bank account number is required"),
  city: z
    .enum(cityValues)
    .optional()
    .refine((value): value is "bangalore" | "mumbai" => value !== undefined, {
      message: "City is required",
    }),
  eventId: z.string().optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  title: z.string().min(1, "Title is required"),
};

export const reimbursementRequestFormSchema = z.object({
  ...baseFields,
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

export const advancePaymentRequestFormSchema = z.object({
  ...baseFields,
  type: z.literal("advance_payment"),
});

export const requestFormSchema = z.discriminatedUnion("type", [
  reimbursementRequestFormSchema,
  advancePaymentRequestFormSchema,
]);

export type RequestFormValues = z.infer<typeof requestFormSchema>;

export function getDefaultValues(type: RequestType): RequestFormValues {
  const base = {
    attachments: [] as RequestFormValues["attachments"],
    bankAccountIfscCode: "",
    bankAccountName: "",
    bankAccountNumber: "",
    city: undefined as "bangalore" | "mumbai" | undefined,
    lineItems: [newLineItem()],
    title: "",
  };

  if (type === "reimbursement") {
    return {
      ...base,
      expenseDate: undefined,
      type: "reimbursement",
    };
  }
  return { ...base, type: "advance_payment" };
}
