import { cityValues } from "@pi-dash/shared/constants";
import { sumPaise, tryRupeesToPaise } from "@pi-dash/shared/money";
import capitalize from "lodash/capitalize";
import { uuidv7 } from "uuidv7";
import z from "zod";

export const MAX_ATTACHMENT_FILES = 10;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export const cityOptions = cityValues.map((value) => ({
  label: capitalize(value),
  value,
}));

export const lineItemSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount required")
    .refine((value) => (tryRupeesToPaise(value) ?? 0) > 0, {
      message: "Must be > 0 with max 2 decimals",
    }),
  categoryId: z.string().min(1, "Category required"),
  description: z.string().trim().min(1, "Description required"),
  generateVoucher: z.boolean().optional(),
  id: z.string(),
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
});

/** Running total in paise of the rupee amounts typed so far; invalid entries count as 0. */
export const computeRunningTotalPaise = (lineItems: LineItem[]): number =>
  sumPaise(lineItems.map((item) => tryRupeesToPaise(item.amount) ?? 0));
