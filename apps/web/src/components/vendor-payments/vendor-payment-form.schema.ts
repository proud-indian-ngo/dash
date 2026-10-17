import z from "zod";

import {
  chargedToFormFields,
  refineChargedTo,
  refineRequestCity,
} from "@/components/expenses/charged-to-schema";
import {
  attachmentSchema,
  lineItemSchema,
  newLineItem,
} from "@/lib/form-schemas";

const vendorPaymentBaseFields = {
  attachments: z.array(attachmentSchema),
  /** Asked only without an event, when there is a choice (`refineRequestCity`). */
  costCentreId: z.string().optional(),
  ...chargedToFormFields,
  lineItems: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
  title: z.string().min(1, "Title is required"),
};

const vendorPaymentFields = z.object({
  ...vendorPaymentBaseFields,
  vendorId: z.string().min(1, "Vendor is required"),
});

/** The vendor payment form; `asksCity` when the "City" picker shows. */
export function createVendorPaymentFormSchema(asksCity = false) {
  return vendorPaymentFields.superRefine((value, context) => {
    refineChargedTo(value, context);
    refineRequestCity(value, context, asksCity);
  });
}

export const vendorPaymentFormSchema = createVendorPaymentFormSchema();

export type VendorPaymentFormValues = z.infer<typeof vendorPaymentFormSchema>;

export function getVendorPaymentDefaultValues(): VendorPaymentFormValues {
  return {
    attachments: [],
    // Most payments are for an event; the submitter switches otherwise.
    chargedTo: "event",
    costCentreId: undefined,
    eventId: undefined,
    lineItems: [newLineItem()],
    title: "",
    vendorId: "",
  };
}
