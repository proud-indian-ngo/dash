/**
 * The donations return: Form 113 under the Income-tax Act 2025 and the
 * Income-tax Rules 2026 (Rule 190(2)), which replaces Form 10BD. One place
 * holds which gifts go in it, what blocks a gift, and the upload file's
 * columns and codes, so a correction to the portal's template is made here
 * once. Used by the readiness page, the "Missing donor details" stat and the
 * export alike.
 *
 * UNVERIFIED: the official Form 113 template could not be read when this was
 * written. The columns, their order and the code lists below follow the
 * portal's Form 10BD template as best known. Check them against the portal's
 * current template before every upload.
 */
import type {
  ContributionChannel,
  ContributionReportingMode,
  DeductionEligible,
  DonationType,
  PartyIdType,
} from "./constants";
import {
  countsAsReceived,
  type FinancialYearRange,
  financialYearOf,
  PLATFORM_INTERMEDIARY_PARTY_IDS,
  todayInKolkata,
} from "./income";
import { paiseToRupees, sumPaise } from "./money";

export const RETURN_FORM_NAME = "Form 113 (formerly 10BD)";

/**
 * Gifts received before this day were receipted and filed outside pi-dash,
 * so they are never part of a pi-dash return. The first return pi-dash
 * prepares is for FY 2026-27.
 */
export const FIRST_RETURN_DAY = "2026-04-01";

/** The return for a financial year is due by 31 May after it ends. */
export function returnDueOn(fy: FinancialYearRange): string {
  return `${fy.endsOn.slice(0, 4)}-05-31`;
}

/** Financial years a return can be prepared for: FY 2026-27 up to the running one. */
export function returnYears(
  today: string = todayInKolkata()
): FinancialYearRange[] {
  const years: FinancialYearRange[] = [];
  const current = financialYearOf(
    today < FIRST_RETURN_DAY ? FIRST_RETURN_DAY : today
  );
  let fy = financialYearOf(FIRST_RETURN_DAY);
  while (fy.startsOn <= current.startsOn) {
    years.push(fy);
    fy = financialYearOf(`${Number(fy.startsOn.slice(0, 4)) + 1}-04-01`);
  }
  return years;
}

/** The year whose return is next due: the earliest whose due date is still ahead. */
export function defaultReturnYear(
  today: string = todayInKolkata()
): FinancialYearRange {
  const years = returnYears(today);
  return (
    years.find((fy) => returnDueOn(fy) >= today) ??
    (years.at(-1) as FinancialYearRange)
  );
}

/** A year label ("2026-27") a return can be prepared for, or null. */
export function parseReturnYear(
  label: string,
  today: string = todayInKolkata()
): FinancialYearRange | null {
  return returnYears(today).find((fy) => fy.label === label) ?? null;
}

// ── Inclusion rules ─────────────────────────────────────────────────────────

/**
 * UNVERIFIED for the 2025 Act: a cash gift above ₹2,000 earns no deduction
 * (section 80G(5D) of the 1961 Act), so it stays out of the return. Confirm
 * the limit with the CA.
 */
export const CASH_DEDUCTION_LIMIT_PAISE = 200_000;

/** Why a received gift is left out of the return. */
export const returnExclusionValues = [
  "before_first_return",
  "fully_refunded",
  "reversed",
  "foreign_currency",
  "in_kind",
  "cash_over_limit",
  "gift_excluded",
  "donor_declined",
] as const;
export type ReturnExclusion = (typeof returnExclusionValues)[number];

export const RETURN_EXCLUSION_LABELS: Record<ReturnExclusion, string> = {
  before_first_return: "Before 1 April 2026 (filed outside the dashboard)",
  cash_over_limit: "Cash above ₹2,000 (not deductible; limit to be confirmed)",
  donor_declined: "Donor doesn't want a tax certificate",
  foreign_currency: "Foreign currency (FCRA is not activated)",
  fully_refunded: "Fully refunded",
  gift_excluded: "Gift excluded",
  in_kind: "In kind (not deductible under 80G; CA to confirm)",
  reversed: "Reversed",
};

/** What keeps a gift that belongs in the return out of the upload file. */
export const returnBlockValues = [
  "intermediary_as_donor",
  "missing_name",
  "missing_address",
  "missing_id",
  "invalid_id",
] as const;
export type ReturnBlock = (typeof returnBlockValues)[number];

