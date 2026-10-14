import { awaitingOutcomeRetention } from "@pi-dash/db/import-retention";
import {
  countImportBatchRows,
  type ImportTx,
  updateImportBatch,
  withImportTransaction,
} from "@pi-dash/db/queries/income-import";
import {
  appendImportRow,
  failPendingPaymentRow,
  findClearingAccount,
  findRazorpayBatch,
  findRazorpayPaymentRow,
  insertRazorpayBatch,
  markImportRowWaiting,
  RAZORPAY_CONFIG_KEYS,
  REOPENABLE_REASONS,
  readRazorpayConfig,
  reopenFailedPaymentRow,
  replacePendingRaw,
  withRazorpayStageTransaction,
} from "@pi-dash/db/queries/razorpay-import";
import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { todayInKolkata } from "@pi-dash/shared/income";
import { uuidv7 } from "uuidv7";

import { IMPORT_PARSER_VERSION } from "@/lib/income-import/fields";
import { rawRowHash } from "@/lib/income-import/identity";
import {
  importStagedRows,
  type StagedRowResult,
} from "@/lib/income-import/server";

import { createRazorpayClient, fetchRazorpayPayment } from "./api";
import type { RazorpaySetup } from "./config";
import { parseNotesKeys } from "./notes-keys";
import {
  flattenPayment,
  isCapturedPayment,
  istDayOf,
  type RazorpayMode,
  type RazorpayPayment,
  razorpayBatchKey,
  razorpayBatchName,
} from "./payment";
import { applyPaymentRefunds, type RefundTally } from "./refund";

/**
 * Server-only. Getting a Razorpay payment into the books, in two idempotent
 * steps keyed by payment ID:
 *
 * 1. Stage: the webhook (or the job, from the API) stores the payment as a
 *    row of its India day's `razorpay_api` batch, pending with reason
 *    `queued` and no retention date. A payment is staged once; a later copy
 *    only refreshes a row that is still pending, or reopens one that failed
 *    because Razorpay did not have it captured.
 * 2. Process: the job classifies the row with the CSV import's rules and,
 *    when no decision is needed, imports it as the system in one
 *    transaction. The external identity's unique key keeps it to one
 *    contribution per payment however often this runs. A row's retention
 *    starts once it has an outcome.
 *
 * Personal data goes only into `private.import_row`, and of the notes only
 * the keys the settings read; the job payload carries the payment ID and
 * day, and logs carry IDs, outcomes and Razorpay's status word.
 */

export interface StageResult {
  batchId: string;
  day: string;
  /** False when the payment already has an outcome, so there is nothing to process. */
  pending: boolean;
  rowId: string;
  staged: "existing" | "new" | "refreshed" | "reopened";
}

/** The configured clearing account, if one is set and still usable; read in the caller's transaction. */
async function clearingAccountIn(
  tx: ImportTx,
  config: Map<string, string>
): Promise<string | null> {
  const id = config.get(RAZORPAY_CONFIG_KEYS.clearingAccountId);
  return id ? ((await findClearingAccount(id, tx))?.id ?? null) : null;
}

async function refreshCounts(tx: ImportTx, batchId: string): Promise<void> {
  await updateImportBatch(batchId, await countImportBatchRows(tx, batchId), tx);
}

export async function stageRazorpayPayment(
  payment: RazorpayPayment,
  mode: RazorpayMode,
  now: Date = new Date()
): Promise<StageResult> {
  const day = istDayOf(payment.created_at);
  const key = razorpayBatchKey(mode, day);
  // The settings are read under the stage lock, which saving them also
  // takes, so a batch is never opened without an account saved meanwhile.
  return await withRazorpayStageTransaction(async (tx) => {
    const config = await readRazorpayConfig(tx);
    const raw = flattenPayment(
      payment,
      parseNotesKeys(config.get(RAZORPAY_CONFIG_KEYS.notesKeys))
    );
    const rawHash = rawRowHash(raw);
    const existing = await findRazorpayPaymentRow(tx, key, payment.id);
    if (existing) {
      let staged: StageResult["staged"] = "existing";
      if (existing.outcome === "pending" && existing.rawHash !== rawHash) {
        await replacePendingRaw(tx, existing.id, raw, rawHash);
        staged = "refreshed";
      } else if (
        existing.outcome === "error" &&
        (REOPENABLE_REASONS as readonly (string | null)[]).includes(
          existing.outcomeReason
        )
      ) {
        await reopenFailedPaymentRow(tx, existing.id, raw, rawHash);
        await refreshCounts(tx, existing.batchId);
        staged = "reopened";
      }
      return {
        batchId: existing.batchId,
        day,
        pending: existing.outcome === "pending" || staged === "reopened",
        rowId: existing.id,
        staged,
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
        orgAccountId: await clearingAccountIn(tx, config),
        parserVersion: IMPORT_PARSER_VERSION,
        rowCount: 0,
        source: "razorpay_api",
        // Payments arrive already decided by the donor, so the batch never
        // sits as an unimported draft; each row's retention starts once it
        // has an outcome.
        status: "completed",
        updatedAt: now,
      }));
    const rowId = uuidv7();
    await appendImportRow(tx, {
      ...awaitingOutcomeRetention(),
      batchId: batch.id,
      createdAt: now,
      // Kept after retention nulls the values, so the payment is found again.
      externalId: payment.id,
      id: rowId,
      outcomeReason: "queued",
      raw,
      rawHash,
    });
    return { batchId: batch.id, day, pending: true, rowId, staged: "new" };
  });
}

