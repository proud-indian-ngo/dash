import type {
  ImportBatchStatus,
  ImportRowOutcome,
  PartyFillField,
} from "@pi-dash/shared/constants";

import type { StatusTone } from "@/components/shared/status-badge";

import type { MatchReason, ReviewCategory } from "./classify";

export const IMPORT_BATCH_STATUS_LABELS: Record<ImportBatchStatus, string> = {
  completed: "Completed",
  draft: "Draft",
  expired: "Expired",
  failed: "Failed",
  importing: "Importing",
  reviewed: "Reviewed",
};

export const IMPORT_BATCH_STATUS_TONES: Record<ImportBatchStatus, StatusTone> =
  {
    completed: "success",
    draft: "neutral",
    expired: "neutral",
    failed: "danger",
    importing: "info",
    reviewed: "info",
  };

export const IMPORT_ROW_OUTCOME_LABELS: Record<ImportRowOutcome, string> = {
  conflict: "Conflict",
  error: "Error",
  imported: "Imported",
  linked_existing: "Already imported",
  pending: "Not imported",
  skipped: "Skipped",
};

export const IMPORT_ROW_OUTCOME_TONES: Record<ImportRowOutcome, StatusTone> = {
  conflict: "warning",
  error: "danger",
  imported: "success",
  linked_existing: "neutral",
  pending: "neutral",
  skipped: "neutral",
};

/** Short codes stored in import_row.outcome_reason. */
export const IMPORT_OUTCOME_REASON_LABELS: Record<string, string> = {
  changed_since_imported:
    "Imported before with different details; edit the contribution by hand if needed",
  clearing_account_inactive:
    "Waiting: the Razorpay clearing account was deactivated; choose an active one in Settings → Integrations",
  donor_details_invalid: "The donor's details could not be saved",
  duplicate_of_skipped_row: "Same as a row that was skipped",
  invalid_cells: "Fix the file and upload it again",
  needs_review: "Waiting for a reviewer's decision",
  no_clearing_account: "Waiting for the Razorpay clearing account",
  not_captured: "Razorpay no longer has this payment as captured",
  not_found: "Razorpay does not know this payment",
  queued: "Waiting to sync with Razorpay",
  skipped_by_user: "Skipped",
  sync_failed: "Couldn't sync with Razorpay; import it here",
  undecided: "Left for review",
};

/** Tab labels; each tab counts rows. */
export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  already_imported: "Already imported",
  conflict: "Conflicts",
  done: "Imported",
  error: "Errors",
  needs_review: "Needs review",
  new_donor: "New donor",
  ready: "Ready",
  repeated_in_file: "Repeated in file",
};

/** The status badge of one row. */
export const REVIEW_ROW_STATUS_LABELS: Record<ReviewCategory, string> = {
  already_imported: "Already imported",
  conflict: "Conflict",
  done: "Imported",
  error: "Error",
  needs_review: "Needs review",
  new_donor: "New donor",
  ready: "Ready",
  repeated_in_file: "Repeated in file",
};

export const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  email: "same email",
  id_number: "same ID number",
  name: "same name",
  phone: "same phone",
};

export const FILL_FIELD_LABELS: Record<PartyFillField, string> = {
  address: "address",
  email: "email",
  idNumber: "PAN / ID number",
  phone: "phone",
};

/** "PAN / ID number, address and phone". */
export function fillFieldsText(fields: readonly PartyFillField[]): string {
  const labels = fields.map((f) => FILL_FIELD_LABELS[f]);
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
    : (labels[0] ?? "");
}
