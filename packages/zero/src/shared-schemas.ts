import { z } from "zod";

export const mutatorAttachmentSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("file"),
    filename: z.string().min(1),
    objectKey: z.string().min(1),
    mimeType: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("url"),
    url: z.url(),
  }),
]);

export const mutatorLineItemSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  description: z.string().trim().min(1),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .multipleOf(0.01, "Amount must have at most 2 decimal places"),
  sortOrder: z.number().int(),
});
