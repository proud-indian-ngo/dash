import type {
  ContributionChannel,
  ImportBatchSource,
} from "@pi-dash/shared/constants";

/**
 * The pi-dash fields a file column can fill, with the header spellings that
 * map to each one automatically. Client-safe: the mapping step and the
 * server share it.
 */

export const IMPORT_FIELD_KEYS = [
  "donorName",
  "email",
  "phone",
  "idType",
  "idNumber",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "country",
  "amount",
  "receivedOn",
  "reference",
  "externalId",
  "donationType",
  "channel",
  "notes",
] as const;
export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

/** Mapping value for a column that fills nothing. */
export const IGNORE_FIELD = "ignore";
export type ImportMappingTarget = ImportFieldKey | typeof IGNORE_FIELD;

/** File column header to the field it fills. */
export type ImportMapping = Record<string, ImportMappingTarget>;

export const REQUIRED_IMPORT_FIELDS: readonly ImportFieldKey[] = [
  "donorName",
  "amount",
  "receivedOn",
];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  amount: "Amount (₹)",
  channel: "Channel",
  city: "City",
  country: "Country",
  donationType: "Donation type",
  donorName: "Donor name",
  email: "Email",
  externalId: "External donation ID",
  idNumber: "PAN / ID number",
  idType: "ID type",
  notes: "Notes",
  phone: "Phone",
  pincode: "Pincode",
  receivedOn: "Received on",
  reference: "Reference / transaction ID",
  state: "State",
};

/** Lower-case, alphanumerics only, so "Donor Name", "donor_name" and "DONOR-NAME" compare equal. */
export function headerKey(header: string): string {
  return header.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

const SYNONYMS: Record<ImportFieldKey, readonly string[]> = {
  addressLine1: ["address", "addressline1", "address1", "donoraddress"],
  addressLine2: ["addressline2", "address2"],
  amount: [
    "amount",
    "amountinr",
    "amountrs",
    "donationamount",
    "donatedamount",
    "grossamount",
    "total",
  ],
  channel: ["channel", "mode", "paymentmode", "paymentmethod", "method"],
  city: ["city", "town"],
  country: ["country"],
  donationType: ["donationtype", "type", "category"],
  donorName: [
    "name",
    "donorname",
    "donor",
    "fullname",
    "contributorname",
    "payername",
  ],
  email: ["email", "emailid", "emailaddress", "donoremail", "mail"],
  externalId: ["donationid", "orderid", "paymentid", "externalid", "receiptno"],
  idNumber: ["pan", "pannumber", "panno", "idnumber", "idno"],
  idType: ["idtype", "identitytype"],
  notes: ["notes", "note", "remarks", "comment", "comments", "message"],
  phone: ["phone", "mobile", "phonenumber", "mobilenumber", "contact"],
  pincode: ["pincode", "pin", "postalcode", "zip", "zipcode"],
  receivedOn: [
    "date",
    "receivedon",
    "donationdate",
    "paymentdate",
    "transactiondate",
    "datereceived",
  ],
  reference: [
    "reference",
    "referenceno",
    "utr",
    "transactionid",
    "txnid",
    "rrn",
    "chequeno",
  ],
  state: ["state", "province"],
};

const SYNONYM_INDEX = new Map<string, ImportFieldKey>(
  IMPORT_FIELD_KEYS.flatMap((field) =>
    SYNONYMS[field].map((synonym) => [synonym, field] as const)
  )
);

/**
 * Suggest a mapping for a file's headers: a column keeps what the last batch
 * from the same source mapped it to, otherwise it is matched by synonym. A
 * field is filled at most once; later columns that would repeat it are
 * ignored.
 */
export function suggestMapping(
  headers: readonly string[],
  previous: Readonly<Record<string, string>> | null
): ImportMapping {
  const used = new Set<ImportFieldKey>();
  const mapping: ImportMapping = {};
  const isField = (value: string | undefined): value is ImportFieldKey =>
    (IMPORT_FIELD_KEYS as readonly string[]).includes(value ?? "");
  for (const header of headers) {
    const remembered = previous?.[header];
    if (remembered === IGNORE_FIELD) {
      mapping[header] = IGNORE_FIELD;
      continue;
    }
    const field = isField(remembered)
      ? remembered
      : SYNONYM_INDEX.get(headerKey(header));
    if (field && !used.has(field)) {
      used.add(field);
      mapping[header] = field;
    } else {
      mapping[header] = IGNORE_FIELD;
    }
  }
  return mapping;
}

export interface MappingCheck {
  /** Fields chosen for more than one column. */
  duplicates: ImportFieldKey[];
  missing: ImportFieldKey[];
  /** True when no external ID is mapped, so dedupe falls back to a fingerprint. */
  weakIdentity: boolean;
}

export function checkMapping(mapping: ImportMapping): MappingCheck {
  const counts = new Map<ImportFieldKey, number>();
  for (const target of Object.values(mapping)) {
    if (target !== IGNORE_FIELD) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
  }
  return {
    duplicates: [...counts].filter(([, n]) => n > 1).map(([field]) => field),
    missing: REQUIRED_IMPORT_FIELDS.filter((field) => !counts.has(field)),
    weakIdentity: !counts.has("externalId"),
  };
}

export function isMappingUsable(check: MappingCheck): boolean {
  return check.missing.length === 0 && check.duplicates.length === 0;
}

export const DATE_FORMAT_VALUES = ["dmy", "ymd", "mdy"] as const;
export type ImportDateFormat = (typeof DATE_FORMAT_VALUES)[number];

export const DATE_FORMAT_LABELS: Record<ImportDateFormat, string> = {
  dmy: "Day/Month/Year (31/03/2026)",
  mdy: "Month/Day/Year (03/31/2026)",
  ymd: "Year-Month-Day (2026-03-31)",
};

/** Sources the importer offers today; give.do arrives once its export format is confirmed. */
export const AVAILABLE_IMPORT_SOURCES = [
  "generic_csv",
] as const satisfies readonly ImportBatchSource[];

/** Channels an import can record. In-kind gifts need a description and valuation, so they are entered by hand. */
export const IMPORT_CHANNEL_VALUES = [
  "upi",
  "neft",
  "cheque",
  "cash",
  "razorpay",
  "give_do",
] as const satisfies readonly ContributionChannel[];
export type ImportChannel = (typeof IMPORT_CHANNEL_VALUES)[number];

export const IMPORT_SOURCE_LABELS: Record<ImportBatchSource, string> = {
  generic_csv: "Generic CSV",
  give_do_csv: "give.do",
};

/** Bumped whenever parsing or normalisation changes what a row turns into. */
export const IMPORT_PARSER_VERSION = 1;

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
