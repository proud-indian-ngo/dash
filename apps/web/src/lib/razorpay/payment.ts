import { todayInKolkata } from "@pi-dash/shared/income";
import { MAX_AMOUNT_MESSAGE, MAX_AMOUNT_PAISE } from "@pi-dash/shared/money";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import z from "zod";

import { PAN_PATTERN } from "@/lib/donor-schema";
import type { ImportFieldKey } from "@/lib/income-import/fields";
import { keyedHash } from "@/lib/income-import/identity";
import {
  type CellIssue,
  FOREIGN_CURRENCY_MESSAGE,
  isRupeeCurrency,
  type NormalizeResult,
} from "@/lib/income-import/normalize";

import {
  DEFAULT_NOTES_KEYS,
  type NotesField,
  type NotesKeys,
  notesKey,
} from "./notes-keys";

/**
 * Server-only (node:crypto). A Razorpay payment as pi-dash stores and reads
 * it: the allow-listed fields flattened into an import row, the row turned
 * into contribution and donor values, and the fingerprint that tells a
 * repeated delivery from a changed payment.
 */

export type RazorpayMode = "live" | "test";

/** The key id's prefix decides the mode; there is no guess. */
export function razorpayMode(keyId: string): RazorpayMode {
  return keyId.startsWith("rzp_test_") ? "test" : "live";
}

const scalar = z.union([z.string(), z.number(), z.boolean()]).nullish();

/** The fields of a payment entity pi-dash reads; anything else is ignored. */
export const razorpayPaymentSchema = z.object({
  amount: z.number().int(),
  contact: scalar,
  created_at: z.number().int(),
  currency: z.string(),
  description: scalar,
  email: scalar,
  fee: z.number().int().nullish(),
  id: z.string().regex(/^pay_\w+$/),
  international: z.boolean().nullish(),
  method: scalar,
  // An empty notes object arrives as [].
  notes: z
    .union([z.record(z.string(), scalar), z.array(z.unknown())])
    .nullish(),
  order_id: scalar,
  status: z.string(),
  tax: z.number().int().nullish(),
});
export type RazorpayPayment = z.infer<typeof razorpayPaymentSchema>;

const FLAT_FIELDS = [
  "id",
  "amount",
  "currency",
  "status",
  "method",
  "order_id",
  "description",
  "email",
  "contact",
  "fee",
  "tax",
  "created_at",
  "international",
] as const satisfies readonly (keyof RazorpayPayment)[];

const NOTES_PREFIX = "notes.";
/** At most this many notes are kept from one payment. */
export const MAX_STORED_NOTES = 20;
/** A kept note's value is cut to this many characters. */
export const MAX_NOTE_VALUE_LENGTH = 500;

/**
 * The payment as an import row: allow-listed fields as strings under their
 * names, and only the notes whose key is one the settings or the defaults
 * read (compared as `notesKey` does), at most 20, each cut to 500
 * characters. Other notes, and card, bank and VPA details, are never kept,
 * so a key added to the settings later cannot be read from payments staged
 * before it: data minimisation wins over re-reading old payments.
 */
export function flattenPayment(
  payment: RazorpayPayment,
  keys: NotesKeys
): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const field of FLAT_FIELDS) {
    const value = payment[field];
    if (value !== null && value !== undefined) {
      raw[field] = String(value);
    }
  }
  if (payment.notes && !Array.isArray(payment.notes)) {
    const wanted = new Set(
      [...Object.values(keys), ...Object.values(DEFAULT_NOTES_KEYS)]
        .flat()
        .map(notesKey)
    );
    let kept = 0;
    for (const [key, value] of Object.entries(payment.notes)) {
      if (kept >= MAX_STORED_NOTES) {
        break;
      }
      if (
        value === null ||
        value === undefined ||
        String(value) === "" ||
        !wanted.has(notesKey(key))
      ) {
        continue;
      }
      raw[`${NOTES_PREFIX}${key}`] = String(value).slice(
        0,
        MAX_NOTE_VALUE_LENGTH
      );
      kept += 1;
    }
  }
  return raw;
}

/**
 * Fingerprint of what the donor and Razorpay said about the payment. Refund
 * fields are left out, so a later refund never turns a repeated delivery
 * into a conflict. The notes are the minimised ones `flattenPayment` kept,
 * so the hash does depend on the notes-key setting. That is safe: a payment
 * that reached an outcome is never staged again (a redelivery is found by its
 * ID or its external identity and leaves the row alone), so a copy flattened
 * under changed keys is never compared with the stored hash.
 */
export function razorpayPayloadHash(raw: Readonly<Record<string, string>>) {
  const notes = Object.entries(raw)
    .filter(([key]) => key.startsWith(NOTES_PREFIX))
    .sort(([a], [b]) => a.localeCompare(b));
  return keyedHash(
    "razorpay-payload",
    JSON.stringify([
      raw.id,
      raw.amount,
      raw.currency,
      raw.created_at,
      raw.email ?? "",
      raw.contact ?? "",
      raw.fee ?? "",
      raw.tax ?? "",
      notes,
    ])
  );
}

/** India calendar day of a unix-seconds timestamp. */
export function istDayOf(unixSeconds: number): string {
  return todayInKolkata(new Date(unixSeconds * 1000));
}

/** The key of the batch a payment belongs to: one per mode and India day. */
export const razorpayBatchKey = (mode: RazorpayMode, day: string) =>
  `razorpay:${mode}:${day}`;

const BATCH_KEY = /^razorpay:(live|test):(\d{4}-\d{2}-\d{2})$/;

