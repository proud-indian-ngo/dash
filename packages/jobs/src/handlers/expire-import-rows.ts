import { expireImportRows } from "@pi-dash/db/import-retention";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

/**
 * Applies the retention policy to uploaded import rows: nulls the raw cells
 * of imported batches after 180 days and deletes the rows of batches never
 * imported after 30. Logs counts only, never row content.
 */
export async function handleExpireImportRows(
  _jobs: Job[],
  today: string = todayInKolkata()
): Promise<{
  deletedRows: number;
  expiredBatches: number;
  nulledRows: number;
}> {
  const log = createRequestLogger({
    method: "JOB",
    path: "expire-import-rows",
  });
  const result = await expireImportRows(today);
  log.set({ ...result, event: "import_rows_expired" });
  log.emit();
  return result;
}
