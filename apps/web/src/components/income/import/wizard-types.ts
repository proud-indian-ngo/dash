import type { ImportBatchSource } from "@pi-dash/shared/constants";

import type {
  ImportDateFormat,
  ImportMapping,
} from "@/lib/income-import/fields";

/** What the wizard knows about the batch it is working on. */
export interface WizardBatch {
  batchId: string;
  columns: { header: string; samples: string[] }[];
  /** Null until chosen; the mapping step guesses from the dates in the file. */
  dateFormat: ImportDateFormat | null;
  defaultChannel: string;
  earlierUpload: { batchId: string; createdAt: number } | null;
  fileName: string;
  mapping: ImportMapping;
  rowCount: number;
  source: ImportBatchSource;
}
