import {
  GST_REGEX,
  IFSC_REGEX,
  PAN_REGEX,
} from "@pi-dash/zero/vendor-patterns";
import { isValidPhoneNumber } from "libphonenumber-js";
import z from "zod";

export const optionalDate = z
  .string()
  .refine((v) => !v || z.string().date().safeParse(v).success, "Invalid date");

const gstNumber = z
  .string()
  .regex(GST_REGEX, "Invalid GST number (e.g. 22AAAAA0000A1Z5)");

const panNumber = z.string().regex(PAN_REGEX, "Invalid PAN (e.g. ABCDE1234F)");

export const vendorFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contactPhone: z
    .string()
    .min(1, "Phone is required")
    .refine((v) => isValidPhoneNumber(v), "Invalid phone number"),
  contactEmail: z.union([z.literal(""), z.email("Invalid email address")]),
  bankAccountName: z.string().min(1, "Bank account name is required"),
  bankAccountNumber: z.string().min(1, "Account number is required"),
  bankAccountIfscCode: z
    .string()
    .min(1, "IFSC code is required")
    .regex(IFSC_REGEX, "Invalid IFSC code (e.g. SBIN0001234)"),
  address: z.string(),
  gstNumber: z.union([z.literal(""), gstNumber]),
  panNumber: z.union([z.literal(""), panNumber]),
});
