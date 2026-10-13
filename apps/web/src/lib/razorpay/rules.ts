import type { ImportBatchRow } from "@pi-dash/db/queries/income-import";
import {
  RAZORPAY_CONFIG_KEYS,
  readRazorpayConfig,
} from "@pi-dash/db/queries/razorpay-import";

import type { RowRules } from "@/lib/income-import/server";

import { parseNotesKeys } from "./notes-keys";
import {
  normalizeRazorpayRow,
  parseRazorpayBatchKey,
  razorpayPayloadHash,
} from "./payment";

/**
 * Server-only. How the import flow reads a Razorpay batch: payments
 * normalised with the configured notes keys, identified by payment ID under
 * the batch's mode (live and test IDs never mix), and fingerprinted from the
 * payment itself so a changed setting never makes a conflict.
 */
export async function razorpayRowRules(
  batch: ImportBatchRow
): Promise<RowRules> {
  const key = parseRazorpayBatchKey(batch.fileHash);
  if (!key) {
    throw new Error("Razorpay batch has no mode");
  }
  const config = await readRazorpayConfig();
  const notesKeys = parseNotesKeys(config.get(RAZORPAY_CONFIG_KEYS.notesKeys));
  return {
    identity: (row) => ({
      entityType: "payment",
      externalId: row.externalId,
      provider: "razorpay",
      providerAccount: key.mode,
      weak: false,
    }),
    normalize: (raw) => normalizeRazorpayRow(raw, notesKeys),
    payloadHash: (_row, raw) => razorpayPayloadHash(raw),
    weakIdentity: false,
  };
}
