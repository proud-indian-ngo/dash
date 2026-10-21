import {
  normalizeIdNumber,
  RETURN_DONATION_TYPE_VALUES,
  RETURN_MODE_CODES,
} from "@pi-dash/shared/donations-return";
import { unzipSync } from "fflate";

import type { UnmatchedReason } from "./certificate-terms";

/**
 * Reads the Form 114 certificates the portal returns for a filing and
 * matches each to a filing row. Everything known (and assumed) about the
 * certificate layout lives here, so a correction after seeing a real
 * certificate is made in one place.
 *
 * UNVERIFIED, from the portal's user manual and FAQ only:
 * - The portal's download is a ZIP of one PDF per uploaded row; file names
 *   inside it are unknown, so names are never used to match.
 * - A certificate reuses the row's portal-issued Pre-ARN when the row had
 *   one, printed as a token of its own.
 * - A certificate prints its own acknowledgement number (with at least one
 *   digit) after a label like "Acknowledgement Number" (`ACK_LABEL`).
 * - It prints the donor's name, the ID number after "Unique Identification
 *   Number" (`ID_LABEL`) and the amount after a label starting "Amount"
 *   (`AMOUNT_LABEL`); it may print "Donation Type" and "Mode of receipt"
 *   as the upload file wrote them.
 * - Its text can be extracted (it is not a scanned image).
 */

/** Unpacked size a ZIP may reach, so a crafted archive can't exhaust memory. */
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 5000;

export interface CertificateFile {
  bytes: Uint8Array;
  name: string;
}

export interface SkippedFile {
  name: string;
  reason: "not_pdf";
}

const isZip = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03;
const isPdf = (bytes: Uint8Array) =>
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46;

export class CertificateUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificateUploadError";
  }
}

/** The PDFs in an upload: the file itself, or every PDF inside a ZIP. */
export function unpackCertificateUpload(
  name: string,
  bytes: Uint8Array
): { files: CertificateFile[]; skipped: SkippedFile[] } {
  if (isPdf(bytes)) {
    return { files: [{ bytes, name }], skipped: [] };
  }
  if (!isZip(bytes)) {
    return { files: [], skipped: [{ name, reason: "not_pdf" }] };
  }
  const skipped: SkippedFile[] = [];
  let unpacked = 0;
  let entries;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        const base = file.name.split("/").at(-1) ?? "";
        if (
          file.name.endsWith("/") ||
          file.name.startsWith("__MACOSX/") ||
          base.startsWith(".")
        ) {
          return false;
        }
        unpacked += file.originalSize;
        if (unpacked > MAX_UNPACKED_BYTES) {
          throw new CertificateUploadError(
            "The ZIP is too large once unpacked. Upload it in parts."
          );
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof CertificateUploadError) {
      throw error;
    }
    throw new CertificateUploadError("The ZIP file couldn't be opened.");
  }
  const files: CertificateFile[] = [];
  for (const [path, content] of Object.entries(entries)) {
    if (isPdf(content)) {
      files.push({ bytes: content, name: path });
    } else {
      skipped.push({ name: path, reason: "not_pdf" });
    }
  }
  if (files.length > MAX_FILES) {
    throw new CertificateUploadError(
      `Upload at most ${MAX_FILES} certificates at a time.`
    );
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, skipped };
}

/** Every text run of a PDF, runs joined by spaces and pages by new lines. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Run the parser in this thread, with the worker module loaded here so
  // the server bundle includes it rather than looking for a worker file.
  const globals = globalThis as { pdfjsWorker?: unknown };
  globals.pdfjsWorker ??= await import(
    // @ts-expect-error: pdfjs ships no types for its worker module.
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    // Errors only: the standard-font warning is noise for text extraction.
    verbosity: 0,
    stopAtErrors: true,
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
      );
    }
    return pages.join("\n");
  } finally {
    await task.destroy();
  }
}

/**
 * The certificate's own number after its label; assumed wording. The value
 * must hold a digit, so prose such as "Acknowledgement Number generated
 * for" is never taken for one.
 */
