import { cityValues } from "@pi-dash/shared/constants";
import capitalize from "lodash/capitalize";
import { uuidv7 } from "uuidv7";
import z from "zod";

export const MAX_ATTACHMENT_FILES = 10;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export const cityOptions = cityValues.map((value) => ({
  label: capitalize(value),
  value,
}));

const amountSchema = z
  .number()
  .positive("Must be > 0")
  .multipleOf(0.01, "Must have at most 2 decimals");

export const lineItemSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount required")
    .refine((value) => amountSchema.safeParse(Number(value)).success, {
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

export const computeRunningTotal = (lineItems: LineItem[]): number =>
  lineItems.reduce((sum, item) => {
    const parsedAmount = Number(item.amount);
    return sum + (Number.isNaN(parsedAmount) ? 0 : parsedAmount);
  }, 0);

export const formatINR = (amount: number): string =>
  new Intl.NumberFormat("en-IN", {
    currency: "INR",
    style: "currency",
  }).format(amount);