export const RETURN_BLOCK_LABELS: Record<ReturnBlock, string> = {
  intermediary_as_donor: "Donation platform recorded as the donor",
  invalid_id: "ID number doesn't look valid",
  missing_address: "No address with PIN code",
  missing_id: "No ID number",
  missing_name: "No name",
};

/** The tax certificate choice on a gift, stored in `deduction_eligible`. */
export const TAX_CERTIFICATE_LABELS: Record<DeductionEligible, string> = {
  no: "Exclude",
  unknown: "Follow donor",
  yes: "Include",
};

/** Common reasons for excluding a gift; any short text is accepted too. */
export const ELIGIBILITY_REASON_PRESETS = [
  "Donor declined",
  "Not a donation",
] as const;

export const ELIGIBILITY_REASON_MAX = 120;

/**
 * What the return needs to know about a donor. Never carries the ID number
 * itself. `hasAddress` means address line 1 and a PIN code (`hasReturnAddress`).
 */
export interface ReturnDonorFacts {
  hasAddress: boolean;
  hasIdNumber: boolean;
  hasName: boolean;
  idType: PartyIdType;
  /**
   * False when a stored ID fails its format check or cannot be decrypted;
   * null when not checked (no encryption key, or not asked for).
   */
  idValid: boolean | null;
  partyId: string;
  taxCertificateOptOut: boolean;
}

/** What the return needs to know about a gift. */
export interface ReturnGiftFacts {
  amountPaise: number;
  channel: ContributionChannel;
  currency: string;
  deductionEligible: DeductionEligible;
  donationType: DonationType;
  id: string;
  partyId: string;
  /** yyyy-MM-dd. */
  receivedOn: string;
  refundedPaise: number;
  reportingMode: ContributionReportingMode;
  status: string;
}

export type GiftOutcome =
  | { kind: "waiting" }
  | { kind: "excluded"; reason: ReturnExclusion }
  | { kind: "ready" }
  | { blocks: ReturnBlock[]; kind: "blocked" }
  /** In a recorded filing; its row is frozen, whatever the gift says now. */
  | { filingSequence: number; kind: "filed" };

/**
 * An address the return accepts: the first line and a PIN code. The state is
 * optional because the Razorpay page does not ask for it. Used by the
 * readiness page, the Income stat and the import alike.
 */
export function hasReturnAddress(details: {
  addressLine1?: string | null;
  pincode?: string | null;
}): boolean {
  return Boolean(details.addressLine1?.trim() && details.pincode?.trim());
}

/**
 * The mode a gift is reported under: a cash or in-kind channel decides it
 * even when the stored mode says otherwise, so neither the ₹2,000 cash
 * limit nor the in-kind exclusion can be dodged by the mode alone.
 */
export function effectiveReportingMode(gift: {
  channel: ContributionChannel;
  reportingMode: ContributionReportingMode;
}): ContributionReportingMode {
  if (gift.channel === "in_kind") {
    return "in_kind";
  }
  if (gift.channel === "cash") {
    return "cash";
  }
  return gift.reportingMode;
}

/** Whether a party is a donation platform (GiveIndia) rather than a giver. */
export function isPlatformIntermediary(partyId: string): boolean {
  return PLATFORM_INTERMEDIARY_PARTY_IDS.includes(partyId);
}

/** Name and address matter for every received gift, in the return or not (section 115BBC). */
export function donorDetailBlocks(
  donor: ReturnDonorFacts | undefined
): ReturnBlock[] {
  const blocks: ReturnBlock[] = [];
  if (!donor?.hasName) {
    blocks.push("missing_name");
  }
  if (!donor?.hasAddress) {
    blocks.push("missing_address");
  }
  return blocks;
}

/** Everything that keeps a gift in the return out of the upload file. */
export function returnBlocks(
  donor: ReturnDonorFacts | undefined
): ReturnBlock[] {
  const blocks = donorDetailBlocks(donor);
  if (!(donor && donor.idType !== "none" && donor.hasIdNumber)) {
    blocks.push("missing_id");
  } else if (donor.idValid === false) {
    blocks.push("invalid_id");
  }
  return blocks;
}

