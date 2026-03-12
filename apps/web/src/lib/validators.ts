import z from "zod";

export const optionalDate = z
  .string()
  .refine((v) => !v || z.string().date().safeParse(v).success, "Invalid date");
