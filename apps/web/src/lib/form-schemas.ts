import {
  isIndianMobile,
  PAYEE_PHONE_MESSAGE,
} from "@pi-dash/shared/cash-voucher";
import { cityValues } from "@pi-dash/shared/constants";
import {
  MAX_AMOUNT_MESSAGE,
  MAX_AMOUNT_PAISE,
  RUPEES_INPUT_MESSAGE,
  rupeesToPaise,
  sumPaise,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import capitalize from "lodash/capitalize";
import { uuidv7 } from "uuidv7";
import z from "zod";

export const MAX_ATTACHMENT_FILES = 10;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export const cityOptions = cityValues.map((value) => ({
  label: capitalize(value),
  value,
}));

/** A positive rupee amount typed into a form, within the per-item limit. */
export const positiveRupeesSchema = z
  .string()
  .min(1, "Amount required")
  .superRefine((value, context) => {
    const paise = tryRupeesToPaise(value);
    if (paise === null) {
      context.addIssue({ code: "custom", message: RUPEES_INPUT_MESSAGE });
    } else if (paise <= 0) {
      context.addIssue({ code: "custom", message: "Must be greater than 0" });
    } else if (paise > MAX_AMOUNT_PAISE) {
      context.addIssue({ code: "custom", message: MAX_AMOUNT_MESSAGE });
    }
  });

export const lineItemSchema = z
  .object({
    amount: positiveRupeesSchema,
    categoryId: z.string().min(1, "Category required"),
    description: z.string().trim().min(1, "Description required"),
    generateVoucher: z.boolean().optional(),
    id: z.string(),
    /** The cash-voucher payee's mobile, E.164 from the phone input; optional. */
    payeePhone: z.string().optional(),
  })
  // Checked only while the voucher is ticked: the field is hidden, and its
  // value dropped on submit, otherwise.
  .superRefine((item, context) => {
    if (
      item.generateVoucher &&
      item.payeePhone &&
      !isIndianMobile(item.payeePhone)
    ) {
      context.addIssue({
        code: "custom",
        message: PAYEE_PHONE_MESSAGE,
        path: ["payeePhone"],
      });
    }
  });

export const attachmentSchema = z.discriminatedUnion("type", [
  z.object({
    filename: z.string().min(1),
    id: z.string(),
    mimeType: z.string().optional(),
    objectKey: z.string().min(1),
    type: z.literal("file"),
  }),
  z.object({
    id: z.string(),
    type: z.literal("url"),
    url: z.string().url("Must be a valid URL"),
  }),
]);

export type LineItem = z.infer<typeof lineItemSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;

export const newLineItem = (): LineItem => ({
  amount: "",
  categoryId: "",
  description: "",
  generateVoucher: false,
  id: uuidv7(),
  payeePhone: "",
});

/** Running total in paise of the rupee amounts typed so far; invalid entries count as 0. */
export const computeRunningTotalPaise = (lineItems: LineItem[]): number =>
  sumPaise(lineItems.map((item) => tryRupeesToPaise(item.amount) ?? 0));

/**
 * Validated form line items to mutator line items: rupee text becomes paise,
 * order becomes sortOrder, and the payee phone is sent only with a voucher
 * opt-in (null otherwise).
 */
export const toLineItemsPayload = <
  T extends { amount: string; generateVoucher?: boolean; payeePhone?: string },
>(
  lineItems: readonly T[]
): (Omit<T, "amount" | "payeePhone"> & {
  amountPaise: number;
  payeePhone: string | null;
  sortOrder: number;
})[] =>
  lineItems.map(({ amount, payeePhone, ...item }, index) => ({
    ...item,
    amountPaise: rupeesToPaise(amount),
    payeePhone: (item.generateVoucher && payeePhone) || null,
    sortOrder: index,
  }));
