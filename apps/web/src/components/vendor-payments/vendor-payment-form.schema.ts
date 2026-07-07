import { cityValues } from "@pi-dash/shared/constants";
import z from "zod";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";

const vendorPaymentBaseFields = {
  attachments: z.array(attachmentSchema),
  city: z.enum(cityValues, { message: "City is required" }),
  eventId: z.string().optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  title: z.string().min(1, "Title is required"),
};

export const vendorPaymentFormSchema = z.object({
  ...vendorPaymentBaseFields,
  vendorId: z.string().min(1, "Vendor is required"),
});

export type VendorPaymentFormValues = z.infer<typeof vendorPaymentFormSchema>;

export function getVendorPaymentDefaultValues(): VendorPaymentFormValues {
  return {
    attachments: [],
    city: "bangalore",
    eventId: undefined,
    lineItems: [newLineItem()],
    title: "",
    vendorId: "",
  };
}
