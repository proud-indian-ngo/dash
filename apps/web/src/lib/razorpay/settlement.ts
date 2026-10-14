import {
  recordRazorpaySettlement,
  type SettlementLineToRecord,
  type SettlementToRecord,
} from "@pi-dash/db/queries/razorpay-settlements";
import type { RazorpaySyncSettlementPayload } from "@pi-dash/jobs/types";
import { todayInKolkata } from "@pi-dash/shared/income";

import {
  createRazorpayClient,
  type RazorpayClient,
  type ReconDay,
  type ReconListing,
  type UnixWindow,
} from "./api";
import type { RazorpaySetup } from "./config";
import { istDayOf, type RazorpayMode } from "./payment";
import type {
  RazorpayReconItem,
  RazorpaySettlement,
} from "./settlement-schema";

/**
 * Server-only. Recording Razorpay settlements: what Razorpay paid from the
 * clearing balance into the bank, with the payments, refunds, transfers and
 * adjustments each payout covered. The settlement comes from the
 * settlements API and its lines from the settlement recon of the day it was
 * settled. Both need the API key secret; a webhook copy alone cannot say
 * which payments a payout covered, so without the secret settlements are
 * off. Settlements never create or change a contribution.
 */

export interface SettlementTally {
  /** Settlements whose amount Razorpay now reports differently; flagged. */
  changed: number;
  /** Settlements or lines that failed to record or could not be read. */
  errors: number;
  found: number;
  /** Payment and refund lines linked to their contribution or refund. */
  linked: number;
  new: number;
  /** Payment and refund lines still waiting for their payment or refund. */
  unlinked: number;
}

