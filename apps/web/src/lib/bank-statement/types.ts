import type {
  ImportBatchStatus,
  ImportRowOutcome,
  StatementLineDirection,
  StatementLineIgnoreReason,
} from "@pi-dash/shared/constants";

import type { ImportDateFormat } from "@/lib/income-import/fields";

import type { AmountLayout, BankMapping } from "./fields";
import type { StatementCellIssue, StatementSkipReason } from "./normalize";

/** Client-safe shapes the bank statement server functions return. */

export interface StatementColumn {
  header: string;
  samples: string[];
}

export interface CreateStatementBatchResponse {
  batchId: string;
  columns: StatementColumn[];
  /** The last upload's date format for this account, if any. */
  dateFormat: ImportDateFormat | null;
  earlierUpload: { batchId: string; createdAt: number } | null;
  mapping: BankMapping;
  rowCount: number;
}

/**
 * new: a line the account does not have. existing: already imported by an
 * earlier upload (the same line in an overlapping file). skipped: not a
 * transaction. error: a transaction that cannot be read.
 */
export type StatementRowCategory = "new" | "existing" | "skipped" | "error";

export interface StatementReviewRow {
  amountPaise: number | null;
  balancePaise: number | null;
  category: StatementRowCategory;
  direction: StatementLineDirection | null;
  errors: StatementCellIssue[];
  /** Masked narration of a line. */
  narration: string | null;
  outcome: ImportRowOutcome;
  /** For a skipped row: its filled cells, masked and shortened. */
  preview: string | null;
  reference: string | null;
  rowId: string;
  rowNumber: number;
  skipReason: StatementSkipReason | null;
  valueOn: string | null;
  warnings: StatementCellIssue[];
}

export interface StatementReviewResponse {
  batch: {
    dateFormat: ImportDateFormat;
    fileName: string;
    id: string;
    mapping: BankMapping;
    orgAccountId: string;
    rowCount: number;
    status: ImportBatchStatus;
  };
  counts: Record<StatementRowCategory, number>;
  layout: AmountLayout;
  rows: StatementReviewRow[];
}

export interface MatchRunResult {
  matched: number;
  suggested: number;
}

export interface StatementRunResponse extends MatchRunResult {
  errors: number;
  existing: number;
  imported: number;
  skipped: number;
}

/** A reviewer's action on one line. */
export type StatementLineAction =
  | { action: "accept"; lineId: string }
  | { action: "dismiss"; lineId: string }
  | {
      action: "link";
      kind: "contribution" | "settlement";
      lineId: string;
      targetId: string;
    }
  | { action: "giveindia"; lineId: string }
  | { action: "transfer"; lineId: string; note: string | null }
  | {
      action: "ignore";
      lineId: string;
      note: string | null;
      reason: StatementLineIgnoreReason;
    }
  | { action: "unmatch"; lineId: string }
  | { action: "note"; lineId: string; note: string | null };

export interface LinkCandidatesResponse {
  contributions: {
    amountPaise: number;
    donorName: string;
    id: string;
    receivedOn: string;
    reference: string | null;
  }[];
  settlements: {
    amountPaise: number;
    externalId: string;
    id: string;
    settledOn: string;
    utr: string | null;
  }[];
}

export interface BankStatementSummaryResponse {
  closing: { balancePaise: number; valueOn: string } | null;
  creditCount: number;
  creditsMatchedCount: number;
  giveDoClearingPaise: number;
  lineCount: number;
  /** Null when Razorpay is not configured on the server. */
  razorpayClearingPaise: number | null;
  suggestionCount: number;
  unmatchedCount: number;
}
