import z from "zod";

export const genderSchema = z
  .enum(["male", "female", "unspecified"])
  .or(z.literal(""));

export const profileSchema = z.object({
  gender: genderSchema,
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
