import {
  listStaleRazorpayRows,
  recountImportBatches,
  writeRazorpayConfig,
} from "@pi-dash/db/queries/razorpay-import";
import type { RazorpayReconcilePayload } from "@pi-dash/jobs/types";
import { todayInKolkata } from "@pi-dash/shared/income";

import {
  createRazorpayClient,
  RazorpayApiError,
  type RazorpayClient,
  type UnixWindow,
} from "./api";
import type { RazorpaySetup } from "./config";
import {
  processRazorpayPayment,
  type StageResult,
  stageRazorpayPayment,
  syncRazorpayPayment,
} from "./ingest";
import {
  isCapturedPayment,
  parseRazorpayBatchKey,
  type RazorpayMode,
} from "./payment";
import {
  applyPaymentRefunds,
  applyRefund,
  emptyRefundTally,
  type RefundTally,
  tallyRefund,
} from "./refund";

/**
 * Server-only. The `razorpay-reconcile` run: catches payments and refunds
 * whose webhooks were missed, and imports past payments (backfill). It
 * walks India days one at a time, lists each day's payments and refunds
 * from the API (sequentially, paced, backing off on 429), and puts every
 * captured payment through the webhook's own path (same staging, identity
 * and rules), so a webhook and a reconcile never count a payment twice.
 * Before that it syncs payments stuck queued or `sync_failed` for over an
 * hour, and afterwards recounts every batch it touched. Its progress and
 * last result live in app_config as dates and counts only.
 */

export type ReconcileReason = RazorpayReconcilePayload["reason"];

/** The scheduled and "Sync now" runs cover today and the three days before. */
export const RECONCILE_LOOKBACK_DAYS = 3;
/** The longest range "Import past payments" takes, in days. */
export const MAX_BACKFILL_DAYS = 400;
/** Payments queued or failed for longer than this are synced again. */
export const STALE_AFTER_MS = 60 * 60 * 1000;
/** A run stops before the queue's 4-hour expiry, so it never overlaps the next. */
export const RUN_TIME_LIMIT_MS = 3.5 * 60 * 60 * 1000;
/** Least gap between two API calls of a run. */
const API_GAP_MS = 250;
/** A run whose progress has not moved for this long is taken as dead. */
export const RUN_STALE_MS = 30 * 60 * 1000;

const INDIA_OFFSET_SECONDS = 5.5 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ReconcileCounts {
  /** Payments listed by the API. */
  checked: number;
  /** Payments or refunds that failed to process, or that pi-dash could not read. */
  errors: number;
  /** Captured payments recorded as contributions by this run. */
  imported: number;
  /** Captured payments pi-dash already had. */
  known: number;
  /** Captured payments staged for the first time (or reopened). */
  new: number;
  refundsApplied: number;
  /** Refunds seen again with another amount; flagged. */
  refundsChanged: number;
  /** Refunds whose payment is not a contribution yet. */
  refundsWaiting: number;
  /** Stuck payments synced again. */
  retried: number;
  /** Payments that wait for a reviewer or a clearing account. */
  waiting: number;
}

export const emptyCounts = (): ReconcileCounts => ({
  checked: 0,
  errors: 0,
  imported: 0,
  known: 0,
  new: 0,
  refundsApplied: 0,
  refundsChanged: 0,
  refundsWaiting: 0,
  retried: 0,
  waiting: 0,
});

/** A run as app_config keeps it: dates, counts and a safe error code only. */
export interface ReconcileState {
  counts: ReconcileCounts;
  /** A short code such as `api_401` or `time_limit`; never a message. */
  errorCode?: string;
  finishedAt?: string;
  from: string;
  reason: ReconcileReason;
  startedAt?: string;
  status: "failed" | "ok" | "queued" | "running";
  to: string;
  updatedAt: string;
  windowsDone: number;
  windowsTotal: number;
}

// ── India days ──────────────────────────────────────────────────────────────

