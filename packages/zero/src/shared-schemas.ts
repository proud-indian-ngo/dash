import { z } from "zod";

export const mutatorAttachmentSchema = z.discriminatedUnion("type", [
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
    url: z.url(),
  }),
]);

export const mutatorLineItemSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .multipleOf(0.01, "Amount must have at most 2 decimal places"),
  categoryId: z.string(),
  description: z.string().trim().min(1),
  generateVoucher: z.boolean().optional().default(false),
  id: z.string(),
  sortOrder: z.number().int(),
});
