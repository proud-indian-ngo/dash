/**
 * What the browser shows about certificate uploads; kept apart from the
 * parser so the page doesn't load it.
 */

/** Largest upload accepted in one go: a ZIP or a single PDF. */
export const MAX_CERTIFICATE_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UnmatchedReason =
  | "not_pdf"
  | "unreadable"
  | "other_year"
  | "several_rows"
  | "no_row"
  | "no_acknowledgement"
  | "row_has_certificate"
  | "duplicate_in_upload"
  | "acknowledgement_in_use";

export const UNMATCHED_REASON_LABELS: Record<UnmatchedReason, string> = {
  acknowledgement_in_use:
    "Its acknowledgement number is already on another certificate, here or in another filing",
  duplicate_in_upload: "Another file in this upload is for the same row",
  no_acknowledgement: "No acknowledgement number found on it",
  no_row: "No row of this filing has its labelled donor ID, amount and name",
  not_pdf: "Not a PDF",
  other_year: "It is for another financial year",
  row_has_certificate: "Its row already has a different certificate",
  several_rows: "It fits more than one row",
  unreadable: "Its text couldn't be read",
};