function dayParts(day: string): [number, number, number] {
  const match = ISO_DAY.exec(day);
  if (!match) {
    throw new Error("Not a yyyy-MM-dd date");
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The India day `n` days after (or before) `day`. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = dayParts(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included; empty when `from` is later. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** One India day as unix seconds, midnight to 23:59:59 IST. */
export function indiaDayWindow(day: string): UnixWindow {
  const [y, m, d] = dayParts(day);
  const from = Date.UTC(y, m - 1, d) / 1000 - INDIA_OFFSET_SECONDS;
  return { from, to: from + DAY_SECONDS - 1 };
}

/** The scheduled and "Sync now" range: today and the three days before. */
export function recentRange(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const today = todayInKolkata(now);
  return { from: addDays(today, -RECONCILE_LOOKBACK_DAYS), to: today };
}

/** Why a backfill range is refused, or null when it is fine. */
export function backfillRangeError(
  from: string,
  to: string,
  now: Date = new Date()
): string | null {
  if (!(ISO_DAY.test(from) && ISO_DAY.test(to))) {
    return "Pick a From and a To date";
  }
  if (from > to) {
    return "From must be on or before To";
  }
  if (to > todayInKolkata(now)) {
    return "To can't be in the future";
  }
  if (daysBetween(from, to).length > MAX_BACKFILL_DAYS) {
    return `Import at most ${MAX_BACKFILL_DAYS} days at a time`;
  }
  return null;
}

// ── State in app_config ─────────────────────────────────────────────────────

export function parseReconcileState(
  value: string | undefined
): ReconcileState | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as ReconcileState | null;
    return parsed && typeof parsed === "object" && "status" in parsed
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** A queued or running run that is still alive (its progress moved lately). */
export function activeRun(
  run: ReconcileState | null,
  now: Date = new Date()
): ReconcileState | null {
  if (!(run && (run.status === "queued" || run.status === "running"))) {
    return null;
  }
  const updated = Date.parse(run.updatedAt);
  return Number.isNaN(updated) || now.getTime() - updated > RUN_STALE_MS
    ? null
    : run;
}

export async function saveReconcileRun(
  run: ReconcileState | null
): Promise<void> {
  await writeRazorpayConfig({ reconcileRun: run ? JSON.stringify(run) : "" });
}

async function saveLastReconcile(last: ReconcileState): Promise<void> {
  await writeRazorpayConfig({ lastReconcile: JSON.stringify(last) });
}

// ── The run ─────────────────────────────────────────────────────────────────

export interface ReconcileDeps {
  applyPaymentRefunds: (
    paymentId: string,
    client: RazorpayClient,
    mode: RazorpayMode
  ) => Promise<RefundTally>;
  applyRefund: typeof applyRefund;
  client: (key: { id: string; secret: string }) => RazorpayClient;
  listStale: typeof listStaleRazorpayRows;
  now: () => Date;
  process: typeof processRazorpayPayment;
  recount: typeof recountImportBatches;
  saveLast: (state: ReconcileState) => Promise<void>;
  saveRun: (state: ReconcileState | null) => Promise<void>;
  stage: (
    payment: Parameters<typeof stageRazorpayPayment>[0],
    mode: RazorpayMode
  ) => Promise<StageResult>;
  syncStale: (input: { day: string; paymentId: string }) => Promise<unknown>;
}

export const reconcileDeps = (setup: RazorpaySetup): ReconcileDeps => ({
  applyPaymentRefunds: (paymentId, client, mode) =>
    applyPaymentRefunds(paymentId, client, mode),
  applyRefund,
  client: (key) => createRazorpayClient(key, { gapMs: API_GAP_MS }),
  listStale: listStaleRazorpayRows,
  now: () => new Date(),
  process: processRazorpayPayment,
  recount: recountImportBatches,
  saveLast: saveLastReconcile,
  saveRun: saveReconcileRun,
  stage: (payment, mode) => stageRazorpayPayment(payment, mode),
  syncStale: (input) => syncRazorpayPayment(input, setup),
});

export type ReconcileOutcome =
  | {
      counts: ReconcileCounts;
      errorCode?: string;
      pages: number;
      status: "failed" | "ok";
      windowsDone: number;
      windowsTotal: number;
    }
  | {
      reason: "disabled" | "no_key_secret" | "test_mode_refused";
      status: "skipped";
    };

/** Process-level outcomes the counts read. */
const IMPORTED = new Set(["ready", "new_donor"]);
const WAITING = new Set([
  "needs_review",
  "no_clearing_account",
  "clearing_account_inactive",
]);

class TimeLimitError extends Error {
  constructor() {
    super("Reconcile run time limit");
    this.name = "TimeLimitError";
  }
}

/** A short, safe code for a run that stopped; never the error's message. */
function failureCode(error: unknown): string {
  if (error instanceof TimeLimitError) {
    return "time_limit";
  }
  if (error instanceof RazorpayApiError) {
    return `api_${error.status}`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "api_timeout";
  }
  if (error instanceof TypeError) {
    return "api_unreachable";
  }
  return "failed";
}

function addTally(counts: ReconcileCounts, tally: RefundTally): void {
  counts.refundsApplied += tally.applied;
  counts.refundsChanged += tally.changed;
  counts.refundsWaiting += tally.waiting;
}

export async function runRazorpayReconcile(
  input: RazorpayReconcilePayload,
  setup: RazorpaySetup,
  deps: ReconcileDeps = reconcileDeps(setup)
): Promise<ReconcileOutcome> {
  if (!setup.enabled) {
    return { reason: "disabled", status: "skipped" };
  }
  if (setup.testInProduction || !setup.apiKey) {
    // A run queued from Settings must not look as if it is still running.
    await deps.saveRun(null);
    return {
      reason: setup.testInProduction ? "test_mode_refused" : "no_key_secret",
      status: "skipped",
    };
  }
  const { mode } = setup;
  const started = deps.now();
  const range =
    input.from && input.to ? { from: input.from, to: input.to } : null;
  const { from, to } = range ?? recentRange(started);
  const days = daysBetween(from, to).slice(0, MAX_BACKFILL_DAYS);
  const counts = emptyCounts();
  const touched = new Set<string>();
  const state: ReconcileState = {
    counts,
    from,
    reason: input.reason,
    startedAt: started.toISOString(),
    status: "running",
    to,
    updatedAt: started.toISOString(),
    windowsDone: 0,
    windowsTotal: days.length,
  };
  let pages = 0;
  const progress = async () => {
    state.updatedAt = deps.now().toISOString();
    await deps.saveRun(state);
  };
  const finish = async (status: "failed" | "ok", errorCode?: string) => {
    const finishedAt = deps.now().toISOString();
    const last: ReconcileState = {
      ...state,
      ...(errorCode ? { errorCode } : {}),
      finishedAt,
      status,
      updatedAt: finishedAt,
    };
    await deps.saveLast(last);
    await deps.saveRun(null);
    return {
      counts,
      ...(errorCode ? { errorCode } : {}),
      pages,
      status,
      windowsDone: state.windowsDone,
      windowsTotal: state.windowsTotal,
    };
  };

  await progress();
  try {
    // Payments stuck queued or failed: synced once more, one at a time.
    const stale = await deps.listStale(
      new Date(started.getTime() - STALE_AFTER_MS)
    );
    for (const row of stale) {
      const key = parseRazorpayBatchKey(row.batchKey);
      if (!key || key.mode !== mode) {
        continue;
      }
      touched.add(row.batchId);
      try {
        await deps.syncStale({ day: key.day, paymentId: row.paymentId });
        counts.retried += 1;
      } catch {
        counts.errors += 1;
      }
    }

    const client = deps.client(setup.apiKey);
    for (const day of days) {
      if (deps.now().getTime() - started.getTime() > RUN_TIME_LIMIT_MS) {
        throw new TimeLimitError();
      }
      const window = indiaDayWindow(day);
      const payments = await client.listPayments(window);
      pages += payments.pages;
      counts.checked += payments.items.length + payments.unreadable;
      counts.errors += payments.unreadable;
      for (const payment of payments.items) {
        if (!isCapturedPayment(payment)) {
          continue;
        }
        try {
          const staged = await deps.stage(payment, mode);
          touched.add(staged.batchId);
          if (staged.staged === "new" || staged.staged === "reopened") {
            counts.new += 1;
          } else {
            counts.known += 1;
          }
          if (staged.pending) {
            const outcome = await deps.process(payment.id, staged.day, mode);
            if (IMPORTED.has(outcome)) {
              counts.imported += 1;
            } else if (WAITING.has(outcome)) {
              counts.waiting += 1;
            }
          }
          if ((payment.amount_refunded ?? 0) > 0) {
            addTally(
              counts,
              await deps.applyPaymentRefunds(payment.id, client, mode)
            );
          }
        } catch (error) {
          if (error instanceof RazorpayApiError) {
            throw error;
          }
          counts.errors += 1;
        }
      }

      const refunds = await client.listRefunds(window);
      pages += refunds.pages;
      counts.errors += refunds.unreadable;
      const tally = emptyRefundTally();
      for (const refund of refunds.items) {
        try {
          tallyRefund(tally, await deps.applyRefund(refund, mode));
        } catch {
          counts.errors += 1;
        }
      }
      addTally(counts, tally);
      state.windowsDone += 1;
      await progress();
    }
  } catch (error) {
    await recountQuietly(deps, touched);
    return await finish("failed", failureCode(error));
  }
  await recountQuietly(deps, touched);
  return await finish("ok");
}

/** Recounts touched batches; a failure here never hides the run's own result. */
async function recountQuietly(
  deps: ReconcileDeps,
  touched: ReadonlySet<string>
): Promise<void> {
  try {
    await deps.recount(touched);
  } catch {
    // The next run recounts them again.
  }
}
