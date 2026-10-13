import type {
  ContributionChannel,
  DonationType,
  PartyIdType,
} from "@pi-dash/shared/constants";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  MAX_AMOUNT_MESSAGE,
  MAX_AMOUNT_PAISE,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import z from "zod";

import {
  PAN_PATTERN,
  type SaveDonorInput,
  saveDonorSchema,
} from "@/lib/donor-schema";

import {
  IGNORE_FIELD,
  IMPORT_FIELD_KEYS,
  type ImportDateFormat,
  type ImportFieldKey,
  type ImportMapping,
} from "./fields";

/**
 * Turns one uploaded row into the values a contribution and a donor need,
 * with a message per cell that cannot be used. Pure and client-safe.
 */

export interface CellIssue {
  /** "row" for a problem with the row as a whole, such as broken CSV quoting. */
  field: ImportFieldKey | "row";
  message: string;
}

export interface NormalizedRow {
  addressLine1: string;
  addressLine2: string;
  amountPaise: number | null;
  channel: ContributionChannel;
  /** False when the channel is the batch default rather than a cell of the file. */
  channelFromFile: boolean;
  city: string;
  country: string;
  donationType: DonationType;
  donorName: string;
  email: string;
  externalId: string;
  idNumber: string;
  /** "none" when the row has no usable identifier. */
  idType: PartyIdType;
  notes: string;
  phone: string;
  pincode: string;
  receivedOn: string | null;
  reference: string;
  state: string;
}

export interface NormalizeResult {
  /** Cells that make the row unusable; the row can only be skipped. */
  errors: CellIssue[];
  row: NormalizedRow;
  /** Values that were dropped or defaulted; the row still imports. */
  warnings: CellIssue[];
}

export interface NormalizeOptions {
  dateFormat: ImportDateFormat;
  /** Used when the file has no channel column or the cell is blank. */
  defaultChannel: ContributionChannel;
  /** Today in India; injectable for tests. */
  today?: string;
}

