import { normalizeIdNumber } from "@pi-dash/shared/donations-return";
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
 * - A certificate reuses the row's Pre-ARN when the row had one.
 * - A certificate prints its own acknowledgement number after a label like
 *   "Acknowledgement Number" or "Acknowledgement No." (`ACK_LABEL`).
 * - It prints the donor's ID number and the amount; it may print the
 *   donation type and mode as the upload file wrote them.
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

/** Our Pre-ARN anywhere in the text (see `formatPreArn`). */
const PRE_ARN_IN_TEXT = /PI\d{4}F\d{2}R\d{5}/g;
/** The certificate's own number after its label; assumed wording. */
const ACK_LABEL =
  /(?<!pre-?\s*)acknowledge?ment\s*(?:receipt\s*)?(?:number|no\.?)\s*(?:of\s+form\s*114\s*)?[:\-–]?\s*([A-Z0-9]{8,21})\b/gi;

export interface CertificateFields {
  /** Labelled acknowledgement numbers, in reading order. */
  acknowledgementNumbers: string[];
  /** Upper case with every space removed, for numbers split across runs. */
  compact: string;
  /** Pre-ARNs (ours) printed on the certificate. */
  preArns: string[];
  /** Lower case with runs of space collapsed. */
  text: string;
}

export function readCertificateFields(raw: string): CertificateFields {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const text = raw.replace(/\s+/g, " ").trim().toLowerCase();
  return {
    acknowledgementNumbers: [...raw.replace(/\s+/g, " ").matchAll(ACK_LABEL)]
      .map((match) => (match[1] ?? "").toUpperCase())
      .filter(Boolean),
    compact,
    preArns: [...new Set(compact.match(PRE_ARN_IN_TEXT) ?? [])],
    text,
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
  preArn: string;
}

export type CertificateDecision =
  | {
      acknowledgementNumber: string;
      kind: "matched";
      matchedBy: "pre_arn" | "details";
      rowId: string;
    }
  /** The same file (or certificate) is already stored for the row. */
  | { kind: "already_stored"; rowId: string }
  | { kind: "unmatched"; reason: UnmatchedReason };

const AMOUNT_FORMATS = (paise: number): string[] => {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  const grouped = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(rupees);
  const plain = rupees.toFixed(2);
  return [
    grouped,
    plain,
    ...(whole ? [grouped.slice(0, -3), plain.slice(0, -3)] : []),
  ];
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the amount is printed as a number of its own, in any usual form. */
function printsAmount(text: string, paise: number): boolean {
  return AMOUNT_FORMATS(paise).some((format) =>
    new RegExp(`(?<![\\d,.])${escapeRegExp(format)}(?![\\d,]|\\.\\d)`).test(
      text
    )
  );
}

function rowByDetails(
  fields: CertificateFields,
  rows: readonly MatchRow[]
): MatchRow[] {
  const byIdAndAmount = rows.filter(
    (row) =>
      row.idNumber !== null &&
      fields.compact.includes(normalizeIdNumber(row.idNumber)) &&
      printsAmount(fields.text, row.amountPaise)
  );
  if (byIdAndAmount.length <= 1) {
    return byIdAndAmount;
  }
  // A donor with several rows of the same amount: the type and mode decide,
  // and if they don't, the certificate stays ambiguous.
  const byTypeAndMode = byIdAndAmount.filter(
    (row) =>
      fields.text.includes(row.donationTypeCode.toLowerCase()) &&
      fields.text.includes(row.modeCode.toLowerCase())
  );
  return byTypeAndMode.length === 1 ? byTypeAndMode : byIdAndAmount;
}

/**
 * Matches one certificate: by our Pre-ARN when it carries one of this
 * filing's, else by the donor's ID number and the amount (type and mode
 * break a tie). Its acknowledgement number is the first labelled number that
 * isn't the filing's own, else the Pre-ARN it reuses.
 */
export function matchCertificate(
  fields: CertificateFields,
  rows: readonly MatchRow[],
  filingAcknowledgementNumber: string | null
): Exclude<CertificateDecision, { kind: "already_stored" }> {
  const byPreArn = new Map(rows.map((row) => [row.preArn, row]));
  let matchedBy: "pre_arn" | "details" = "pre_arn";
  let row: MatchRow | undefined;
  if (fields.preArns.length > 0) {
    const ours = fields.preArns.filter((preArn) => byPreArn.has(preArn));
    if (ours.length === 0) {
      return { kind: "unmatched", reason: "other_filing" };
    }
    if (ours.length > 1) {
      return { kind: "unmatched", reason: "several_rows" };
    }
    row = byPreArn.get(ours[0] as string);
  } else {
    const candidates = rowByDetails(fields, rows);
    if (candidates.length > 1) {
      return { kind: "unmatched", reason: "several_rows" };
    }
    row = candidates[0];
    matchedBy = "details";
  }
  if (!row) {
    return { kind: "unmatched", reason: "no_row" };
  }
  const labelled = fields.acknowledgementNumbers.find(
    (number) => number !== filingAcknowledgementNumber?.toUpperCase()
  );
  const acknowledgementNumber =
    labelled ?? (matchedBy === "pre_arn" ? row.preArn : undefined);
  if (!acknowledgementNumber) {
    return { kind: "unmatched", reason: "no_acknowledgement" };
  }
  return { acknowledgementNumber, kind: "matched", matchedBy, rowId: row.id };
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
  filingAcknowledgementNumber: string | null
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
    const decision = matchCertificate(
      file.fields,
      rows,
      filingAcknowledgementNumber
    );
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
