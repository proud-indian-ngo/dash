import {
  POSTED_DELETE_MESSAGE,
  VOID_REASON_MAX,
  VOIDED_DELETE_MESSAGE,
  VOIDED_MESSAGE,
} from "@pi-dash/shared/ledger";
import type { Transaction } from "@rocicorp/zero";
import z from "zod";

import type { Schema } from "../schema";
import { isPostedInBooks, type LedgerSourceRef } from "./ledger-queue";

type Tx = Transaction<Schema>;

/**
 * Voiding (finance Option B): a request or payment the books hold isn't
 * deleted; it is voided with a reason, kept with its attachments, vouchers
 * and history, and the posting run reverses it on the void day.
 */
export const voidSchema = z.object({
  id: z.string(),
  reason: z.string().trim().min(1, "Give a reason").max(VOID_REASON_MAX),
});

/** A voided record takes no further change. */
export function assertNotVoided(entity: { voidedAt?: number | null }) {
  if (entity.voidedAt) {
    throw new Error(VOIDED_MESSAGE);
  }
}

/**
 * Delete only what the books don't hold: anything with a standing posting
 * is voided instead (checked on the server, which can read the books), and
 * a voided record stays.
 */
export async function assertDeletable(
  tx: Tx,
  entity: { voidedAt?: number | null },
  sources: readonly LedgerSourceRef[]
) {
  if (entity.voidedAt) {
    throw new Error(VOIDED_DELETE_MESSAGE);
  }
  for (const source of sources) {
    if (await isPostedInBooks(tx, source)) {
      throw new Error(POSTED_DELETE_MESSAGE);
    }
  }
}
