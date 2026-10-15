import { cityValues } from "@pi-dash/shared/constants";
import z from "zod";

import {
  chargedToFormFields,
  refineChargedTo,
} from "@/components/expenses/charged-to-schema";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";

const vendorPaymentBaseFields = {
  attachments: z.array(attachmentSchema),
  city: z.enum(cityValues, { message: "City is required" }),
  ...chargedToFormFields,
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  title: z.string().min(1, "Title is required"),
};

export const vendorPaymentFormSchema = z
  .object({
    ...vendorPaymentBaseFields,
    vendorId: z.string().min(1, "Vendor is required"),
  })
  .superRefine(refineChargedTo);

export type VendorPaymentFormValues = z.infer<typeof vendorPaymentFormSchema>;

export function getVendorPaymentDefaultValues(): VendorPaymentFormValues {
  return {
    attachments: [],
    // Most payments are for an event; the submitter switches otherwise.
    chargedTo: "event",
    city: "bangalore",
    eventId: undefined,
    lineItems: [newLineItem()],
    title: "",
    vendorId: "",
  };
}
