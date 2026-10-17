import type {
  ImportBatchSource,
  ImportBatchStatus,
  ImportRowOutcome,
  PartyFillField,
} from "@pi-dash/shared/constants";

import type { DuplicateRef, MatchReason, ReviewCategory } from "./classify";
import type { ImportDateFormat, ImportMapping } from "./fields";
import type { CellIssue } from "./normalize";

/**
 * What the server sends the review and batch pages. Client-safe: contact
 * values come from the uploaded file itself, identifiers are masked, and
 * existing donors appear by display name only.
 */

export interface DonorOptionView {
  /** For an existing donor proposed by email, phone or name: the details it lacks that this row has. */
  fills: PartyFillField[];
  label: string;
  reason: MatchReason;
  /** "party:<id>" or "row:<rowId>"; "new" is always offered as well. */
  value: string;
}

export interface ReviewRowView {
  amountPaise: number | null;
  category: ReviewCategory;
  /** Who the row is for when that is already settled. */
  donor:
    | { kind: "existing"; name: string; partyId: string }
    | {
        /** The earlier row that creates this new donor; null on the row that does. */
        createdOnRow: { rowId: string; rowNumber: number } | null;
        kind: "new";
      }
    | { kind: "undecided" };
  donorName: string | null;
  donorOptions: DonorOptionView[];
  duplicate: Pick<DuplicateRef, "amountPaise" | "reason" | "receivedOn"> | null;
  email: string | null;
  errors: CellIssue[];
  /** ••••1234; never the full identifier. */
  maskedId: string | null;
  outcome: ImportRowOutcome;
  outcomeReason: string | null;
  /** False once the retention job has removed the uploaded values. */
  rawAvailable: boolean;
  receivedOn: string | null;
  reference: string | null;
  /**
   * The earlier row of this file this row repeats; it links to that row's
   * contribution, so the gift is counted once.
   */
  repeatOf: { rowNumber: number } | null;
  rowId: string;
  rowNumber: number;
  /** An earlier row with the same ID number; this row gets the donor chosen there. */
  sameDonorAs: { rowId: string; rowNumber: number } | null;
  warnings: CellIssue[];
}

export interface ImportBatchSummaryView {
  dateFormat: ImportDateFormat;
  defaultChannel: string;
  fileName: string;
  id: string;
  mapping: ImportMapping | null;
  rowCount: number;
  source: ImportBatchSource;
  status: ImportBatchStatus;
}

export interface ReviewResponse {
  batch: ImportBatchSummaryView;
  rows: ReviewRowView[];
  /** No external ID column: dedupe uses a fingerprint of date, amount, name and reference. */
  weakIdentity: boolean;
}

export interface CreateBatchResponse {
  batchId: string;
  /** An earlier upload of the same file, so the user can expect "Already imported". */
  earlierUpload: { batchId: string; createdAt: number } | null;
  headers: string[];
  mapping: ImportMapping;
  rowCount: number;
}

export interface RunResponse {
  conflicts: number;
  errors: number;
  /** Existing donors whose empty details were filled from the file. */
  filledDonors: number;
  imported: number;
  linked: number;
  newDonors: number;
  /** Rows linked to the contribution of an earlier row of the same file. */
  repeated: number;
  skipped: number;
}

export interface BatchDetailResponse {
  /** Column headers and up to three values each, for continuing a draft's mapping. */
  columns: { header: string; samples: string[] }[];
  review: ReviewResponse | null;
}