/** Received money still with the trust: the amount less refunds, never below zero. */
export function netGiftPaise(gift: ReturnGiftFacts): number {
  return Math.max(0, gift.amountPaise - gift.refundedPaise);
}

/**
 * Where a gift stands for the return. Order matters: money not received is
 * waiting; refunds, reversals and the law's exclusions (foreign currency,
 * in kind, cash above the limit) come before the tax certificate choice;
 * the gift's own choice (Include or Exclude) beats the donor's opt-out.
 */
export function classifyGift(
  gift: ReturnGiftFacts,
  donor: ReturnDonorFacts | undefined
): GiftOutcome {
  if (gift.receivedOn < FIRST_RETURN_DAY) {
    return { kind: "excluded", reason: "before_first_return" };
  }
  if (gift.status === "pending") {
    return { kind: "waiting" };
  }
  if (gift.status === "reversed") {
    return { kind: "excluded", reason: "reversed" };
  }
  if (!countsAsReceived(gift.status) || netGiftPaise(gift) <= 0) {
    return { kind: "excluded", reason: "fully_refunded" };
  }
  if (gift.currency.trim().toUpperCase() !== "INR") {
    return { kind: "excluded", reason: "foreign_currency" };
  }
  const mode = effectiveReportingMode(gift);
  if (mode === "in_kind") {
    return { kind: "excluded", reason: "in_kind" };
  }
  if (mode === "cash" && gift.amountPaise > CASH_DEDUCTION_LIMIT_PAISE) {
    return { kind: "excluded", reason: "cash_over_limit" };
  }
  if (gift.deductionEligible === "no") {
    return { kind: "excluded", reason: "gift_excluded" };
  }
  if (gift.deductionEligible === "unknown" && donor?.taxCertificateOptOut) {
    return { kind: "excluded", reason: "donor_declined" };
  }
  // GiveIndia passes gifts on; the real donor must be recorded instead.
  if (isPlatformIntermediary(gift.partyId)) {
    return { blocks: ["intermediary_as_donor"], kind: "blocked" };
  }
  const blocks = returnBlocks(donor);
  return blocks.length > 0 ? { blocks, kind: "blocked" } : { kind: "ready" };
}

export interface AssessedGift {
  id: string;
  /** Name or address missing, whatever the outcome; matters even when the gift is excluded. */
  missingDonorDetails: boolean;
  netPaise: number;
  outcome: GiftOutcome;
  partyId: string;
  refundedPaise: number;
}

export interface ReturnSummary {
  blockedCount: number;
  blockedPaise: number;
  /** Donors with at least one gift in the return. */
  donorCount: number;
  excludedCount: number;
  excludedPaise: number;
  /** Gifts already in a recorded filing. */
  filedCount: number;
  filedPaise: number;
  /** Gifts in the return: filed, ready and blocked. */
  inReturnCount: number;
  inReturnPaise: number;
  readyCount: number;
  readyPaise: number;
  waitingCount: number;
}

const isInReturn = (outcome: GiftOutcome) =>
  outcome.kind === "ready" ||
  outcome.kind === "blocked" ||
  outcome.kind === "filed";

/** A gift in a live filing: the filing's number and the net amount it filed. */
export interface FiledGift {
  amountPaise: number;
  filingSequence: number;
}

/**
 * Classifies every gift of a year and totals the result. A gift in a live
 * filing (`filedGifts`, by gift ID) is "filed" at the amount it was filed at,
 * whatever it looks like now, so a later filing never repeats it.
 */
