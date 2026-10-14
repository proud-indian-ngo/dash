import { and, eq, max, type SQL, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { appConfig } from "../schema/app-config";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "../schema/gateway-settlement";
import { contribution, contributionRefund } from "../schema/income";
import { externalIdentity } from "../schema/private/imports";
import { type ImportTx, withImportTransaction } from "./income-import";
import { findClearingAccount, RAZORPAY_CONFIG_KEYS } from "./razorpay-import";

/**
 * Database side of Razorpay settlements: what Razorpay paid out of the
 * clearing balance into the bank, and the payments, refunds, transfers and
 * adjustments each payout covered. A settlement is unique per provider,
 * mode and settlement ID, so syncing it again only adds lines it did not
 * have and updates its status and UTR; an amount reported differently later
 * is flagged, never written over. Lines link to the contribution a payment
 * became (through the payment's external identity) and to the recorded
 * refund (through its reference); a line whose payment or refund is not
 * recorded yet is linked by the transaction that records it. Writes run
 * under the import run lock, so a payment imported while its settlement is
 * written is linked by one or the other. No posting and no movement is made
 * and no contribution is changed.
 */

export type SettlementLineType =
  | "adjustment"
  | "payment"
  | "refund"
  | "transfer";
export type SettlementStatus = "created" | "failed" | "processed";

export interface SettlementLineToRecord {
  creditPaise: number;
  debitPaise: number;
  /** The gateway's ID of what was settled (`pay_…`, `rfnd_…`, `adj_…`, `trf_…`). */
  externalId: string;
  /** Fee excluding GST. */
  feePaise: number;
  settledAt: Date;
  taxPaise: number;
  type: SettlementLineType;
}

export interface SettlementToRecord {
  amountPaise: number;
  externalId: string;
  lines: readonly SettlementLineToRecord[];
  /** Live or test: the provider account. */
  mode: string;
  /** India date of the settlement. */
  settledOn: string;
  /** The payout's own fee (an instant settlement), excluding GST; null when none was reported. */
  settlementFeePaise: number | null;
  /** GST on the payout's own fee. */
  settlementTaxPaise: number | null;
  status: SettlementStatus;
  /** Recon lines naming it that could not be read (another currency, an unknown shape). */
  unreadableLines: number;
  utr: string | null;
}

export interface SettlementRecordResult {
  /** The amount differs from the one first recorded (now or before). */
  amountChanged: boolean;
  /** First time this settlement was seen. */
  created: boolean;
  /** Payment and refund lines linked by this write. */
  linked: number;
  settlementId: string;
  /** Payment and refund lines still waiting for their payment or refund. */
  unlinked: number;
}

type Executor = Pick<ImportTx, "execute">;

const countOf = (rows: unknown): number =>
  Array.isArray(rows) ? rows.length : 0;

/**
 * Links unlinked payment lines of this mode's settlements to the
 * contribution their payment became, narrowed to one settlement or one
 * payment. Returns how many lines were linked.
 */
async function linkPaymentLines(
  tx: Executor,
  mode: string,
  filter: { paymentId: string } | { settlementId: string }
): Promise<number> {
  const narrow =
    "paymentId" in filter
      ? sql`and i.external_id = ${filter.paymentId}`
      : sql`and i.settlement_id = ${filter.settlementId}`;
  const rows = await tx.execute(sql`
    update ${gatewaySettlementItem} i
    set contribution_id = ei.contribution_id
    from ${gatewaySettlement} s, ${externalIdentity} ei
    where s.id = i.settlement_id
      and s.provider = 'razorpay'
      and s.provider_account = ${mode}
      and i.type = 'payment'
      and i.contribution_id is null
      and ei.provider = 'razorpay'
      and ei.provider_account = s.provider_account
      and ei.entity_type = 'payment'
      and ei.external_id = i.external_id
      ${narrow}
    returning i.id`);
  return countOf(rows);
}

/** Links unlinked refund lines to the refund recorded under the same Razorpay ID. */
async function linkRefundLines(
  tx: Executor,
  mode: string,
  filter: { refundId: string } | { settlementId: string }
): Promise<number> {
  const narrow =
    "refundId" in filter
      ? sql`and i.external_id = ${filter.refundId}`
      : sql`and i.settlement_id = ${filter.settlementId}`;
  const rows = await tx.execute(sql`
    update ${gatewaySettlementItem} i
    set contribution_refund_id = r.id
    from ${gatewaySettlement} s, ${contributionRefund} r
    where s.id = i.settlement_id
      and s.provider = 'razorpay'
      and s.provider_account = ${mode}
      and i.type = 'refund'
      and i.contribution_refund_id is null
      and r.source = 'razorpay'
      and r.reference = i.external_id
      ${narrow}
    returning i.id`);
  return countOf(rows);
}

/**
 * Inside the import transaction that has just created or linked a
 * payment's contribution: links the settlement lines that were waiting for
 * it.
 */
export async function linkSettlementLinesForPayment(
  tx: Executor,
  mode: string,
  paymentId: string
): Promise<number> {
  return await linkPaymentLines(tx, mode, { paymentId });
}

/** Inside the transaction that has just recorded a refund: links its settlement lines. */
export async function linkSettlementLinesForRefund(
  tx: Executor,
  mode: string,
  refundId: string
): Promise<number> {
  return await linkRefundLines(tx, mode, { refundId });
}

/** The configured Razorpay clearing account, if it is still usable. */
async function currentClearingAccountId(tx: ImportTx): Promise<string | null> {
  const [row] = await tx
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, RAZORPAY_CONFIG_KEYS.clearingAccountId))
    .limit(1);
  if (!row?.value) {
    return null;
  }
  return (await findClearingAccount(row.value, tx))?.id ?? null;
}

