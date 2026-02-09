import z from "zod";

export const optionalDate = z
  .string()
  .refine((v) => !v || z.string().date().safeParse(v).success, "Invalid date");

// export const optionalUrl = z
//   .string()
//   .refine((v) => !v || z.url().safeParse(v).success, "Invalid URL");
