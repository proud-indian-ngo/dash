import z from "zod";

export const groupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  jid: z.string().min(1, "JID is required"),
  description: z.string().optional(),
});

export type GroupFormValues = z.infer<typeof groupSchema>;