/**
 * Records one settlement and its lines inside a transaction that holds the
 * import run lock. The settlement is upserted: its status and a newly
 * reported UTR are taken (a UTR is never blanked), an amount reported
 * differently sets `amount_changed` and keeps the first amount, and the
 * payout's own fee is taken when reported. Lines are upserted by their
 * unique key and never deleted. Unlinked lines are linked, and the totals
 * (gross, refunds, fees, GST, counts) are worked out again from the lines.
 * Exported for the database-backed tests.
 */
export async function recordSettlementIn(
  tx: ImportTx,
  input: SettlementToRecord,
  now: Date
): Promise<SettlementRecordResult> {
  const [existing] = await tx
    .select({
      amountChanged: gatewaySettlement.amountChanged,
      amountPaise: gatewaySettlement.amountPaise,
      id: gatewaySettlement.id,
    })
    .from(gatewaySettlement)
    .where(
      and(
        eq(gatewaySettlement.provider, "razorpay"),
        eq(gatewaySettlement.providerAccount, input.mode),
        eq(gatewaySettlement.externalId, input.externalId)
      )
    )
    .for("update");

  let settlementId: string;
  let amountChanged = false;
  if (existing) {
    settlementId = existing.id;
    amountChanged =
      existing.amountChanged || existing.amountPaise !== input.amountPaise;
    await tx
      .update(gatewaySettlement)
      .set({
        amountChanged,
        status: input.status,
        unreadableLineCount: sql`greatest(${gatewaySettlement.unreadableLineCount}, ${input.unreadableLines})`,
        updatedAt: now,
        // A UTR, once known, is never blanked by a later copy without one.
        ...(input.utr ? { utr: input.utr } : {}),
        ...(input.settlementFeePaise === null
          ? {}
          : {
              settlementFeePaise: input.settlementFeePaise,
              settlementTaxPaise: input.settlementTaxPaise ?? 0,
            }),
      })
      .where(eq(gatewaySettlement.id, settlementId));
  } else {
    settlementId = uuidv7();
    await tx.insert(gatewaySettlement).values({
      amountPaise: input.amountPaise,
      createdAt: now,
      externalId: input.externalId,
      id: settlementId,
      orgAccountId: await currentClearingAccountId(tx),
      provider: "razorpay",
      providerAccount: input.mode,
      settledOn: input.settledOn,
      settlementFeePaise: input.settlementFeePaise,
      settlementTaxPaise:
        input.settlementFeePaise === null
          ? null
          : (input.settlementTaxPaise ?? 0),
      status: input.status,
      unreadableLineCount: input.unreadableLines,
      updatedAt: now,
      utr: input.utr,
    });
  }

  for (const line of input.lines) {
    await tx
      .insert(gatewaySettlementItem)
      .values({
        creditPaise: line.creditPaise,
        debitPaise: line.debitPaise,
        externalId: line.externalId,
        feePaise: line.feePaise,
        id: uuidv7(),
        settledAt: line.settledAt,
        settlementId,
        taxPaise: line.taxPaise,
        type: line.type,
      })
      .onConflictDoUpdate({
        set: {
          creditPaise: line.creditPaise,
          debitPaise: line.debitPaise,
          feePaise: line.feePaise,
          settledAt: line.settledAt,
          taxPaise: line.taxPaise,
        },
        target: [
          gatewaySettlementItem.settlementId,
          gatewaySettlementItem.type,
          gatewaySettlementItem.externalId,
        ],
      });
  }

  const linked =
    (await linkPaymentLines(tx, input.mode, { settlementId })) +
    (await linkRefundLines(tx, input.mode, { settlementId }));

  const i = gatewaySettlementItem;
  const amountOf = sql`(${i.creditPaise} - ${i.debitPaise} + ${i.feePaise} + ${i.taxPaise})`;
  const [totals] = await tx
    .select({
      fees: sql<string>`coalesce(sum(${i.feePaise}), 0)`,
      gross: sql<string>`coalesce(sum(${amountOf}) filter (where ${i.type} = 'payment'), 0)`,
      items: sql<number>`count(*)::int`,
      payments: sql<number>`(count(*) filter (where ${i.type} = 'payment'))::int`,
      refunds: sql<string>`coalesce(sum(-${amountOf}) filter (where ${i.type} = 'refund'), 0)`,
      tax: sql<string>`coalesce(sum(${i.taxPaise}), 0)`,
      unlinked: sql<number>`(count(*) filter (where
        (${i.type} = 'payment' and ${i.contributionId} is null)
        or (${i.type} = 'refund' and ${i.contributionRefundId} is null)))::int`,
    })
    .from(i)
    .where(eq(i.settlementId, settlementId));
  await tx
    .update(gatewaySettlement)
    .set({
      feesPaise: Number(totals?.fees ?? 0),
      grossPaise: Math.max(0, Number(totals?.gross ?? 0)),
      itemCount: Number(totals?.items ?? 0),
      paymentCount: Number(totals?.payments ?? 0),
      refundsPaise: Math.max(0, Number(totals?.refunds ?? 0)),
      taxPaise: Number(totals?.tax ?? 0),
    })
    .where(eq(gatewaySettlement.id, settlementId));

  return {
    amountChanged,
    created: !existing,
    linked,
    settlementId,
    unlinked: Number(totals?.unlinked ?? 0),
  };
}