export function assessReturn(
  gifts: readonly ReturnGiftFacts[],
  donors: ReadonlyMap<string, ReturnDonorFacts>,
  filedGifts: ReadonlyMap<string, FiledGift> = new Map()
): { gifts: AssessedGift[]; summary: ReturnSummary } {
  const assessed = gifts.map((gift): AssessedGift => {
    const donor = donors.get(gift.partyId);
    const filing = filedGifts.get(gift.id);
    const outcome: GiftOutcome = filing
      ? { filingSequence: filing.filingSequence, kind: "filed" }
      : classifyGift(gift, donor);
    const received =
      outcome.kind !== "waiting" &&
      !(
        outcome.kind === "excluded" &&
        (outcome.reason === "before_first_return" ||
          outcome.reason === "fully_refunded" ||
          outcome.reason === "reversed")
      );
    return {
      id: gift.id,
      missingDonorDetails:
        received &&
        !isPlatformIntermediary(gift.partyId) &&
        donorDetailBlocks(donor).length > 0,
      netPaise: filing
        ? filing.amountPaise
        : outcome.kind === "waiting"
          ? 0
          : netGiftPaise(gift),
      outcome,
      partyId: gift.partyId,
      refundedPaise: gift.refundedPaise,
    };
  });
  const sum = (kind: GiftOutcome["kind"] | "in_return") => {
    const picked = assessed.filter((gift) =>
      kind === "in_return"
        ? isInReturn(gift.outcome)
        : gift.outcome.kind === kind
    );
    return {
      count: picked.length,
      paise: sumPaise(picked.map((gift) => gift.netPaise)),
    };
  };
  const ready = sum("ready");
  const blocked = sum("blocked");
  const excluded = sum("excluded");
  const filed = sum("filed");
  const inReturn = sum("in_return");
  return {
    gifts: assessed,
    summary: {
      blockedCount: blocked.count,
      blockedPaise: blocked.paise,
      donorCount: new Set(
        assessed
          .filter((gift) => isInReturn(gift.outcome))
          .map((gift) => gift.partyId)
      ).size,
      excludedCount: excluded.count,
      excludedPaise: excluded.paise,
      filedCount: filed.count,
      filedPaise: filed.paise,
      inReturnCount: inReturn.count,
      inReturnPaise: inReturn.paise,
      readyCount: ready.count,
      readyPaise: ready.paise,
      waitingCount: sum("waiting").count,
    },
  };
}

/**
 * "Missing donor details" on the Income page: donors with a gift in the
 * return that lack an ID number, and every donor with a received gift who
 * lacks a name or address, opted out or not.
 */
export function missingDonorDetailsPartyIds(
  gifts: readonly AssessedGift[]
): string[] {
  const ids = new Set<string>();
  for (const gift of gifts) {
    const missingId =
      gift.outcome.kind === "blocked" &&
      gift.outcome.blocks.includes("missing_id");
    if (missingId || gift.missingDonorDetails) {
      ids.add(gift.partyId);
    }
  }
  return [...ids];
}

// ── ID numbers ──────────────────────────────────────────────────────────────

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GENERIC_ID_PATTERN = /^[A-Z0-9]{5,20}$/;

/** An ID number as checked and exported: upper case, no spaces, hyphens or slashes. */
export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[\s/-]/g, "");
}

/**
 * A format check on a decrypted ID number, run on the server only. PAN has a
 * fixed shape; the other documents vary, so they only need 5 to 20 letters
 * or digits once spaces, hyphens and slashes are taken out.
 */
export function idNumberLooksValid(
  idType: PartyIdType,
  value: string
): boolean {
  const compact = normalizeIdNumber(value);
  if (idType === "none") {
    return false;
  }
  if (idType === "pan") {
    return PAN_PATTERN.test(compact);
  }
  return GENERIC_ID_PATTERN.test(compact);
}

// ── Upload file (verify against the portal's template) ──────────────────────

/**
 * ID Code drop-down (column C), as full text: the portal's Form 10BE for
 * FY 2025-26 shows "Permanent Account Number". "Aadhaar Number" is listed
 * by the portal but pi-dash stores no Aadhaar numbers, so no ID type maps
 * to it.
 */
export const RETURN_ID_CODES = {
  aadhaar: "Aadhaar Number",
  driving_licence: "Driving License number",
  pan: "Permanent Account Number",
  passport: "Passport number",
  ration_card: "Ration card number",
  tax_id_foreign: "Tax Identification Number",
  voter_id: "Elector's photo identity number",
} as const;

export function returnIdCode(idType: PartyIdType): string | null {
  return idType === "none" ? null : RETURN_ID_CODES[idType];
}

/** The Donation Type drop-down's values (column J). */
export const RETURN_DONATION_TYPE_VALUES = [
  "Corpus",
  "Specific grant",
  "Others",
] as const;
export type ReturnDonationTypeCode =
  (typeof RETURN_DONATION_TYPE_VALUES)[number];

/**
 * The code for ordinary (voluntary) gifts: "Specific grant", as the trust
 * filed every donation for FY 2025-26 (give.do and direct transfers;
 * founder, 14 October 2026). One constant to change if the CA advises
 * otherwise.
 */