export function parseRazorpayBatchKey(
  key: string
): { day: string; mode: RazorpayMode } | null {
  const match = BATCH_KEY.exec(key);
  return match ? { day: match[2] ?? "", mode: match[1] as RazorpayMode } : null;
}

export function razorpayBatchName(mode: RazorpayMode, day: string): string {
  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
  return `Razorpay payments, ${label}${mode === "test" ? " (test mode)" : ""}`;
}

const LIMITS: Partial<Record<NotesField, number>> = {
  address: 200,
  city: 80,
  name: 160,
  pincode: 12,
  state: 80,
};

const FIELD_OF: Record<NotesField, ImportFieldKey> = {
  address: "addressLine1",
  city: "city",
  name: "donorName",
  pan: "idNumber",
  pincode: "pincode",
  state: "state",
};

const collapse = (value: string) => value.replaceAll(/\s+/g, " ").trim();
const isEmail = (value: string) => z.email().safeParse(value).success;
const INTEGER = /^\d+$/;

/** Each notes field's value, read through the configured keys. */
function readNotes(
  raw: Readonly<Record<string, string>>,
  keys: NotesKeys,
  warnings: CellIssue[]
): Record<NotesField, string> {
  const byKey = new Map<string, string>();
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(NOTES_PREFIX)) {
      byKey.set(notesKey(key.slice(NOTES_PREFIX.length)), collapse(value));
    }
  }
  const values = {} as Record<NotesField, string>;
  for (const field of Object.keys(keys) as NotesField[]) {
    const found = keys[field]
      .map((key) => byKey.get(notesKey(key)) ?? "")
      .find(Boolean);
    let value = found ?? "";
    const max = LIMITS[field];
    if (max && value.length > max) {
      value = value.slice(0, max);
      warnings.push({
        field: FIELD_OF[field],
        message: `Longer than ${max} characters; shortened`,
      });
    }
    values[field] = value;
  }
  return values;
}

const integerOf = (text: string | undefined): number | null =>
  text !== undefined && INTEGER.test(text) ? Number(text) : null;

/**
 * A stored Razorpay row to the values a contribution and a donor need, in
 * the CSV importer's shape so both share classification and review. Amount,
 * fee and tax are already paise; Razorpay's fee includes its GST, so the
 * fee kept is fee minus tax.
 */
export function normalizeRazorpayRow(
  raw: Readonly<Record<string, string>>,
  keys: NotesKeys
): NormalizeResult {
  const errors: CellIssue[] = [];
  const warnings: CellIssue[] = [];
  const notes = readNotes(raw, keys, warnings);
  const id = raw.id ?? "";

  let amountPaise = integerOf(raw.amount);
  if (!isRupeeCurrency(raw.currency ?? "")) {
    errors.push({ field: "currency", message: FOREIGN_CURRENCY_MESSAGE });
    amountPaise = null;
  } else if (amountPaise === null || amountPaise <= 0) {
    errors.push({ field: "amount", message: "Amount is missing" });
    amountPaise = null;
  } else if (amountPaise > MAX_AMOUNT_PAISE) {
    errors.push({ field: "amount", message: MAX_AMOUNT_MESSAGE });
    amountPaise = null;
  }
  if (raw.status !== "captured") {
    errors.push({
      field: "externalId",
      message: "The payment is not captured",
    });
  }

  const createdAt = integerOf(raw.created_at);
  const receivedOn = createdAt === null ? null : istDayOf(createdAt);
  if (receivedOn === null) {
    errors.push({ field: "receivedOn", message: "Payment time is missing" });
  }

  const taxPaise = integerOf(raw.tax) ?? 0;
  const feePaise = integerOf(raw.fee) ?? 0;
  let gatewayFeePaise = feePaise - taxPaise;
  if (gatewayFeePaise < 0) {
    warnings.push({
      field: "amount",
      message: "Razorpay's fee is less than its tax; the fee is left at zero",
    });
    gatewayFeePaise = 0;
  }

  let email = (raw.email ?? "").trim().toLowerCase();
  if (email !== "" && !isEmail(email)) {
    warnings.push({ field: "email", message: "Invalid email; left out" });
    email = "";
  }

  let phone = "";
  if (raw.contact) {
    const parsed = parsePhoneNumberFromString(raw.contact, "IN");
    if (parsed?.isValid()) {
      phone = parsed.number;
    } else {
      warnings.push({ field: "phone", message: "Invalid phone; left out" });
    }
  }

  let donorName = notes.name;
  if (donorName === "") {
    donorName = email || phone;
    if (donorName) {
      warnings.push({
        field: "donorName",
        message:
          "No name on the payment; the donor is named after their contact. Edit the donor to fix it",
      });
    } else {
      errors.push({ field: "donorName", message: "Donor name is missing" });
    }
  }

  let idNumber = notes.pan.replaceAll(/\s/g, "").toUpperCase();
  if (idNumber !== "" && !PAN_PATTERN.test(idNumber)) {
    warnings.push({
      field: "idNumber",
      message: "Invalid PAN; the donor is saved without an ID",
    });
    idNumber = "";
  }

  return {
    errors,
    row: {
      addressLine1: notes.address,
      addressLine2: "",
      amountPaise,
      channel: "razorpay",
      channelFromFile: true,
      city: notes.city,
      country: "IN",
      donationType: "voluntary",
      donorName,
      email,
      externalId: id,
      gatewayFeePaise,
      gatewayTaxPaise: taxPaise,
      idNumber,
      idType: idNumber ? "pan" : "none",
      notes: "",
      phone,
      pincode: notes.pincode,
      receivedOn,
      reference: id,
      state: notes.state,
    },
    warnings,
  };
}