const ACK_LABEL =
  /(?<!pre-?\s*)acknowledge?ment\s*(?:receipt\s*)?(?:number|no\.?)\s*(?:of\s+form\s*114\s*)?[:\-–]?\s*((?=[A-Z]*\d)[A-Z0-9]{8,21})\b/gi;
/** The donor's ID after its label; assumed wording. */
const ID_LABEL =
  /unique\s+identification\s+number(?:\s+of\s+the\s+donor)?\s*[:\-–]?\s*([A-Z0-9][A-Z0-9\-/]*)/i;
/** The tax or financial year the certificate is for; assumed wording. */
const YEAR_LABEL =
  /(?:tax|financial)\s+year\s*[:\-–]?\s*(\d{4})\s*-\s*(\d{2}|\d{4})\b/i;
/** The amount after a label starting "Amount"; assumed wording. */
const AMOUNT_LABEL =
  /amount[^:\d]{0,40}[:\-–]\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d,])/i;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first known value printed right after a label, as the upload wrote it. */
function labelledValue(
  text: string,
  label: string,
  values: readonly string[]
): string | null {
  const match = new RegExp(
    `${label}\\s*[:\\-–]?\\s*(${values.map((value) => escapeRegExp(value.toLowerCase())).join("|")})`
  ).exec(text);
  const found = match?.[1];
  return found
    ? (values.find((value) => value.toLowerCase() === found) ?? null)
    : null;
}

export interface CertificateFields {
  /** Labelled acknowledgement numbers, in reading order. */
  acknowledgementNumbers: string[];
  /** The amount after its label, in paise; null when there is no label. */
  amountPaise: number | null;
  /** The donation type after its label, as a known code; null when absent. */
  donationType: string | null;
  /** The year after its label, as "2026-27"; null when there is no label. */
  fiscalYear: string | null;
  /** The donor's ID after its label, normalised; null when there is no label. */
  idNumber: string | null;
  /** The mode of receipt after its label, as a known code; null when absent. */
  mode: string | null;
  /** Lower case with runs of space collapsed. */
  text: string;
  /** Every run of letters and digits, upper case. */
  tokens: ReadonlySet<string>;
}

export function readCertificateFields(raw: string): CertificateFields {
  const spaced = raw.replace(/\s+/g, " ").trim();
  const text = spaced.toLowerCase();
  const amount = AMOUNT_LABEL.exec(spaced)?.[1];
  const id = ID_LABEL.exec(spaced)?.[1];
  const year = YEAR_LABEL.exec(spaced);
  return {
    acknowledgementNumbers: [...spaced.matchAll(ACK_LABEL)]
      .map((match) => (match[1] ?? "").toUpperCase())
      .filter(Boolean),
    amountPaise: amount
      ? Math.round(Number(amount.replaceAll(",", "")) * 100)
      : null,
    donationType: labelledValue(
      text,
      "donation type",
      RETURN_DONATION_TYPE_VALUES
    ),
    fiscalYear: year ? `${year[1]}-${(year[2] ?? "").slice(-2)}` : null,
    idNumber: id ? normalizeIdNumber(id) : null,
    mode: labelledValue(
      text,
      "mode of receipt",
      Object.values(RETURN_MODE_CODES)
    ),
    text,
    tokens: new Set(
      spaced
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean)
    ),
  };
}

/** A filing row as matching needs it. */
export interface MatchRow {
  amountPaise: number;
  certificate: { acknowledgementNumber: string; fileSha256: string } | null;
  donationTypeCode: string;
  id: string;
  idNumber: string | null;
  modeCode: string;
  name: string;
  preArn: string | null;
}

export type CertificateDecision =
  | {
      acknowledgementNumber: string;
      kind: "matched";
      matchedBy: "pre_arn" | "details";
      /**
       * Finance confirms it before it counts: every details match, and a
       * Pre-ARN match whose labelled ID differs from the row's.
       */
      needsReview: boolean;
      rowId: string;
    }
  /** The same file (or certificate) is already stored for the row. */
  | { kind: "already_stored"; rowId: string }
  | { kind: "unmatched"; reason: UnmatchedReason };