/** Records one settlement and its lines in one transaction under the import run lock. */
export async function recordRazorpaySettlement(
  input: SettlementToRecord,
  now: Date = new Date()
): Promise<SettlementRecordResult> {
  return await withImportTransaction(
    async (tx) => await recordSettlementIn(tx, input, now)
  );
}

type Reader = Pick<typeof db, "select">;

export interface SettlementSummary {
  /**
   * What Razorpay still owes the trust, line by line: imported Razorpay
   * gifts not yet in a processed settlement (gross less fee and GST), less
   * their refunds not yet in one.
   */
  awaitingPaise: number;
  feesThisYearPaise: number;
  /** Payment lines of processed settlements whose payment is not in pi-dash. */
  settledPaymentsNotImported: number;
  settledThisYearPaise: number;
}

export interface GiveDoSettlementSummary {
  /** Received give.do gifts not linked to a processed give.do payout, net of fees. */
  awaitingPaise: number;
  feesThisYearPaise: number;
  settledThisYearPaise: number;
}

/**
 * give.do settlement figures. Unlike Razorpay, give.do has no configured
 * server mode: payouts always use provider account `live`. Awaiting is
 * derived per contribution so an imported gift leaves the balance only when
 * its payment item is part of a processed give.do payout.
 */
export async function giveDoSettlementSummary(
  fy: { endsOn: string; startsOn: string },
  executor: Reader = db
): Promise<GiveDoSettlementSummary> {
  const inProcessedSettlement = sql`exists (
    select 1 from ${gatewaySettlementItem} i
    inner join ${gatewaySettlement} s on s.id = i.settlement_id
    where i.type = 'payment'
      and i.contribution_id = ${contribution.id}
      and s.provider = 'give_do'
      and s.provider_account = 'live'
      and s.status = 'processed'
  )`;
  const [gifts] = await executor
    .select({
      net: sql<string>`coalesce(sum(${contribution.amountPaise} - ${contribution.gatewayFeePaise} - ${contribution.gatewayTaxPaise}), 0)`,
    })
    .from(contribution)
    .where(
      and(
        eq(contribution.channel, "give_do"),
        sql`${contribution.status} in ('received', 'receipted')`,
        sql`not ${inProcessedSettlement}`
      )
    );

  const s = gatewaySettlement;
  const inYear = sql`${s.settledOn} between ${fy.startsOn} and ${fy.endsOn}`;
  const [settled] = await executor
    .select({
      fees: sql<string>`coalesce(sum(${s.feesPaise} + ${s.taxPaise} + coalesce(${s.settlementFeePaise}, 0) + coalesce(${s.settlementTaxPaise}, 0)) filter (where ${inYear}), 0)`,
      year: sql<string>`coalesce(sum(${s.amountPaise}) filter (where ${inYear}), 0)`,
    })
    .from(s)
    .where(
      and(
        eq(s.provider, "give_do"),
        eq(s.providerAccount, "live"),
        eq(s.status, "processed")
      )
    );

  return {
    awaitingPaise: Number(gifts?.net ?? 0),
    feesThisYearPaise: Number(settled?.fees ?? 0),
    settledThisYearPaise: Number(settled?.year ?? 0),
  };
}

