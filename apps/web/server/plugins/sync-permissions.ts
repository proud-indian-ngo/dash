import { ensureLedgerTriggers } from "@pi-dash/db/ledger/immutability";
import { ensureLedgerReferenceData } from "@pi-dash/db/ledger/reference-data";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { definePlugin } from "nitro";

export default definePlugin(async () => {
  await syncPermissions();
  // The books' Corpus Fund and account heads, and their append-only guards
  // in databases built without migrations; both idempotent.
  await ensureLedgerReferenceData();
  await ensureLedgerTriggers();
});
