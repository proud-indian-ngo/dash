import { cityValues } from "@pi-dash/db/schema/shared";
import z from "zod";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";

export const advancePaymentFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  city: z
    .enum(cityValues)
    .optional()
    .refine((value): value is "bangalore" | "mumbai" => value !== undefined, {
      message: "City is required",
    }),
  bankAccountName: z.string().min(1, "Bank account is required"),
  bankAccountNumber: z.string().optional(),
  bankAccountIfscCode: z.string().optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  attachments: z.array(attachmentSchema),
});

export type AdvancePaymentFormValues = z.infer<typeof advancePaymentFormSchema>;

export const DEFAULT_VALUES: AdvancePaymentFormValues = {
  title: "",
  city: undefined,
  bankAccountName: "",
  bankAccountNumber: "",
  bankAccountIfscCode: "",
  lineItems: [newLineItem()],
  attachments: [],
};
