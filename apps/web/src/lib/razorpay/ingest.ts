import { importedRowRetention } from "@pi-dash/db/import-retention";
import { withImportTransaction } from "@pi-dash/db/queries/income-import";
import {
  appendImportRow,
  findClearingAccount,
  findRazorpayBatch,
  findRazorpayPaymentRow,
  insertRazorpayBatch,
  RAZORPAY_CONFIG_KEYS,
  readRazorpayConfig,
  replacePendingRaw,
  withRazorpayStageTransaction,
} from "@pi-dash/db/queries/razorpay-import";
import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { todayInKolkata } from "@pi-dash/shared/income";
import { uuidv7 } from "uuidv7";

import { IMPORT_PARSER_VERSION } from "@/lib/income-import/fields";
import {
  importStagedRows,
  type StagedRowResult,
} from "@/lib/income-import/server";

import { fetchRazorpayPayment } from "./api";
import type { RazorpaySetup } from "./config";
import {
  flattenPayment,
  istDayOf,
  type RazorpayMode,
  type RazorpayPayment,
  rawHashOf,
  razorpayBatchKey,
  razorpayBatchName,
} from "./payment";

/**
 * Server-only. Getting a Razorpay payment into the books, in two idempotent
 * steps keyed by payment ID:
 *
 * 1. Stage: the webhook (or the job, from the API) stores the payment as a
 *    row of its India day's `razorpay_api` batch. A payment is staged once;
 *    a later copy only refreshes a row that is still pending.
 * 2. Process: the job classifies the row with the CSV import's rules and,
 *    when no decision is needed, imports it as the system in one
 *    transaction. The external identity's unique key keeps it to one
 *    contribution per payment however often this runs.
 *
 * Personal data goes only into `private.import_row`; the job payload carries
 * the payment ID and day, and logs carry IDs and outcomes.
 */

export interface StageResult {
  batchId: string;
  day: string;
  rowId: string;
  staged: "existing" | "new" | "refreshed";
}

/** The clearing account to use, if one is set and still usable. */
export async function configuredClearingAccountId(): Promise<string | null> {
  const id = (await readRazorpayConfig()).get(
    RAZORPAY_CONFIG_KEYS.clearingAccountId
  );
  return id ? ((await findClearingAccount(id))?.id ?? null) : null;
}

export async function stageRazorpayPayment(
  payment: RazorpayPayment,
  mode: RazorpayMode,
  now: Date = new Date()
): Promise<StageResult> {
  const raw = flattenPayment(payment);
  const rawHash = rawHashOf(raw);
  const day = istDayOf(payment.created_at);
  const key = razorpayBatchKey(mode, day);
  const clearingAccountId = await configuredClearingAccountId();
  return await withRazorpayStageTransaction(async (tx) => {
    const existing = await findRazorpayPaymentRow(tx, key, payment.id);
    if (existing) {
      const refresh =
        existing.outcome === "pending" && existing.rawHash !== rawHash;
      if (refresh) {
        await replacePendingRaw(tx, existing.id, raw, rawHash);
      }
      return {
        batchId: existing.batchId,
        day,
        rowId: existing.id,
        staged: refresh ? "refreshed" : "existing",
      };
    }
    const batch =
      (await findRazorpayBatch(tx, key)) ??
      (await insertRazorpayBatch(tx, {
        createdAt: now,
        dateFormat: "ymd",
        defaultChannel: "razorpay",
        fileHash: key,
        fileName: razorpayBatchName(mode, day),
        fundId: GENERAL_FUND_ID,
        id: uuidv7(),
        orgAccountId: clearingAccountId,
        parserVersion: IMPORT_PARSER_VERSION,
        rowCount: 0,
        source: "razorpay_api",
        // Payments arrive already decided by the donor, so the batch never
        // sits as an unimported draft and its rows are kept like imported ones.
        status: "completed",
        updatedAt: now,
      }));
    const rowId = uuidv7();
    await appendImportRow(tx, {
      ...importedRowRetention(todayInKolkata(now)),
      batchId: batch.id,
      createdAt: now,
      id: rowId,
      legalHold: false,
      raw,
      rawHash,
    });
    return { batchId: batch.id, day, rowId, staged: "new" };
  });
}

/** Classifies a staged payment and imports it when no decision is needed. */
export async function processRazorpayPayment(
  paymentId: string,
  day: string,
  mode: RazorpayMode,
  now: Date = new Date()
): Promise<StagedRowResult | "not_staged"> {
  return await withImportTransaction(async (tx) => {
    const staged = await findRazorpayPaymentRow(
      tx,
      razorpayBatchKey(mode, day),
      paymentId
    );
    if (!staged) {
      return "not_staged";
    }
    const results = await importStagedRows(
      tx,
      staged.batch,
      new Set([staged.id]),
      now
    );
    return results.get(staged.id) ?? "already_decided";
  });
}

export type SyncOutcome =
  | StagedRowResult
  | "disabled"
  | "not_captured"
  | "not_found"
  | "not_staged";

export interface SyncDeps {
  fetchPayment: typeof fetchRazorpayPayment;
  process: typeof processRazorpayPayment;
  stage: typeof stageRazorpayPayment;
}

const SYNC_DEPS: SyncDeps = {
  fetchPayment: fetchRazorpayPayment,
  process: processRazorpayPayment,
  stage: stageRazorpayPayment,
};

/**
 * The `razorpay-sync-payment` job. With an API key the payment is fetched
 * from Razorpay, the source of truth, and staged (or refreshed); without
 * one the copy the verified webhook staged is used.
 */
export async function syncRazorpayPayment(
  input: { day: string; paymentId: string },
  setup: RazorpaySetup,
  deps: SyncDeps = SYNC_DEPS
): Promise<SyncOutcome> {
  if (!setup.enabled) {
    return "disabled";
  }
  let { day } = input;
  if (setup.apiKey) {
    const payment = await deps.fetchPayment(input.paymentId, setup.apiKey);
    if (!payment) {
      return "not_found";
    }
    if (payment.status !== "captured") {
      return "not_captured";
    }
    ({ day } = await deps.stage(payment, setup.mode));
  }
  return await deps.process(input.paymentId, day, setup.mode);
}
