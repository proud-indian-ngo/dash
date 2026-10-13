import {
  type DirectoryRole,
  directoryRoleValues,
  type ForeignSourceAssessment,
  foreignSourceAssessmentValues,
  type PartyIdType,
  partyIdTypeValues,
  partyKindValues,
} from "@pi-dash/shared/constants";
import { isValidPhoneNumber } from "libphonenumber-js";
import z from "zod";

export const DIRECTORY_ROLES = directoryRoleValues;
export type { DirectoryRole };

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const ID_TYPE_LABELS: Record<PartyIdType, string> = {
  driving_licence: "Driving licence",
  none: "None",
  pan: "PAN",
  passport: "Passport",
  ration_card: "Ration card",
  tax_id_foreign: "Foreign tax ID",
  voter_id: "Voter ID",
};

export const ASSESSMENT_LABELS: Record<ForeignSourceAssessment, string> = {
  domestic: "Domestic",
  foreign: "Foreign source",
  pending: "Not assessed yet",
};

const text = (max: number) => z.string().trim().max(max);

/** Field rules without the cross-field PAN check, so forms can pick and extend them. */
export const donorFieldsSchema = z.object({
  addressLine1: text(200),
  addressLine2: text(200),
  assessmentNote: text(500),
  city: text(80),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Two-letter country code"),
  displayName: text(160).min(1, "Name is required"),
  email: z.union([z.literal(""), z.email("Invalid email address")]),
  foreignSourceAssessment: z.enum(foreignSourceAssessmentValues),
  id: z.uuid().optional(),
  /** Blank keeps a stored identifier of the same type; a value replaces it. */
  idNumber: z.string().trim().max(40).toUpperCase(),
  idType: z.enum(partyIdTypeValues),
  kind: z.enum(partyKindValues),
  legalName: text(200),
  nationality: text(60),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === "" || isValidPhoneNumber(v), "Invalid phone number"),
  pincode: text(12),
  roles: z.array(z.enum(directoryRoleValues)).min(1, "Pick at least one role"),
  state: text(80),
});

export const panCheck = {
  check: (v: { idNumber: string; idType: string }) =>
    v.idType !== "pan" || v.idNumber === "" || PAN_PATTERN.test(v.idNumber),
  message: "Invalid PAN (e.g. ABCDE1234F)",
};

/** Shared by the donor form and the saveDonor server function. */
export const saveDonorSchema = donorFieldsSchema.refine(panCheck.check, {
  message: panCheck.message,
  path: ["idNumber"],
});

export type SaveDonorInput = z.infer<typeof saveDonorSchema>;
