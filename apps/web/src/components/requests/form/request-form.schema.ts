import { isDateOnOrBeforeToday } from "@pi-dash/zero/validation";
import z from "zod";
import { cityValues } from "@/lib/db-enums";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";
import type { RequestType } from "@/lib/request-types";

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
  expenseDate: z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expense date is required",
      });
      return;
    }
    if (!isDateOnOrBeforeToday(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expense date cannot be in the future",
      });
    }
  }),
});

export const advancePaymentRequestFormSchema = z.object({
  ...baseFields,
  type: z.literal("advance_payment"),
});

const vendorPaymentBaseFields = {
  title: z.string().min(1, "Title is required"),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  attachments: z.array(attachmentSchema),
};

export const vendorPaymentRequestFormSchema = z.object({
  ...vendorPaymentBaseFields,
  type: z.literal("vendor_payment"),
  vendorId: z.string().min(1, "Vendor is required"),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1, "Invoice date is required"),
});

export const requestFormSchema = z.discriminatedUnion("type", [
  reimbursementRequestFormSchema,
  advancePaymentRequestFormSchema,
  vendorPaymentRequestFormSchema,
]);

export type RequestFormValues = z.infer<typeof requestFormSchema>;

export function getFormSchema(type: RequestType) {
  if (type === "reimbursement") {
    return reimbursementRequestFormSchema;
  }
  if (type === "vendor_payment") {
    return vendorPaymentRequestFormSchema;
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
    return { ...base, type: "reimbursement", expenseDate: "" };
  }
  if (type === "vendor_payment") {
    return {
      title: "",
      lineItems: [newLineItem()],
      attachments: [] as RequestFormValues["attachments"],
      type: "vendor_payment",
      vendorId: "",
      invoiceNumber: "",
      invoiceDate: "",
    };
  }
  return { ...base, type: "advance_payment" };
}