/**
 * Shortest ID matched without a Pre-ARN: a shorter one could turn up inside
 * any other number on the certificate.
 */
export const MIN_DETAILS_ID_LENGTH = 8;

/**
 * Whether the amount is printed: the labelled amount when there is one,
 * else a whole formatted amount that isn't part of a date, year or other
 * number.
 */
function printsAmount(fields: CertificateFields, paise: number): boolean {
  if (fields.amountPaise !== null) {
    return fields.amountPaise === paise;
  }
  const rupees = paise / 100;
  const grouped = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(rupees);
  const plain = rupees.toFixed(2);
  const formats = [grouped, plain];
  if (Number.isInteger(rupees)) {
    formats.push(grouped.slice(0, -3));
  }
  return formats.some((format) =>
    new RegExp(
      `(?<![\\d,./\\-])${escapeRegExp(format)}(?![\\d,/\\-]|\\.\\d)`
    ).test(fields.text)
  );
}

/** Whether the donor's ID is printed: after its label, else as a whole token. */
function printsId(fields: CertificateFields, idNumber: string): boolean {
  const id = normalizeIdNumber(idNumber);
  return fields.idNumber !== null
    ? fields.idNumber === id
    : fields.tokens.has(id);
}

const printsName = (fields: CertificateFields, name: string) =>
  fields.text.includes(name.replace(/\s+/g, " ").trim().toLowerCase());

function rowsByDetails(
  fields: CertificateFields,
  rows: readonly MatchRow[]
): MatchRow[] {
  const candidates = rows.filter(
    (row) =>
      row.idNumber !== null &&
      normalizeIdNumber(row.idNumber).length >= MIN_DETAILS_ID_LENGTH &&
      printsId(fields, row.idNumber) &&
      printsAmount(fields, row.amountPaise) &&
      printsName(fields, row.name)
  );
  if (candidates.length <= 1) {
    return candidates;
  }
  // A donor with several rows of the same amount: the labelled type and
  // mode decide, and if they don't, the certificate stays ambiguous.
  const byLabels = candidates.filter(
    (row) =>
      fields.donationType !== null &&
      fields.mode !== null &&
      row.donationTypeCode === fields.donationType &&
      row.modeCode === fields.mode
  );
  return byLabels.length === 1 ? byLabels : candidates;
}

/** The filing a certificate is matched against, and what other filings hold. */
export interface FilingContext {
  /** The filing's own acknowledgement number, never a certificate's. */
  acknowledgementNumber: string | null;
  /** "2026-27". */
  fiscalYear: string;
  otherAcknowledgementNumbers: ReadonlySet<string>;
  otherPreArns: ReadonlySet<string>;
}

/** The certificate's own number: the first labelled one that isn't the filing's. */
const ownAcknowledgement = (fields: CertificateFields, filing: FilingContext) =>
  fields.acknowledgementNumbers.find(
    (number) => number !== filing.acknowledgementNumber?.toUpperCase()
  ) ?? null;

/** Refuses a certificate that belongs to another filing or year. */
function otherFilingReason(
  fields: CertificateFields,
  filing: FilingContext
): UnmatchedReason | null {
  if ([...fields.tokens].some((token) => filing.otherPreArns.has(token))) {
    return "other_filing";
  }
  if (fields.fiscalYear !== null && fields.fiscalYear !== filing.fiscalYear) {
    return "other_year";
  }
  return null;
}

/**
 * Matches one certificate: by the row's portal Pre-ARN when the certificate
 * carries it as a whole token, else by the donor's ID, the amount and the
 * donor's name (labelled type and mode break a tie). A details match, or a
 * Pre-ARN match whose labelled ID differs from the row's, is only a
 * proposal that finance confirms. The certificate's acknowledgement number
 * is the first labelled number that isn't the filing's own, else the
 * Pre-ARN it reuses. A certificate carrying another filing's Pre-ARN or
 * certificate number, or another year, is refused.
 */
