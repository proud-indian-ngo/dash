import { isDateOnOrBeforeToday } from "@pi-dash/zero/validation";
import z from "zod";
import { cityValues } from "@/lib/db-enums";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";

export const reimbursementFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  city: z
    .enum(cityValues)
    .optional()
    .refine((value): value is "bangalore" | "mumbai" => value !== undefined, {
      message: "City is required",
    }),
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
  bankAccountName: z.string().min(1, "Bank account is required"),
  bankAccountNumber: z.string().optional(),
  bankAccountIfscCode: z.string().optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  attachments: z.array(attachmentSchema),
});

export type ReimbursementFormValues = z.infer<typeof reimbursementFormSchema>;

export const DEFAULT_VALUES: ReimbursementFormValues = {
  title: "",
  city: undefined,
  expenseDate: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankAccountIfscCode: "",
  lineItems: [newLineItem()],
  attachments: [],
};
