import z from "zod";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";

const vendorPaymentBaseFields = {
  title: z.string().min(1, "Title is required"),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  attachments: z.array(attachmentSchema),
};

export const vendorPaymentFormSchema = z.object({
  ...vendorPaymentBaseFields,
  vendorId: z.string().min(1, "Vendor is required"),
});

export type VendorPaymentFormValues = z.infer<typeof vendorPaymentFormSchema>;

export function getVendorPaymentDefaultValues(): VendorPaymentFormValues {
  return {
    title: "",
    lineItems: [newLineItem()],
    attachments: [],
    vendorId: "",
  };
}