const CURRENCY_PREFIX = /^(?:₹|rs\.?|inr)\s*/i;
const PLAIN_NUMBER = /^\d+(?:\.\d+)?$/;
// 1,00,000.00 (Indian) or 100,000.00 (international) grouping.
const INDIAN_GROUPED = /^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/;
const INTERNATIONAL_GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/** Rupees as written in a spreadsheet ("₹ 1,00,000.50") to paise. */
export function parseAmount(
  text: string
): { error: string } | { paise: number } {
  const cleaned = text
    .replaceAll(" ", " ")
    .trim()
    .replace(CURRENCY_PREFIX, "")
    .replaceAll(" ", "");
  if (cleaned === "") {
    return { error: "Amount is missing" };
  }
  if (cleaned.startsWith("-")) {
    return { error: "Amount must be more than zero" };
  }
  const grouped =
    INDIAN_GROUPED.test(cleaned) || INTERNATIONAL_GROUPED.test(cleaned);
  if (!(grouped || PLAIN_NUMBER.test(cleaned))) {
    return { error: `"${text}" is not an amount` };
  }
  const paise = tryRupeesToPaise(cleaned.replaceAll(",", ""));
  if (paise === null) {
    return { error: "Amount can have at most 2 decimals" };
  }
  if (paise <= 0) {
    return { error: "Amount must be more than zero" };
  }
  if (paise > MAX_AMOUNT_PAISE) {
    return { error: MAX_AMOUNT_MESSAGE };
  }
  return { paise };
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
// "12-Oct-2026", "12 October 2026"
const DAY_MONTH_NAME = /^(\d{1,2})[-\s/]([a-z]{3,9})\.?[-\s/,]+(\d{4})$/i;
// "Oct 12, 2026"
const MONTH_NAME_DAY = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i;
const NUMERIC_DATE = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/;
// A trailing time ("12/10/2026 14:30", "2026-10-12T09:00:00Z") is ignored.
const TIME_SUFFIX = /(?:[T\s]\d{1,2}:\d{2}.*)$/;

function monthFromName(name: string): number | null {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
}

function isoIfValid(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A date cell to yyyy-MM-dd. Year-first and month-name dates are read as
 * written; other numeric dates follow the format chosen at mapping, so
 * 03/04/2026 is never guessed. Two-digit years are refused.
 */
export function parseDate(
  text: string,
  format: ImportDateFormat
): { error: string } | { iso: string } {
  const value = text.trim().replace(TIME_SUFFIX, "");
  if (value === "") {
    return { error: "Date is missing" };
  }
  const invalid = { error: `"${text}" is not a date` };
  let parts: [number, number, number] | null = null;
  const named = DAY_MONTH_NAME.exec(value);
  const monthFirst = MONTH_NAME_DAY.exec(value);
  const numeric = NUMERIC_DATE.exec(value);
  if (named) {
    const month = monthFromName(named[2] ?? "");
    parts = month ? [Number(named[3]), month, Number(named[1])] : null;
  } else if (monthFirst) {
    const month = monthFromName(monthFirst[1] ?? "");
    parts = month
      ? [Number(monthFirst[3]), month, Number(monthFirst[2])]
      : null;
  } else if (numeric) {
    const [, a = "", b = "", c = ""] = numeric;
    if (a.length === 4) {
      parts = [Number(a), Number(b), Number(c)];
    } else if (c.length === 4) {
      if (format === "ymd") {
        return {
          error: `"${text}" is not Year-Month-Day; check the date format`,
        };
      }
      parts =
        format === "mdy"
          ? [Number(c), Number(a), Number(b)]
          : [Number(c), Number(b), Number(a)];
    } else {
      return { error: `"${text}" needs a four-digit year` };
    }
  }
  if (!parts) {
    return invalid;
  }
  const iso = isoIfValid(...parts);
  return iso ? { iso } : invalid;
}

const PAN_ALIASES = ["pan", "pancard", "permanentaccountnumber"];
const ID_TYPE_ALIASES: Record<string, PartyIdType> = {
  dl: "driving_licence",
  drivinglicence: "driving_licence",
  drivinglicense: "driving_licence",
  epic: "voter_id",
  foreigntaxid: "tax_id_foreign",
  none: "none",
  passport: "passport",
  rationcard: "ration_card",
  taxid: "tax_id_foreign",
  tin: "tax_id_foreign",
  voterid: "voter_id",
  ...Object.fromEntries(PAN_ALIASES.map((alias) => [alias, "pan" as const])),
};

const DONATION_TYPE_ALIASES: Record<string, DonationType> = {
  corpus: "corpus",
  csr: "csr",
  donation: "voluntary",
  general: "voluntary",
  grant: "specific_grant",
  specificgrant: "specific_grant",
  voluntary: "voluntary",
};

const CHANNEL_ALIASES: Record<string, ContributionChannel> = {
  bank: "neft",
  banktransfer: "neft",
  cash: "cash",
  check: "cheque",
  cheque: "cheque",
  dd: "cheque",
  demanddraft: "cheque",
  givedo: "give_do",
  imps: "neft",
  neft: "neft",
  netbanking: "neft",
  razorpay: "razorpay",
  rtgs: "neft",
  upi: "upi",
};

const COUNTRY_ALIASES: Record<string, string> = {
  america: "US",
  australia: "AU",
  bharat: "IN",
  canada: "CA",
  greatbritain: "GB",
  india: "IN",
  ind: "IN",
  singapore: "SG",
  uae: "AE",
  uk: "GB",
  unitedarabemirates: "AE",
  unitedkingdom: "GB",
  unitedstates: "US",
  unitedstatesofamerica: "US",
  usa: "US",
};

const key = (value: string) => value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
const collapse = (value: string) => value.replaceAll(/\s+/g, " ").trim();
const isEmail = (value: string) => z.email().safeParse(value).success;

/** Field values by target, read through the mapping. */
function pick(
  raw: Readonly<Record<string, string>>,
  mapping: ImportMapping
): Partial<Record<ImportFieldKey, string>> {
  const values: Partial<Record<ImportFieldKey, string>> = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (target !== IGNORE_FIELD) {
      values[target] = collapse(raw[header] ?? "");
    }
  }
  return values;
}

const LIMITS: Partial<Record<ImportFieldKey, number>> = {
  addressLine1: 200,
  addressLine2: 200,
  city: 80,
  donorName: 160,
  externalId: 200,
  idNumber: 40,
  notes: 1000,
  pincode: 12,
  reference: 120,
  state: 80,
};

function resolveIdentifier(
  typeText: string,
  numberText: string,
  warnings: CellIssue[]
): { idNumber: string; idType: PartyIdType } {
  const none = { idNumber: "", idType: "none" as const };
  const idNumber = numberText.replaceAll(/\s/g, "").toUpperCase();
  if (idNumber === "") {
    return none;
  }
  let idType: PartyIdType | undefined;
  if (typeText === "") {
    idType = PAN_PATTERN.test(idNumber) ? "pan" : undefined;
    if (!idType) {
      warnings.push({
        field: "idNumber",
        message:
          "Not a valid PAN and no ID type given; the donor is saved without an ID",
      });
      return none;
    }
  } else {
    idType = ID_TYPE_ALIASES[key(typeText)];
    if (!idType || idType === "none") {
      warnings.push({
        field: "idType",
        message: `Unknown ID type "${typeText}"; the donor is saved without an ID`,
      });
      return none;
    }
  }
  if (idType === "pan" && !PAN_PATTERN.test(idNumber)) {
    warnings.push({
      field: "idNumber",
      message: "Invalid PAN; the donor is saved without an ID",
    });
    return none;
  }
  return { idNumber, idType };
}

export function normalizeRow(
  raw: Readonly<Record<string, string>>,
  mapping: ImportMapping,
  options: NormalizeOptions
): NormalizeResult {
  const values = pick(raw, mapping);
  const get = (field: ImportFieldKey) => values[field] ?? "";
  const errors: CellIssue[] = [];
  const warnings: CellIssue[] = [];

  for (const [field, max] of Object.entries(LIMITS) as [
    ImportFieldKey,
    number,
  ][]) {
    if (get(field).length > max) {
      errors.push({ field, message: `Longer than ${max} characters` });
    }
  }

  const donorName = get("donorName");
  if (donorName === "") {
    errors.push({ field: "donorName", message: "Donor name is missing" });
  }

  let amountPaise: number | null = null;
  const amount = parseAmount(get("amount"));
  if ("error" in amount) {
    errors.push({ field: "amount", message: amount.error });
  } else {
    amountPaise = amount.paise;
  }

  let receivedOn: string | null = null;
  const date = parseDate(get("receivedOn"), options.dateFormat);
  if ("error" in date) {
    errors.push({ field: "receivedOn", message: date.error });
  } else if (date.iso > (options.today ?? todayInKolkata())) {
    errors.push({ field: "receivedOn", message: "Date is in the future" });
  } else {
    receivedOn = date.iso;
  }

  let donationType: DonationType = "voluntary";
  if (get("donationType") !== "") {
    const mapped = DONATION_TYPE_ALIASES[key(get("donationType"))];
    if (mapped) {
      donationType = mapped;
    } else {
      errors.push({
        field: "donationType",
        message: `Unknown donation type "${get("donationType")}"; use voluntary, corpus, specific grant or CSR`,
      });
    }
  }

  let channel = options.defaultChannel;
  let channelFromFile = false;
  if (get("channel") !== "") {
    const mapped = CHANNEL_ALIASES[key(get("channel"))];
    if (mapped) {
      channel = mapped;
      channelFromFile = true;
    } else {
      errors.push({
        field: "channel",
        message: `Unknown channel "${get("channel")}"; use UPI, NEFT, cheque, cash, Razorpay or give.do`,
      });
    }
  }

  let email = get("email").toLowerCase();
  if (email !== "" && !isEmail(email)) {
    warnings.push({ field: "email", message: "Invalid email; left out" });
    email = "";
  }

  let phone = "";
  if (get("phone") !== "") {
    const parsed = parsePhoneNumberFromString(get("phone"), "IN");
    if (parsed?.isValid()) {
      phone = parsed.number;
    } else {
      warnings.push({ field: "phone", message: "Invalid phone; left out" });
    }
  }

  let country = "IN";
  const countryText = get("country");
  if (countryText !== "") {
    const alias = COUNTRY_ALIASES[key(countryText)];
    if (alias) {
      country = alias;
    } else if (/^[a-z]{2}$/i.test(countryText)) {
      country = countryText.toUpperCase();
    } else {
      errors.push({
        field: "country",
        message: `Unknown country "${countryText}"; use a two-letter code such as IN`,
      });
    }
  }

  const identifier = resolveIdentifier(
    get("idType"),
    get("idNumber"),
    warnings
  );

  const row: NormalizedRow = {
    addressLine1: get("addressLine1"),
    addressLine2: get("addressLine2"),
    amountPaise,
    channel,
    channelFromFile,
    city: get("city"),
    country,
    donationType,
    donorName,
    email,
    externalId: get("externalId"),
    idNumber: identifier.idNumber,
    idType: identifier.idType,
    notes: get("notes"),
    phone,
    pincode: get("pincode"),
    receivedOn,
    reference: get("reference"),
    state: get("state"),
  };
  if (errors.length === 0) {
    errors.push(...donorIssues(row));
  }
  return { errors, row, warnings };
}

/** Donor form fields that differ in name from the import field they come from. */
const DONOR_FIELD_TO_IMPORT: Partial<Record<string, ImportFieldKey>> = {
  displayName: "donorName",
};

/**
 * The donor a row would create, as the donor form would submit it. `withId`
 * is false when identifiers cannot be stored here (no encryption key).
 */
export function donorSaveInput(
  row: NormalizedRow,
  options: { id: string; withId: boolean }
): SaveDonorInput {
  const withId = options.withId && row.idType !== "none";
  return {
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    assessmentNote: "",
    city: row.city,
    country: row.country,
    displayName: row.donorName,
    email: row.email,
    expectedPartyUpdatedAt: null,
    expectedUpdatedAt: null,
    foreignSourceAssessment: row.country === "IN" ? "domestic" : "pending",
    id: options.id,
    idNumber: withId ? row.idNumber : "",
    idType: withId ? row.idType : "none",
    kind: "person",
    legalName: "",
    mode: "create",
    nationality: "",
    phone: row.phone,
    pincode: row.pincode,
    roles: ["donor"],
    state: row.state,
  };
}

const PLACEHOLDER_ID = "00000000-0000-7000-8000-000000000000";

/**
 * Runs the donor form's rules on the donor a row would create, so a row
 * shown as importable cannot fail when the donor is saved.
 */
function donorIssues(row: NormalizedRow): CellIssue[] {
  const parsed = saveDonorSchema.safeParse(
    donorSaveInput(row, { id: PLACEHOLDER_ID, withId: true })
  );
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "");
    const field =
      DONOR_FIELD_TO_IMPORT[name] ??
      ((IMPORT_FIELD_KEYS as readonly string[]).includes(name)
        ? (name as ImportFieldKey)
        : "row");
    return { field, message: `Not accepted for a donor: ${issue.message}` };
  });
}

/** Last four characters for display; nothing for short values. */
export function maskIdentifier(idNumber: string): string | null {
  return idNumber.length >= 8 ? `••••${idNumber.slice(-4)}` : null;
}

// A PAN anywhere in a value, also with spaces inside or in lower case.
const PAN_ANYWHERE = /[a-z]{5}\s*\d{4}\s*[a-z]/gi;

/** Masks every PAN-shaped run in `text` to its last four characters. */
export function maskPans(text: string): string {
  return text.replace(
    PAN_ANYWHERE,
    (pan) => maskIdentifier(pan.replaceAll(/\s/g, "").toUpperCase()) ?? "••••"
  );
}