export const emptySettlementTally = (): SettlementTally => ({
  changed: 0,
  errors: 0,
  found: 0,
  linked: 0,
  new: 0,
  unlinked: 0,
});

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The recon query of an India day (yyyy-MM-dd). */
export function reconDayOf(day: string): ReconDay {
  const match = ISO_DAY.exec(day);
  if (!match) {
    throw new Error("Not a yyyy-MM-dd date");
  }
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

const shiftDay = (day: string, n: number) => {
  const { day: d, month, year } = reconDayOf(day);
  return new Date(Date.UTC(year, month - 1, d + n)).toISOString().slice(0, 10);
};

/** Whether a recon line is in a currency other than rupees, so it is not recorded. */
const isForeign = (item: RazorpayReconItem) =>
  Boolean(item.currency && item.currency.toUpperCase() !== "INR");

/**
 * A recon line as a settlement line, or null when it is not one: not
 * settled, in another currency, or with no settlement. Razorpay's fee
 * includes its GST; the fee kept is net of GST, as on contributions.
 */
export function toSettlementLine(
  item: RazorpayReconItem,
  fallbackSettledAt: number
): SettlementLineToRecord | null {
  if (item.settled === false || !item.settlement_id) {
    return null;
  }
  if (isForeign(item)) {
    return null;
  }
  const tax = item.tax ?? 0;
  const fee = item.fee ?? 0;
  return {
    creditPaise: item.credit,
    debitPaise: item.debit,
    externalId: item.entity_id,
    feePaise: Math.max(0, fee - tax),
    settledAt: new Date((item.settled_at ?? fallbackSettledAt) * 1000),
    taxPaise: tax,
    type: item.type,
  };
}

/**
 * A settlement and the recon lines naming it, as pi-dash records them.
 * Lines in another currency, and lines the recon returned in a shape
 * pi-dash cannot read, are counted as unreadable. The settlement's own
 * `fees` (an instant settlement's charge, GST included) is kept net of its
 * `tax`; Razorpay reports 0 for a normal settlement, kept as none.
 */
export function toSettlementRecord(
  settlement: RazorpaySettlement,
  recon: Pick<ReconListing, "items" | "unreadableBySettlement">,
  mode: RazorpayMode
): SettlementToRecord {
  const lines: SettlementLineToRecord[] = [];
  let unreadable = recon.unreadableBySettlement.get(settlement.id) ?? 0;
  for (const item of recon.items) {
    if (item.settlement_id !== settlement.id || item.settled === false) {
      continue;
    }
    const line = toSettlementLine(item, settlement.created_at);
    if (line) {
      lines.push(line);
    } else if (isForeign(item)) {
      unreadable += 1;
    }
  }
  const fees = settlement.fees ?? 0;
  const tax = settlement.tax ?? 0;
  return {
    amountPaise: settlement.amount,
    externalId: settlement.id,
    lines,
    mode,
    settledOn: istDayOf(settlement.created_at),
    settlementFeePaise: fees > 0 ? Math.max(0, fees - tax) : null,
    settlementTaxPaise: fees > 0 ? tax : null,
    status: settlement.status,
    unreadableLines: unreadable,
    utr: settlement.utr ?? null,
  };
}

export interface SettlementDeps {
  logFailure: (item: { settlementId: string }, error: unknown) => void;
  record: typeof recordRazorpaySettlement;
}

/**
 * Records a settlement and adds it to the tally. A settlement already
 * recorded earlier in the same run (listed on one day, its lines reported
 * on the next) adds only the lines it linked, so it is counted once.
 */
async function recordInto(
  tally: SettlementTally,
  record: SettlementToRecord,
  deps: SettlementDeps,
  seen: Set<string>
): Promise<void> {
  try {
    const result = await deps.record(record);
    tally.linked += result.linked;
    if (seen.has(record.externalId)) {
      return;
    }
    seen.add(record.externalId);
    tally.found += 1;
    if (result.created) {
      tally.new += 1;
    }
    if (result.amountChanged) {
      tally.changed += 1;
    }
    tally.unlinked += result.unlinked;
  } catch (error) {
    tally.errors += 1;
    deps.logFailure({ settlementId: record.externalId }, error);
  }
}

/**
 * One India day of a reconcile run: the settlements created that day and
 * the lines settled that day, grouped by settlement. A settlement the
 * listing missed but the recon names is fetched by ID. `seen` carries the
 * settlements a run has already counted. Returns the tally and the pages
 * fetched; an API failure stops the run.
 */
export async function syncSettlementsForDay(
  day: string,
  window: UnixWindow,
  client: RazorpayClient,
  mode: RazorpayMode,
  deps: SettlementDeps,
  seen: Set<string> = new Set()
): Promise<{ pages: number; tally: SettlementTally }> {
  const tally = emptySettlementTally();
  const listed = await client.listSettlements(window);
  const recon = await client.listSettlementRecon(reconDayOf(day));
  tally.errors += listed.unreadable + recon.unreadable;
  let pages = listed.pages + recon.pages;

  const settlements = new Map<string, RazorpaySettlement>(
    listed.items.map((settlement) => [settlement.id, settlement])
  );
  const named = new Set(
    recon.items.flatMap((item) =>
      item.settlement_id && item.settled !== false ? [item.settlement_id] : []
    )
  );
  for (const id of named) {
    if (settlements.has(id)) {
      continue;
    }
    const fetched = await client.fetchSettlement(id);
    pages += 1;
    if (fetched) {
      settlements.set(id, fetched);
    } else {
      tally.errors += 1;
    }
  }
  for (const settlement of settlements.values()) {
    await recordInto(
      tally,
      toSettlementRecord(settlement, recon, mode),
      deps,
      seen
    );
  }
  return { pages, tally };
}

export type SettlementSyncOutcome =
  | {
      created: boolean;
      lines: number;
      linked: number;
      outcome: "recorded";
      unlinked: number;
    }
  | {
      outcome: "disabled" | "no_key_secret" | "not_found" | "test_mode_refused";
    };

export interface SingleSettlementDeps {
  client: (key: { id: string; secret: string }) => RazorpayClient;
  now: () => Date;
  record: typeof recordRazorpaySettlement;
}

const SINGLE_DEPS: SingleSettlementDeps = {
  client: (key) => createRazorpayClient(key),
  now: () => new Date(),
  record: recordRazorpaySettlement,
};

/**
 * Thrown so pg-boss retries a processed settlement whose lines the recon
 * does not list yet; recording it with none would say nothing was covered.
 */
export class SettlementLinesNotReadyError extends Error {
  constructor() {
    super("Razorpay's recon does not list the settlement's lines yet");
    this.name = "SettlementLinesNotReadyError";
  }
}

/**
 * The `razorpay-sync-settlement` job, queued by a `settlement.processed`
 * webhook: fetches the settlement, then the recon of the India day it was
 * settled, and when that lists none of its lines the next day (a payout
 * just before midnight may be reported then, if that day has begun) and the
 * day before. A processed settlement still without lines throws
 * `SettlementLinesNotReadyError`, so the job retries with backoff; one not
 * processed yet is recorded as it is. Needs the key secret; a test key on a
 * production server records nothing.
 */
export async function syncRazorpaySettlement(
  input: RazorpaySyncSettlementPayload,
  setup: RazorpaySetup,
  deps: SingleSettlementDeps = SINGLE_DEPS
): Promise<SettlementSyncOutcome> {
  if (!setup.enabled) {
    return { outcome: "disabled" };
  }
  if (setup.testInProduction) {
    return { outcome: "test_mode_refused" };
  }
  if (!setup.apiKey) {
    return { outcome: "no_key_secret" };
  }
  const client = deps.client(setup.apiKey);
  const settlement = await client.fetchSettlement(input.settlementId);
  if (!settlement) {
    return { outcome: "not_found" };
  }
  const day = istDayOf(settlement.created_at);
  const following = shiftDay(day, 1);
  const days = [
    day,
    ...(following <= todayInKolkata(deps.now()) ? [following] : []),
    shiftDay(day, -1),
  ];
  let record: SettlementToRecord | null = null;
  for (const candidate of days) {
    record = toSettlementRecord(
      settlement,
      await client.listSettlementRecon(reconDayOf(candidate)),
      setup.mode
    );
    if (record.lines.length > 0) {
      break;
    }
  }
  if (
    !record ||
    (record.lines.length === 0 && settlement.status === "processed")
  ) {
    throw new SettlementLinesNotReadyError();
  }
  const result = await deps.record(record);
  return {
    created: result.created,
    lines: record.lines.length,
    linked: result.linked,
    outcome: "recorded",
    unlinked: result.unlinked,
  };
}
