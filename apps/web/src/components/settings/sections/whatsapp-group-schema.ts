import z from "zod";

export const groupSchema = z.object({
  description: z.string().optional(),
  jid: z.string().min(1, "JID is required"),
  name: z.string().min(1, "Name is required"),
});

export type GroupFormValues = z.infer<typeof groupSchema>;