/**
 * The Income page's settlement figures for one mode. Awaiting settlement is
 * worked out per line rather than as a running balance, so payments that
 * were never imported, deleted contributions and adjustments do not pull it
 * off: the net (amount less Razorpay's fee and GST) of every contribution
 * with a Razorpay payment identity of this mode whose status is received,
 * receipted or refunded and whose payment has no line in a processed
 * settlement, less every refund of those contributions with no line in a
 * processed settlement (Razorpay refunds only, of gifts counted above). A
 * fully refunded gift counts too, so its refund is set against it. A gift
 * recorded by hand and linked to a Razorpay payment holds no fee, so it
 * counts gross until settled. Settled payments whose payment is not in
 * pi-dash are counted separately.
 */
export async function razorpaySettlementSummary(
  mode: string,
  fy: { endsOn: string; startsOn: string },
  executor: Reader = db
): Promise<SettlementSummary> {
  const razorpayGift = sql`exists (
    select 1 from ${externalIdentity} ei
    where ei.contribution_id = ${contribution.id}
      and ei.provider = 'razorpay'
      and ei.provider_account = ${mode}
      and ei.entity_type = 'payment'
  )`;
  const inProcessedSettlement = (line: SQL) => sql`exists (
    select 1 from ${gatewaySettlementItem} i
    inner join ${gatewaySettlement} s on s.id = i.settlement_id
    where ${line}
      and s.provider = 'razorpay'
      and s.provider_account = ${mode}
      and s.status = 'processed'
  )`;
  const counted = sql`${contribution.status} in ('received', 'receipted', 'refunded')`;
  const [gifts] = await executor
    .select({
      net: sql<string>`coalesce(sum(${contribution.amountPaise} - ${contribution.gatewayFeePaise} - ${contribution.gatewayTaxPaise}), 0)`,
    })
    .from(contribution)
    .where(
      and(
        razorpayGift,
        counted,
        sql`not ${inProcessedSettlement(sql`i.type = 'payment' and i.contribution_id = ${contribution.id}`)}`
      )
    );
  const [refunds] = await executor
    .select({
      total: sql<string>`coalesce(sum(${contributionRefund.amountPaise}), 0)`,
    })
    .from(contributionRefund)
    .innerJoin(
      contribution,
      eq(contribution.id, contributionRefund.contributionId)
    )
    .where(
      and(
        razorpayGift,
        counted,
        eq(contributionRefund.source, "razorpay"),
        sql`not ${inProcessedSettlement(sql`i.type = 'refund' and i.contribution_refund_id = ${contributionRefund.id}`)}`
      )
    );
  const s = gatewaySettlement;
  const inYear = sql`${s.settledOn} between ${fy.startsOn} and ${fy.endsOn}`;
  const [settled] = await executor
    .select({
      fees: sql<string>`coalesce(sum(${s.feesPaise} + ${s.taxPaise} + coalesce(${s.settlementFeePaise}, 0) + coalesce(${s.settlementTaxPaise}, 0)) filter (where ${inYear}), 0)`,
      year: sql<string>`coalesce(sum(${s.amountPaise}) filter (where ${inYear}), 0)`,
    })
    .from(s)
    .where(
      and(
        eq(s.provider, "razorpay"),
        eq(s.providerAccount, mode),
        eq(s.status, "processed")
      )
    );
  const [missing] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(gatewaySettlementItem)
    .innerJoin(s, eq(s.id, gatewaySettlementItem.settlementId))
    .where(
      and(
        eq(s.provider, "razorpay"),
        eq(s.providerAccount, mode),
        eq(s.status, "processed"),
        eq(gatewaySettlementItem.type, "payment"),
        sql`${gatewaySettlementItem.contributionId} is null`
      )
    );
  return {
    awaitingPaise: Number(gifts?.net ?? 0) - Number(refunds?.total ?? 0),
    feesThisYearPaise: Number(settled?.fees ?? 0),
    settledPaymentsNotImported: Number(missing?.n ?? 0),
    settledThisYearPaise: Number(settled?.year ?? 0),
  };
}

