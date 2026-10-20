import { ensureLedgerTriggers } from "@pi-dash/db/ledger/immutability";
import { ensureLedgerReferenceData } from "@pi-dash/db/ledger/reference-data";
import { ensureComplianceTemplates } from "@pi-dash/db/queries/compliance";
import { ensureGovernanceReferenceData } from "@pi-dash/db/queries/governance";
import { ensureSafeguardingPolicy } from "@pi-dash/db/queries/policies";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { definePlugin } from "nitro";

export default definePlugin(async () => {
  await syncPermissions();
  // The books' Corpus Fund and account heads, and their append-only guards
  // in databases built without migrations; both idempotent.
  await ensureLedgerReferenceData();
  await ensureLedgerTriggers();
  // Deed version 1, the rules the governance register is checked against.
  await ensureGovernanceReferenceData();
  // The default compliance calendar, by key; edits are kept.
  await ensureComplianceTemplates();
  // The child-safeguarding policy; its versions are published in the app.
  await ensureSafeguardingPolicy();
});
