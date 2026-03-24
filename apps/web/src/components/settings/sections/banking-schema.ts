import z from "zod";

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const bankAccountSchema = z.object({
  accountName: z.string().min(1, "Account name is required"),
  accountNumber: z.string().min(1, "Account number is required"),
  ifscCode: z.string().refine((v) => IFSC_PATTERN.test(v.toUpperCase()), {
    message:
      "IFSC must be 11 characters: 4 letters, a zero, then 6 alphanumeric (e.g. ABCD0123456)",
  }),
});

export type BankAccountFormValues = z.infer<typeof bankAccountSchema>;