export const VOLUNTARY_DONATION_TYPE_CODE: ReturnDonationTypeCode =
  "Specific grant";

/**
 * The code for CSR gifts: "Specific grant", as a company's CSR gift was
 * filed for FY 2025-26. Whether CSR gifts belong in the return at all is
 * for the CA (the readiness page lists them).
 */
export const CSR_DONATION_TYPE_CODE: ReturnDonationTypeCode = "Specific grant";

/**
 * Donation Type per our donation type. "Others" is kept for gifts marked
 * "other" (with a description); nothing ordinary maps to it.
 */
export const RETURN_DONATION_TYPE_CODES: Record<
  DonationType,
  ReturnDonationTypeCode
> = {
  corpus: "Corpus",
  csr: CSR_DONATION_TYPE_CODE,
  other: "Others",
  specific_grant: "Specific grant",
  voluntary: VOLUNTARY_DONATION_TYPE_CODE,
};

/** Mode of receipt drop-down (column K). */
export const RETURN_MODE_CODES: Record<ContributionReportingMode, string> = {
  cash: "Cash",
  electronic_or_account_payee:
    "Electronic modes including account payee cheque/draft",
  in_kind: "Kind",
  other: "Others",
};

/** Amounts in rupees with two decimals; set to 0 if the template wants whole rupees. */
export const RETURN_AMOUNT_DECIMALS: 0 | 2 = 2;

export function formatReturnAmount(paise: number): string {
  if (RETURN_AMOUNT_DECIMALS === 0) {
    return String(Math.round(paise / 100));
  }
  return paiseToRupees(paise);
}

/** The organisation's 80G details, kept in app_config. */
export interface ReturnRegistration {
  sectionCode: string;
  /** yyyy-MM-dd. */
  urnIssuedOn: string;
  urn: string;
}

export const RETURN_REGISTRATION_CONFIG_KEY = "donations_return_registration";
/** The 2025 Act renumbers sections, so the label stays editable. */
export const DEFAULT_SECTION_CODE = "Section 80G";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Longest URN or section code accepted. */
export const RETURN_REGISTRATION_MAX = 60;

/** Reads the stored settings; null when missing or malformed. */
export function parseReturnRegistration(
  value: string | null | undefined
): ReturnRegistration | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<ReturnRegistration>;
    const urn = typeof parsed.urn === "string" ? parsed.urn.trim() : "";
    const urnIssuedOn =
      typeof parsed.urnIssuedOn === "string" ? parsed.urnIssuedOn : "";
    const sectionCode =
      typeof parsed.sectionCode === "string" ? parsed.sectionCode.trim() : "";
    if (
      !(urn && ISO_DAY.test(urnIssuedOn) && sectionCode) ||
      urn.length > RETURN_REGISTRATION_MAX ||
      sectionCode.length > RETURN_REGISTRATION_MAX
    ) {
      return null;
    }
    return { sectionCode, urn, urnIssuedOn };
  } catch {
    return null;
  }
}

export function serializeReturnRegistration(value: ReturnRegistration): string {
  return JSON.stringify({
    sectionCode: value.sectionCode.trim(),
    urn: value.urn.trim(),
    urnIssuedOn: value.urnIssuedOn,
  });
}

/** Column order of the upload file. Each value comes from one key of the row. */
export const RETURN_COLUMNS = [
  { header: "Sr. No.", key: "srNo" },
  { header: "Pre Acknowledgement Number", key: "preAcknowledgementNumber" },
  { header: "ID Code", key: "idCode" },
  { header: "Unique Identification Number", key: "idNumber" },
  { header: "Section Code", key: "sectionCode" },
  { header: "Unique Registration Number (URN)", key: "urn" },
  {
    header: "Date of Issuance of Unique Registration Number",
    key: "urnIssuedOn",
  },
  { header: "Name of donor", key: "name" },
  { header: "Address of donor", key: "address" },
  { header: "Donation Type", key: "donationType" },
  { header: "Mode of receipt", key: "mode" },
  { header: "Amount of donation (Indian Rupees)", key: "amount" },
] as const;

export type ReturnColumnKey = (typeof RETURN_COLUMNS)[number]["key"];