export function matchCertificate(
  fields: CertificateFields,
  rows: readonly MatchRow[],
  filing: FilingContext
): Exclude<CertificateDecision, { kind: "already_stored" }> {
  const elsewhere = otherFilingReason(fields, filing);
  if (elsewhere) {
    return { kind: "unmatched", reason: elsewhere };
  }
  const byPreArn = rows.filter(
    (row) => row.preArn !== null && fields.tokens.has(row.preArn)
  );
  let matchedBy: "pre_arn" | "details" = "pre_arn";
  let row: MatchRow | undefined;
  if (byPreArn.length > 1) {
    return { kind: "unmatched", reason: "several_rows" };
  }
  if (byPreArn.length === 1) {
    row = byPreArn[0];
  } else {
    const candidates = rowsByDetails(fields, rows);
    if (candidates.length > 1) {
      return { kind: "unmatched", reason: "several_rows" };
    }
    row = candidates[0];
    matchedBy = "details";
  }
  if (!row) {
    return { kind: "unmatched", reason: "no_row" };
  }
  const acknowledgementNumber =
    ownAcknowledgement(fields, filing) ??
    (matchedBy === "pre_arn" ? row.preArn : null);
  if (!acknowledgementNumber) {
    return { kind: "unmatched", reason: "no_acknowledgement" };
  }
  if (filing.otherAcknowledgementNumbers.has(acknowledgementNumber)) {
    return { kind: "unmatched", reason: "acknowledgement_in_use" };
  }
  const idAgrees =
    row.idNumber !== null &&
    (fields.idNumber === null ||
      fields.idNumber === normalizeIdNumber(row.idNumber));
  return {
    acknowledgementNumber,
    kind: "matched",
    matchedBy,
    needsReview: matchedBy === "details" || !idAgrees,
    rowId: row.id,
  };
}

/**
 * A certificate finance assigns to a row by hand (one the matching left
 * unmatched): it still needs its own acknowledgement number, must not
 * belong to another filing or year, and always goes to review.
 */
export function assessAssignedCertificate(
  fields: CertificateFields,
  filing: FilingContext
): { acknowledgementNumber: string } | { reason: UnmatchedReason } {
  const elsewhere = otherFilingReason(fields, filing);
  if (elsewhere) {
    return { reason: elsewhere };
  }
  const acknowledgementNumber = ownAcknowledgement(fields, filing);
  if (!acknowledgementNumber) {
    return { reason: "no_acknowledgement" };
  }
  if (filing.otherAcknowledgementNumbers.has(acknowledgementNumber)) {
    return { reason: "acknowledgement_in_use" };
  }
  return { acknowledgementNumber };
}

export interface ReadCertificate {
  fields: CertificateFields | null;
  name: string;
  sha256: string;
}

/**
 * Decides every file of an upload against the filing's rows: a row takes
 * one certificate, a re-uploaded file is recognised as already stored, and
 * an acknowledgement number is never stored twice.
 */
export function matchCertificates(
  files: readonly ReadCertificate[],
  rows: readonly MatchRow[],
  filing: FilingContext
): CertificateDecision[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const takenRows = new Set<string>();
  const takenAcks = new Set(
    rows.flatMap((row) =>
      row.certificate ? [row.certificate.acknowledgementNumber] : []
    )
  );
  return files.map((file): CertificateDecision => {
    if (!file.fields) {
      return { kind: "unmatched", reason: "unreadable" };
    }
    const decision = matchCertificate(file.fields, rows, filing);
    if (decision.kind !== "matched") {
      return decision;
    }
    const existing = rowsById.get(decision.rowId)?.certificate;
    if (existing) {
      return existing.fileSha256 === file.sha256 ||
        existing.acknowledgementNumber === decision.acknowledgementNumber
        ? { kind: "already_stored", rowId: decision.rowId }
        : { kind: "unmatched", reason: "row_has_certificate" };
    }
    if (takenRows.has(decision.rowId)) {
      return { kind: "unmatched", reason: "duplicate_in_upload" };
    }
    if (takenAcks.has(decision.acknowledgementNumber)) {
      return { kind: "unmatched", reason: "acknowledgement_in_use" };
    }
    takenRows.add(decision.rowId);
    takenAcks.add(decision.acknowledgementNumber);
    return decision;
  });
}