/**
 * Marks a staged payment as one that cannot be imported: Razorpay does not
 * know it, or no longer has it captured. A later captured copy reopens it.
 */
export async function failRazorpayPayment(
  paymentId: string,
  day: string,
  mode: RazorpayMode,
  reason: "not_captured" | "not_found",
  now: Date = new Date()
): Promise<boolean> {
  return await withImportTransaction(async (tx) => {
    const staged = await findRazorpayPaymentRow(
      tx,
      razorpayBatchKey(mode, day),
      paymentId
    );
    if (!staged) {
      return false;
    }
    const failed = await failPendingPaymentRow(
      tx,
      staged.id,
      reason,
      now,
      todayInKolkata(now)
    );
    if (failed) {
      await refreshCounts(tx, staged.batchId);
    }
    return failed;
  });
}

/**
 * Leaves a staged payment waiting with reason `sync_failed` once its job has
 * used up its retries, so it shows as waiting rather than silently pending.
 */
export async function markRazorpaySyncFailed(
  paymentId: string,
  day: string,
  mode: RazorpayMode
): Promise<boolean> {
  return await withImportTransaction(async (tx) => {
    const staged = await findRazorpayPaymentRow(
      tx,
      razorpayBatchKey(mode, day),
      paymentId
    );
    if (!staged || staged.outcome !== "pending") {
      return false;
    }
    await markImportRowWaiting(tx, staged.id, "sync_failed");
    await refreshCounts(tx, staged.batchId);
    return true;
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
  | "not_staged"
  | "test_mode_refused";

export interface SyncDeps {
  /** Applies a refunded payment's refunds once it has been processed. */
  applyRefunds?: (
    paymentId: string,
    key: { id: string; secret: string },
    mode: RazorpayMode
  ) => Promise<RefundTally>;
  fail: typeof failRazorpayPayment;
  fetchPayment: typeof fetchRazorpayPayment;
  process: typeof processRazorpayPayment;
  stage: typeof stageRazorpayPayment;
}

const defaultApplyRefunds: NonNullable<SyncDeps["applyRefunds"]> = async (
  paymentId,
  key,
  mode
) => await applyPaymentRefunds(paymentId, createRazorpayClient(key), mode);

const SYNC_DEPS: SyncDeps = {
  applyRefunds: defaultApplyRefunds,
  fail: failRazorpayPayment,
  fetchPayment: fetchRazorpayPayment,
  process: processRazorpayPayment,
  stage: stageRazorpayPayment,
};

/**
 * The `razorpay-sync-payment` job. With an API key the payment is fetched
 * from Razorpay, the source of truth, and staged (or refreshed); without
 * one the copy the verified webhook staged is used. A payment Razorpay does
 * not know, or never captured, becomes an error row with that reason; a
 * captured payment later refunded (status `refunded`) is still recorded,
 * and once processed its refunds are fetched and applied (`onRefunds`
 * hears the tally). `onStatus` hears Razorpay's status word for the log. A
 * test key on a production server records nothing.
 */
export async function syncRazorpayPayment(
  input: { day?: string; paymentId: string },
  setup: RazorpaySetup,
  overrides: Partial<SyncDeps> = {},
  onStatus: (status: string) => void = () => undefined,
  onRefunds: (tally: RefundTally) => void = () => undefined
): Promise<SyncOutcome> {
  if (!setup.enabled) {
    return "disabled";
  }
  if (setup.testInProduction) {
    return "test_mode_refused";
  }
  const deps: SyncDeps = { ...SYNC_DEPS, ...overrides };
  let { day } = input;
  if (setup.apiKey) {
    const payment = await deps.fetchPayment(input.paymentId, setup.apiKey);
    if (!payment) {
      if (day) {
        await deps.fail(input.paymentId, day, setup.mode, "not_found");
      }
      return "not_found";
    }
    if (!isCapturedPayment(payment)) {
      onStatus(payment.status);
      await deps.fail(
        input.paymentId,
        istDayOf(payment.created_at),
        setup.mode,
        "not_captured"
      );
      return "not_captured";
    }
    const staged = await deps.stage(payment, setup.mode);
    const outcome = await deps.process(input.paymentId, staged.day, setup.mode);
    if ((payment.amount_refunded ?? 0) > 0) {
      onStatus(payment.status);
      onRefunds(
        await (deps.applyRefunds ?? defaultApplyRefunds)(
          payment.id,
          setup.apiKey,
          setup.mode
        )
      );
    }
    return outcome;
  }
  if (!day) {
    return "not_staged";
  }
  return await deps.process(input.paymentId, day, setup.mode);
}