/** The URN's issue date as the template shows dates (dd-MM-yyyy). */
export function formatReturnDate(isoDay: string): string {
  const [year, month, day] = isoDay.split("-");
  return `${day}-${month}-${year}`;
}

/** Country names the address ends with; the portal's certificate writes "India". */
const COUNTRY_NAMES: Record<string, string> = { IN: "India" };

/** A country code as the address shows it ("IN" is "India"). */
export function returnCountryName(code: string | null | undefined): string {
  const value = (code ?? "").trim().toUpperCase();
  return COUNTRY_NAMES[value] ?? value;
}

/**
 * Address parts joined with ", ", line breaks become spaces. The donor's
 * address is built as lines, city, state, country, PIN code, matching the
 * portal's certificate ("…, Karnataka, India, 560001").
 */
export function joinReturnAddress(
  parts: readonly (string | null | undefined)[]
): string {
  return parts
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter((part) => part !== "")
    .join(", ");
}

/** A ready gift with what the upload file needs about its donor (server only). */
export interface ReturnExportGift {
  address: string;
  channel: ContributionChannel;
  donationType: DonationType;
  giftId: string;
  idNumber: string;
  idType: PartyIdType;
  name: string;
  netPaise: number;
  partyId: string;
  reportingMode: ContributionReportingMode;
}

export interface ReturnExportRow {
  address: string;
  amountPaise: number;
  donationTypeCode: string;
  /** The gifts the row adds up, in the order they were added. */
  giftIds: string[];
  idCode: string;
  idNumber: string;
  modeCode: string;
  name: string;
  partyId: string;
}

/**
 * One row per donor, donation type code and mode of receipt code. Cash
 * gifts are never added together: the ₹2,000 limit applies to each
 * donation, so each cash gift is its own row.
 */
export function returnRowKey(gift: {
  channel: ContributionChannel;
  donationType: DonationType;
  id: string;
  partyId: string;
  reportingMode: ContributionReportingMode;
}): string {
  const mode = effectiveReportingMode(gift);
  return [
    gift.partyId,
    RETURN_DONATION_TYPE_CODES[gift.donationType],
    RETURN_MODE_CODES[mode],
    ...(mode === "cash" ? [gift.id] : []),
  ].join("|");
}