/** For Settings → Integrations: the latest settlement synced for a mode, and lines still unlinked. */
export async function razorpaySettlementStatus(mode: string): Promise<{
  lastSettledOn: string | null;
  lastSyncedAt: Date | null;
  unlinked: number;
}> {
  const [row] = await db
    .select({
      lastSettledOn: max(gatewaySettlement.settledOn),
      lastSyncedAt: max(gatewaySettlement.updatedAt),
    })
    .from(gatewaySettlement)
    .where(
      and(
        eq(gatewaySettlement.provider, "razorpay"),
        eq(gatewaySettlement.providerAccount, mode)
      )
    );
  const [lines] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .where(
      and(
        eq(gatewaySettlement.provider, "razorpay"),
        eq(gatewaySettlement.providerAccount, mode),
        sql`((${gatewaySettlementItem.type} = 'payment' and ${gatewaySettlementItem.contributionId} is null)
          or (${gatewaySettlementItem.type} = 'refund' and ${gatewaySettlementItem.contributionRefundId} is null))`
      )
    );
  return {
    lastSettledOn: row?.lastSettledOn ?? null,
    lastSyncedAt: row?.lastSyncedAt ?? null,
    unlinked: Number(lines?.n ?? 0),
  };
}

/**
 * Whether a processed settlement has paid this contribution out, which
 * fixes its amount, donor, date, account and channel and blocks its
 * deletion (the Zero mutator checks the same). For people who cannot sync
 * settlements.
 */
export async function isContributionSettlementLocked(
  contributionId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: gatewaySettlementItem.id })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .where(
      and(
        eq(gatewaySettlementItem.contributionId, contributionId),
        eq(gatewaySettlementItem.type, "payment"),
        eq(gatewaySettlement.status, "processed")
      )
    )
    .limit(1);
  return row !== undefined;
}
