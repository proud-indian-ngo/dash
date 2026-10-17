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
  "donorKind",
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
  "currency",
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
  currency: "Currency",
  donationType: "Donation type",
  donorKind: "Donor type",
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
  currency: ["currency", "donationcurrency", "currencycode"],
  donationType: ["donationtype", "type", "category"],
  donorKind: ["donortype", "donorkind"],
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
 * The columns of a give.do (GiveIndia) donations export, in file order, and
 * the field each fills. Time, the joined address, the subscription columns
 * and marketing tags fill nothing but stay in the stored row.
 */
export const GIVE_DO_COLUMNS: readonly (readonly [
  string,
  ImportMappingTarget,
])[] = [
  ["Date", "receivedOn"],
  ["Time", IGNORE_FIELD],
  ["Transaction ID", "externalId"],
  ["Donation Currency", "currency"],
  ["Donation Amount", "amount"],
  ["Donor Name", "donorName"],
  ["Donor Email", "email"],
  ["Donor Mobile Number", "phone"],
  ["Donor Address Line 1", "addressLine1"],
  ["Donor Address Line 2", "addressLine2"],
  ["Donor City", "city"],
  ["Donor State", "state"],
  ["Donor Country", "country"],
  ["Donor Zipcode / Pincode", "pincode"],
  ["Donor Complete Address", IGNORE_FIELD],
  ["Donor PAN", "idNumber"],
  ["Subscription Type", IGNORE_FIELD],
  ["Parent Donation", IGNORE_FIELD],
  ["tags", IGNORE_FIELD],
];

export const GIVE_DO_HEADERS = GIVE_DO_COLUMNS.map(([header]) => header);

const PRESETS: Partial<
  Record<ImportBatchSource, ReadonlyMap<string, ImportMappingTarget>>
> = {
  give_do_payout: new Map([
    ...GIVE_DO_COLUMNS.map(
      ([header, target]) => [headerKey(header), target] as const
    ),
    [headerKey("Donor Phone"), "phone"],
    [headerKey("Donor Town / State"), "state"],
    [headerKey("UTR"), IGNORE_FIELD],
  ]),
  give_do_csv: new Map(
    GIVE_DO_COLUMNS.map(([header, target]) => [headerKey(header), target])
  ),
};

/**
 * What a source fixes regardless of the mapping step: give.do exports write
 * dates day-first, every row arrived through give.do, and the Donor PAN
 * column holds PANs only.
 */
export interface SourceRules {
  /** The file's columns, so the mapping step can flag missing and extra ones. */
  expectedHeaders: readonly string[] | null;
  fixedChannel: ImportChannel | null;
  fixedDateFormat: ImportDateFormat | null;
  /** ID type for ID numbers when no ID type column is mapped. */
  idType: "pan" | null;
}

export function sourceRules(source: ImportBatchSource): SourceRules {
  if (source === "give_do_csv" || source === "give_do_payout") {
    return {
      expectedHeaders: GIVE_DO_HEADERS,
      fixedChannel: "give_do",
      fixedDateFormat: "dmy",
      idType: "pan",
    };
  }
  return {
    expectedHeaders: null,
    fixedChannel: null,
    fixedDateFormat: null,
    idType: null,
  };
}

/**
 * Expected columns the file lacks, and columns the source does not have,
 * compared as `headerKey` does, so "DONOR PAN" is the Donor PAN column.
 */
export function compareHeaders(
  headers: readonly string[],
  expected: readonly string[]
): { extra: string[]; missing: string[] } {
  const present = new Set(headers.map(headerKey));
  const known = new Set(expected.map(headerKey));
  return {
    extra: headers.filter((h) => !known.has(headerKey(h))),
    missing: expected.filter((h) => !present.has(headerKey(h))),
  };
}

/**
 * Suggest a mapping for a file's headers: a column the source's preset
 * names (compared as `headerKey` does) gets the preset field; otherwise it
 * keeps what the last batch from the same source mapped it to, or is
 * matched by synonym. A currency column is never left out because an
 * earlier batch left it out: that mapping may predate the currency field,
 * and foreign money must not import as rupees. A field is filled at most
 * once; later columns that would repeat it are ignored.
 */
export function suggestMapping(
  headers: readonly string[],
  previous: Readonly<Record<string, string>> | null,
  source: ImportBatchSource = "generic_csv"
): ImportMapping {
  const used = new Set<ImportFieldKey>();
  const mapping: ImportMapping = {};
  const preset = PRESETS[source];
  const isField = (value: string | undefined): value is ImportFieldKey =>
    (IMPORT_FIELD_KEYS as readonly string[]).includes(value ?? "");
  for (const header of headers) {
    const fixed = preset?.get(headerKey(header));
    if (fixed !== undefined && (fixed === IGNORE_FIELD || !used.has(fixed))) {
      if (fixed !== IGNORE_FIELD) {
        used.add(fixed);
      }
      mapping[header] = fixed;
      continue;
    }
    const remembered = previous?.[header];
    if (remembered === IGNORE_FIELD && !isCurrencyHeader(header)) {
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

/** Whether a header names a currency column, such as give.do's "Donation Currency". */
function isCurrencyHeader(header: string): boolean {
  return SYNONYM_INDEX.get(headerKey(header)) === "currency";
}

export interface MappingCheck {
  /** Fields chosen for more than one column. */
  duplicates: ImportFieldKey[];
  missing: ImportFieldKey[];
  /**
   * A currency column the file has while no column fills Currency. Leaving
   * it out would import every row as rupees, foreign gifts included.
   */
  unmappedCurrency: string | null;
  /** True when no external ID is mapped, so dedupe falls back to a fingerprint. */
  weakIdentity: boolean;
}

/** `mapping` holds every column of the file, mapped or left out. */
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
    unmappedCurrency: counts.has("currency")
      ? null
      : (Object.keys(mapping).find(isCurrencyHeader) ?? null),
    weakIdentity: !counts.has("externalId"),
  };
}

/** Why the mapping cannot be reviewed, or null when it can. */
export function mappingProblem(check: MappingCheck): string | null {
  if (check.missing.length > 0 || check.duplicates.length > 0) {
    return "Map donor name, amount and received on, each to one column.";
  }
  if (check.unmappedCurrency) {
    return `Map "${check.unmappedCurrency}" to Currency, so gifts in other currencies are not imported as rupees.`;
  }
  return null;
}

export const DATE_FORMAT_VALUES = ["dmy", "ymd", "mdy"] as const;
export type ImportDateFormat = (typeof DATE_FORMAT_VALUES)[number];

export const DATE_FORMAT_LABELS: Record<ImportDateFormat, string> = {
  dmy: "Day/Month/Year (31/03/2026)",
  mdy: "Month/Day/Year (03/31/2026)",
  ymd: "Year-Month-Day (2026-03-31)",
};

/** Sources the importer offers. */
export const AVAILABLE_IMPORT_SOURCES = [
  "give_do_csv",
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
  bank_csv: "Bank statement (CSV)",
  generic_csv: "Generic CSV",
  give_do_csv: "give.do",
  give_do_payout: "give.do payout",
  razorpay_api: "Razorpay",
};

/** Shown at mapping and review when no external ID column is mapped. */
export const WEAK_IDENTITY_WARNING =
  "No external donation ID or transaction ID column is mapped, so rows are told apart only by date, amount, donor name and reference. Two identical gifts (same donor, date and amount, and no reference) will be treated as one: the second is marked already imported and not added. Map an ID column if the file has one.";

/** Bumped whenever parsing or normalisation changes what a row turns into. */
export const IMPORT_PARSER_VERSION = 3;

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
