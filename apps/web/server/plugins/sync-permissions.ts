import { ensureLedgerReferenceData } from "@pi-dash/db/ledger/reference-data";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { definePlugin } from "nitro";

export default definePlugin(async () => {
  await syncPermissions();
  // The books' Corpus Fund and account heads; idempotent.
  await ensureLedgerReferenceData();
});