/** Aggregates ready gifts into upload rows, ordered by donor name. */
export function aggregateReturnRows(
  gifts: readonly ReturnExportGift[]
): ReturnExportRow[] {
  const rows = new Map<string, ReturnExportRow>();
  for (const gift of gifts) {
    const idCode = returnIdCode(gift.idType);
    if (!idCode) {
      throw new Error("A gift without an ID type cannot be exported");
    }
    const key = returnRowKey({ ...gift, id: gift.giftId });
    const existing = rows.get(key);
    if (existing) {
      existing.amountPaise = sumPaise([existing.amountPaise, gift.netPaise]);
      existing.giftIds.push(gift.giftId);
      continue;
    }
    rows.set(key, {
      address: gift.address,
      amountPaise: gift.netPaise,
      donationTypeCode: RETURN_DONATION_TYPE_CODES[gift.donationType],
      giftIds: [gift.giftId],
      idCode,
      idNumber: normalizeIdNumber(gift.idNumber),
      modeCode: RETURN_MODE_CODES[effectiveReportingMode(gift)],
      name: gift.name,
      partyId: gift.partyId,
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en-IN") ||
      a.partyId.localeCompare(b.partyId) ||
      a.donationTypeCode.localeCompare(b.donationTypeCode) ||
      a.modeCode.localeCompare(b.modeCode)
  );
}

/** What one line of the upload file prints. */
export type ReturnFileRow = Pick<
  ReturnExportRow,
  | "address"
  | "amountPaise"
  | "donationTypeCode"
  | "idCode"
  | "idNumber"
  | "modeCode"
  | "name"
> & { preArn: string | null };

/** The upload file's header and cells, in `RETURN_COLUMNS` order. */
export function returnFileCells(
  rows: readonly ReturnFileRow[],
  registration: ReturnRegistration
): { headers: string[]; rows: string[][] } {
  return {
    headers: RETURN_COLUMNS.map((column) => column.header),
    rows: rows.map((row, index) => {
      const cells: Record<ReturnColumnKey, string> = {
        address: row.address,
        amount: formatReturnAmount(row.amountPaise),
        donationType: row.donationTypeCode,
        idCode: row.idCode,
        idNumber: row.idNumber,
        mode: row.modeCode,
        name: row.name,
        preAcknowledgementNumber: row.preArn ?? "",
        sectionCode: registration.sectionCode,
        srNo: String(index + 1),
        urn: registration.urn,
        urnIssuedOn: formatReturnDate(registration.urnIssuedOn),
      };
      return RETURN_COLUMNS.map((column) => cells[column.key]);
    }),
  };
}

// ── Filings and Pre-ARNs ────────────────────────────────────────────────────

/**
 * The portal takes at most 25,000 rows per Form 113 upload; a larger return
 * needs another filing.
 */
export const MAX_FILING_ROWS = 25_000;

/**
 * A Pre-Acknowledgement Number as the portal issues it. The portal caps it
 * at 21 letters and digits; its exact format is unpublished, so a value
 * must also be at least 10 characters with a digit. That keeps out what a
 * pasted portal table carries besides the numbers (serial numbers, status
 * words such as "UNCONSUMED"), which would otherwise match any certificate
 * printing the same token. Pre-ARNs come from the portal in batches; the
 * dashboard never makes them up.
 */
export const PRE_ARN_PATTERN = /^(?=[A-Z]*\d)[A-Z0-9]{10,21}$/;

/**
 * Reads a pasted list of Pre-ARNs (one per line, or separated by spaces,
 * commas or semicolons), upper-cased, repeats dropped, in the order given.
 */
export function parsePreArnList(text: string): {
  invalid: string[];
  values: string[];
} {
  const values: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const value = token.trim().toUpperCase();
    if (!value) {
      continue;
    }
    if (!PRE_ARN_PATTERN.test(value)) {
      invalid.push(token.trim());
    } else if (!values.includes(value)) {
      values.push(value);
    }
  }
  return { invalid, values };
}

/**
 * A certificate email queued this long ago, neither sent nor failed, is
 * taken as stuck: "Email certificates" queues it again.
 */
export const CERTIFICATE_EMAIL_STALE_MS = 60 * 60 * 1000;

/** How a filed row's gifts differ now from what was filed. */
export type FilingDrift =
  | "amount"
  | "reversed"
  | "excluded"
  | "donor"
  | "donation_type";

export const FILING_DRIFT_LABELS: Record<FilingDrift, string> = {
  amount: "Amount changed",
  donation_type: "Donation type changed",
  donor: "Donor changed",
  excluded: "Gift now excluded",
  reversed: "Gift reversed",
};

/** An upload row with its place in a filing. */
export interface FilingPlanRow extends ReturnExportRow {
  /** Portal-issued, or null when the column is left empty. */
  preArn: string | null;
  srNo: number;
}

/**
 * Numbers a filing's rows (in upload order) and, when portal-issued
 * Pre-ARNs are given, assigns them in Sr. No. order. Refuses more rows than
 * one upload takes, or fewer Pre-ARNs than rows.
 */
export function planFilingRows(
  rows: readonly ReturnExportRow[],
  preArns: readonly string[] | null
): FilingPlanRow[] {
  if (rows.length > MAX_FILING_ROWS) {
    throw new Error(`A filing takes at most ${MAX_FILING_ROWS} rows`);
  }
  if (preArns && preArns.length < rows.length) {
    throw new Error("Fewer Pre-ARNs than rows");
  }
  return rows.map((row, index) => ({
    ...row,
    preArn: preArns ? (preArns[index] ?? null) : null,
    srNo: index + 1,
  }));
}

/** Label for a gift's outcome in the "All gifts" file and on the page. */
export function giftOutcomeLabel(outcome: GiftOutcome): {
  reason: string;
  status: string;
} {
  switch (outcome.kind) {
    case "ready":
      return { reason: "", status: "Ready" };
    case "filed":
      return { reason: `Filing ${outcome.filingSequence}`, status: "Filed" };
    case "waiting":
      return { reason: "Not received yet", status: "Waiting" };
    case "excluded":
      return {
        reason: RETURN_EXCLUSION_LABELS[outcome.reason],
        status: "Excluded",
      };
    default:
      return {
        reason: outcome.blocks
          .map((block) => RETURN_BLOCK_LABELS[block])
          .join("; "),
        status: "Needs attention",
      };
  }
}
