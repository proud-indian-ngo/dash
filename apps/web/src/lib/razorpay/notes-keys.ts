import z from "zod";

/**
 * Which Razorpay `notes` keys carry the donor's details. Payment Page form
 * fields arrive as notes under keys the page owner chose, so the keys are a
 * small editable setting. Keys compare case-insensitively, ignoring spaces
 * and punctuation. Client-safe: the settings page edits these.
 */

export const NOTES_FIELDS = [
  "name",
  "pan",
  "address",
  "city",
  "state",
  "pincode",
] as const;
export type NotesField = (typeof NOTES_FIELDS)[number];

export type NotesKeys = Record<NotesField, string[]>;

export const NOTES_FIELD_LABELS: Record<NotesField, string> = {
  address: "Address",
  city: "City",
  name: "Donor name",
  pan: "PAN",
  pincode: "Pincode",
  state: "State",
};

export const DEFAULT_NOTES_KEYS: NotesKeys = {
  address: ["address", "address_line_1", "full_address"],
  city: ["city"],
  name: ["name", "full_name", "donor_name"],
  pan: ["pan", "pan_number", "pan_no", "pan_card"],
  pincode: ["pincode", "pin_code", "pin", "postal_code", "zip"],
  state: ["state"],
};

export const MAX_NOTES_KEYS_PER_FIELD = 8;
const MAX_NOTES_KEY_LENGTH = 40;

/** "Full Name", "full_name" and "FULL-NAME" compare equal. */
export const notesKey = (key: string) =>
  key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

export const notesKeysSchema = z.object(
  Object.fromEntries(
    NOTES_FIELDS.map((field) => [
      field,
      z
        .array(z.string().trim().min(1).max(MAX_NOTES_KEY_LENGTH))
        .max(MAX_NOTES_KEYS_PER_FIELD),
    ])
  ) as Record<NotesField, z.ZodArray<z.ZodString>>
);

/** The stored setting, falling back to the defaults for a missing or unreadable value. */
export function parseNotesKeys(stored: string | null | undefined): NotesKeys {
  if (!stored) {
    return DEFAULT_NOTES_KEYS;
  }
  try {
    const parsed = notesKeysSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : DEFAULT_NOTES_KEYS;
  } catch {
    return DEFAULT_NOTES_KEYS;
  }
}

/** "name, full_name" to a key list, dropping blanks and repeats. */
export function splitNotesKeys(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((key) => key.trim())
    .filter((key) => {
      const k = notesKey(key);
      if (!k || seen.has(k)) {
        return false;
      }
      seen.add(k);
      return true;
    });
}
