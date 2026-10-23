import { PAN_PATTERN } from "@pi-dash/shared/donations-return";
import {
  DOCUMENT_TITLE_MAX,
  governanceDocumentFormatValues,
  governanceDocumentKindValues,
  TRUSTEE_NAME_MAX,
  VALIDITY_NOTE_MAX,
} from "@pi-dash/shared/governance";
import z from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

/** 12-digit Aadhaar number or 16-digit Virtual ID, spaces allowed. */
export const AADHAAR_PATTERN = /^(?:\d{12}|\d{16})$/;

/**
 * A secret in the trustee form: omitted keeps what is stored, an empty
 * string clears it, anything else replaces it.
 */
const secret = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => v === "" || pattern.test(v), message)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const saveTrusteeSchema = z.object({
  aadhaarName: optionalText(TRUSTEE_NAME_MAX),
  aadhaarReference: secret(
    AADHAAR_PATTERN,
    "Enter the 12-digit Aadhaar number or the 16-digit Virtual ID"
  ),
  address: optionalText(500),
  email: z
    .union([z.literal(""), z.email("Invalid email address")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  id: z.uuid(),
  isCoFounder: z.boolean(),
  legalName: z.string().trim().min(1, "Name is required").max(TRUSTEE_NAME_MAX),
  mode: z.enum(["create", "update"]),
  pan: secret(PAN_PATTERN, "Enter a valid PAN, for example ABCDE1234F"),
  panName: optionalText(TRUSTEE_NAME_MAX),
  phone: optionalText(30),
  userId: z.string().min(1).nullable(),
});

export const governanceUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(100),
});

export const createGovernanceDocumentSchema = z.object({
  datedOn: z.iso.date(),
  fileName: z.string().trim().min(1).max(200),
  // A utilisation certificate enters the vault only when it becomes final.
  kind: z
    .enum(governanceDocumentKindValues)
    .refine(
      (kind) => kind !== "utilisation_certificate",
      "A utilisation certificate is filed when it becomes final; it can't be added by hand."
    ),
  note: optionalText(VALIDITY_NOTE_MAX),
  sourceFormat: z.enum(governanceDocumentFormatValues),
  tempKey: z.string().min(1).max(500),
  title: z.string().trim().min(1, "Title is required").max(DOCUMENT_TITLE_MAX),
});
