import { ensureUpcomingFiscalYears } from "@pi-dash/db/fiscal-years";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

/** Keeps the current and next fiscal year (with their periods) present, so postings always have a period. */
export async function handleEnsureFiscalYears(_jobs: Job[]): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "ensure-fiscal-years",
  });
  const created = await ensureUpcomingFiscalYears();
  log.set({ created, event: "fiscal_years_ensured" });
  log.emit();
}
