import { todayInKolkata } from "@pi-dash/shared/income";
import {
  type IncomeSourceType,
  INCOME_SOURCE_TYPES,
  LEDGER_CUTOVER_ON,
  LEDGER_SKIP_REASONS,
  LEDGER_SOURCE_LABELS,
  LEDGER_SOURCE_TYPES,
  LEDGER_WAIT_REASONS,
  ledgerReasonLabel,
  type LedgerSourceStatus,
} from "@pi-dash/shared/ledger";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { accountHead, orgAccount } from "../schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "../schema/gateway-settlement";
import {
  contribution,
  contributionRefund,
  otherIncome,
} from "../schema/income";
import {
  accountMovement,
  ledgerEntry,
  ledgerSourceState,
  posting,
} from "../schema/ledger";
import { statementLine } from "../schema/statement-line";
import { type LedgerTx, post, type PostingRow, reverse } from "./engine";
import {
  type ContributionFacts,
  contributionPlan,
  GATEWAY_CHANNELS,
  headsOf,
  type OtherIncomeFacts,
  otherIncomePlan,
  type PlanPart,
  type RefundFacts,
  refundPlan,
  type SettlementFacts,
  settlementPlan,
  type SourcePlan,
  type StatementTransferFacts,
  statementTransferPlan,
} from "./income-rules";
import { type EntryInput, LedgerError, type MovementInput } from "./rules";

/**
 * Income posting (finance Phase 3, layer 3-2), server only. One call looks
 * at one source (a contribution, refund, other income, gateway settlement
 * or bank transfer line), works out what the books should hold for it from
 * the rules in `income-rules.ts`, compares that with the postings standing
 * for it, and reverses and reposts only what differs. So it is idempotent
 * (a second call with nothing changed writes nothing), it backfills (a
 * source never posted is posted), and it follows edits and deletions:
 *
 * - a recognition-only change (programme, project, fund, donor) reverses
 *   and reposts the `recognise` part alone;
 * - any change to the money (amount, date, account, channel) reverses and
 *   reposts both parts;
 * - a deleted source, or one that no longer posts, is reversed.
 *
 * A repost after a reversal takes the next `source_revision`, as the engine
 * requires. The source is locked for the whole look (the engine's advisory
 * lock, re-entered by the engine), and the writes run in a savepoint so a
 * refusal (a closed year) leaves the books untouched and is recorded in
 * `ledger_source_state` as waiting, with its reason.
 */

export interface IncomeSource {
  sourceId: string;
  sourceType: IncomeSourceType;
}

export interface IncomePostingResult {
  posted: number;
  reason: string | null;
  reversed: number;
  status: LedgerSourceStatus;
}

interface Context {
  actorId: string | null;
  now?: Date;
}

const sourceKey = (s: IncomeSource) => `${s.sourceType}:${s.sourceId}`;

async function lockSource(tx: LedgerTx, source: IncomeSource) {
  // The engine's own per-source lock; advisory locks stack in a session.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ledger:${source.sourceType}:${source.sourceId}`}, 0))`
  );
}

// ── Facts ───────────────────────────────────────────────────────────────────

/** Earliest day a processed payout that settled the gift reached the bank. */
async function giftSettledBankOn(
  tx: LedgerTx,
  contributionId: string
): Promise<string | null> {
  const [row] = await tx
    .select({
      // As text: a computed date would come back as a Date object.
      day: sql<
        string | null
      >`min(coalesce(${statementLine.valueOn}, ${gatewaySettlement.settledOn}))::text`,
    })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .leftJoin(
      statementLine,
      eq(statementLine.matchedSettlementId, gatewaySettlement.id)
    )
    .where(
      and(
        eq(gatewaySettlementItem.contributionId, contributionId),
        eq(gatewaySettlementItem.type, "payment"),
        eq(gatewaySettlement.status, "processed")
      )
    );
  return row?.day ?? null;
}

async function contributionFacts(
  tx: LedgerTx,
  id: string
): Promise<ContributionFacts | null> {
  const [row] = await tx
    .select()
    .from(contribution)
    .where(eq(contribution.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  // Only a gateway gift captured before the cutover needs its payout day.
  const settledBankOn =
    row.receivedOn < LEDGER_CUTOVER_ON && GATEWAY_CHANNELS.includes(row.channel)
      ? await giftSettledBankOn(tx, id)
      : null;
  return {
    amountPaise: row.amountPaise,
    channel: row.channel,
    fundId: row.fundId,
    gatewayFeePaise: row.gatewayFeePaise,
    gatewayTaxPaise: row.gatewayTaxPaise,
    id: row.id,
    orgAccountId: row.orgAccountId,
    partyId: row.partyId,
    programmeId: row.programmeId,
    projectId: row.projectId,
    receivedOn: row.receivedOn,
    reference: row.reference,
    settledBankOn,
    status: row.status,
  };
}

async function refundFacts(
  tx: LedgerTx,
  id: string
): Promise<RefundFacts | null> {
  const [row] = await tx
    .select({
      amountPaise: contributionRefund.amountPaise,
      channel: contribution.channel,
      fundId: contribution.fundId,
      id: contributionRefund.id,
      orgAccountId: contribution.orgAccountId,
      partyId: contribution.partyId,
      programmeId: contribution.programmeId,
      projectId: contribution.projectId,
      reference: contributionRefund.reference,
      refundedOn: contributionRefund.refundedOn,
    })
    .from(contributionRefund)
    .innerJoin(
      contribution,
      eq(contribution.id, contributionRefund.contributionId)
    )
    .where(eq(contributionRefund.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    amountPaise: row.amountPaise,
    gift: {
      channel: row.channel,
      fundId: row.fundId,
      orgAccountId: row.orgAccountId,
      partyId: row.partyId,
      programmeId: row.programmeId,
      projectId: row.projectId,
    },
    id: row.id,
    reference: row.reference,
    refundedOn: row.refundedOn,
  };
}

async function otherIncomeFacts(
  tx: LedgerTx,
  id: string
): Promise<OtherIncomeFacts | null> {
  const [row] = await tx
    .select({
      accountKind: orgAccount.kind,
      amountPaise: otherIncome.amountPaise,
      fundId: otherIncome.fundId,
      id: otherIncome.id,
      kind: otherIncome.kind,
      orgAccountId: otherIncome.orgAccountId,
      receivedOn: otherIncome.receivedOn,
    })
    .from(otherIncome)
    .innerJoin(orgAccount, eq(orgAccount.id, otherIncome.orgAccountId))
    .where(eq(otherIncome.id, id))
    .limit(1);
  return row ?? null;
}

async function settlementFacts(
  tx: LedgerTx,
  id: string
): Promise<SettlementFacts | null> {
  const [row] = await tx
    .select()
    .from(gatewaySettlement)
    .where(eq(gatewaySettlement.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const [line] = await tx
    .select({
      orgAccountId: statementLine.orgAccountId,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .where(
      and(
        eq(statementLine.matchedSettlementId, id),
        eq(statementLine.matchStatus, "matched")
      )
    )
    .limit(1);
  const banks = await tx
    .select({ id: orgAccount.id })
    .from(orgAccount)
    .where(and(eq(orgAccount.kind, "bank"), eq(orgAccount.active, true)));
  // The account its standing transfer paid into, if it is posted.
  const reversal = alias(posting, "reversal");
  const [posted] = await tx
    .select({ orgAccountId: accountMovement.orgAccountId })
    .from(accountMovement)
    .innerJoin(posting, eq(posting.id, accountMovement.postingId))
    .leftJoin(reversal, eq(reversal.reversesPostingId, posting.id))
    .where(
      and(
        eq(posting.sourceType, LEDGER_SOURCE_TYPES.gatewaySettlement),
        eq(posting.sourceId, id),
        isNull(posting.reversesPostingId),
        isNull(reversal.id),
        eq(accountMovement.kind, "transfer"),
        eq(accountMovement.direction, "in")
      )
    )
    .limit(1);
  const items = await tx
    .select({
      contributionId: gatewaySettlementItem.contributionId,
      contributionRefundId: gatewaySettlementItem.contributionRefundId,
      feePaise: gatewaySettlementItem.feePaise,
      fundId: contribution.fundId,
      giftFeePaise: contribution.gatewayFeePaise,
      giftTaxPaise: contribution.gatewayTaxPaise,
      partyId: contribution.partyId,
      programmeId: contribution.programmeId,
      projectId: contribution.projectId,
      taxPaise: gatewaySettlementItem.taxPaise,
      type: gatewaySettlementItem.type,
    })
    .from(gatewaySettlementItem)
    .leftJoin(
      contribution,
      eq(contribution.id, gatewaySettlementItem.contributionId)
    )
    .where(eq(gatewaySettlementItem.settlementId, id))
    .orderBy(asc(gatewaySettlementItem.id));
  return {
    activeBankAccountIds: banks.map((b) => b.id),
    amountPaise: row.amountPaise,
    bankLine: line ?? null,
    clearingAccountId: row.orgAccountId,
    id: row.id,
    postedBankAccountId: posted?.orgAccountId ?? null,
    items: items.map((item) => ({
      feePaise: item.feePaise,
      giftChargesPaise: (item.giftFeePaise ?? 0) + (item.giftTaxPaise ?? 0),
      gift:
        item.contributionId && item.fundId && item.partyId
          ? {
              fundId: item.fundId,
              partyId: item.partyId,
              programmeId: item.programmeId,
              projectId: item.projectId,
            }
          : null,
      refundLinked: item.contributionRefundId !== null,
      taxPaise: item.taxPaise,
      type: item.type,
    })),
    provider: row.provider,
    settledOn: row.settledOn,
    settlementFeePaise: row.settlementFeePaise,
    settlementTaxPaise: row.settlementTaxPaise,
    status: row.status,
    utr: row.utr,
  };
}

async function statementTransferFacts(
  tx: LedgerTx,
  id: string
): Promise<StatementTransferFacts | null> {
  const other = alias(orgAccount, "other_account");
  const [row] = await tx
    .select({
      amountPaise: statementLine.amountPaise,
      direction: statementLine.direction,
      id: statementLine.id,
      matchKind: statementLine.matchKind,
      matchStatus: statementLine.matchStatus,
      orgAccountId: statementLine.orgAccountId,
      otherId: other.id,
      otherKind: other.kind,
      reference: statementLine.reference,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .leftJoin(other, eq(other.id, statementLine.transferOrgAccountId))
    .where(eq(statementLine.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    amountPaise: row.amountPaise,
    direction: row.direction,
    id: row.id,
    isTransfer: row.matchStatus === "matched" && row.matchKind === "transfer",
    orgAccountId: row.orgAccountId,
    other:
      row.otherId && row.otherKind
        ? { id: row.otherId, kind: row.otherKind }
        : null,
    reference: row.reference,
    valueOn: row.valueOn,
  };
}

/** What the books should hold for a source, from its current record. */
export async function planIncomeSource(
  tx: LedgerTx,
  source: IncomeSource
): Promise<SourcePlan> {
  switch (source.sourceType) {
    case LEDGER_SOURCE_TYPES.contribution:
      return contributionPlan(await contributionFacts(tx, source.sourceId));
    case LEDGER_SOURCE_TYPES.contributionRefund:
      return refundPlan(await refundFacts(tx, source.sourceId));
    case LEDGER_SOURCE_TYPES.otherIncome:
      return otherIncomePlan(await otherIncomeFacts(tx, source.sourceId));
    case LEDGER_SOURCE_TYPES.gatewaySettlement:
      return settlementPlan(await settlementFacts(tx, source.sourceId));
    case LEDGER_SOURCE_TYPES.statementTransfer:
      return statementTransferPlan(
        await statementTransferFacts(tx, source.sourceId)
      );
    default:
      throw new LedgerError("invalid", "Not an income source");
  }
}

// ── Comparing with what stands ──────────────────────────────────────────────

type Canon = (string | number | null)[];

function entryCanon(e: EntryInput, day: string): Canon {
  return [
    e.accountHeadId,
    e.effect,
    e.amountPaise,
    e.fundId,
    e.programmeId ?? null,
    e.projectId ?? null,
    e.eventId ?? null,
    e.partyId ?? null,
    e.costCentreId ?? null,
    e.medium ?? "monetary",
    e.memo ?? null,
    e.economicOn ?? day,
    e.sourceLineId ?? null,
  ];
}

function movementCanon(m: MovementInput, day: string): Canon {
  return [
    m.orgAccountId,
    m.direction,
    m.amountPaise,
    m.kind,
    m.occurredOn ?? day,
    m.transferId ?? null,
    m.paymentReference ?? null,
    m.memo ?? null,
    m.bankValueOn ?? null,
  ];
}

/** A part's content as a comparable string; order of lines doesn't matter. */
function partKey(
  day: string,
  entries: readonly EntryInput[],
  movements: readonly MovementInput[]
): string {
  const lines = (canons: Canon[]) =>
    canons.map((c) => JSON.stringify(c)).sort();
  return JSON.stringify({
    day,
    entries: lines(entries.map((e) => entryCanon(e, day))),
    movements: lines(movements.map((m) => movementCanon(m, day))),
  });
}

interface Standing {
  hasMovements: boolean;
  key: string;
  posting: PostingRow;
}

/** Every posting for the source, and the ones that stand (not reversed, not reversals). */
async function standingPostings(tx: LedgerTx, source: IncomeSource) {
  const all = await tx
    .select()
    .from(posting)
    .where(
      and(
        eq(posting.sourceType, source.sourceType),
        eq(posting.sourceId, source.sourceId)
      )
    );
  const reversed = new Set(
    all.flatMap((p) => (p.reversesPostingId ? [p.reversesPostingId] : []))
  );
  const live = all.filter((p) => !(p.reversesPostingId || reversed.has(p.id)));
  const ids = live.map((p) => p.id);
  const entries =
    ids.length > 0
      ? await tx
          .select()
          .from(ledgerEntry)
          .where(inArray(ledgerEntry.postingId, ids))
      : [];
  const movements =
    ids.length > 0
      ? await tx
          .select()
          .from(accountMovement)
          .where(inArray(accountMovement.postingId, ids))
      : [];
  const standing: Standing[] = live.map((p) => {
    const own = movements.filter((m) => m.postingId === p.id);
    return {
      hasMovements: own.length > 0,
      key: partKey(
        p.economicOn,
        entries.filter((e) => e.postingId === p.id),
        own
      ),
      posting: p,
    };
  });
  const maxRevision = all.reduce((m, p) => Math.max(m, p.sourceRevision), 0);
  return { maxRevision, standing };
}

// ── State ───────────────────────────────────────────────────────────────────

interface StateInput {
  attention?: number;
  economicOn: string | null;
  message?: string | null;
  postedOn?: string | null;
  reason: string | null;
  status: LedgerSourceStatus;
}

async function saveState(
  tx: LedgerTx,
  source: IncomeSource,
  state: StateInput,
  now: Date
) {
  const values = {
    attentionCount: state.attention ?? 0,
    checkedAt: now,
    economicOn: state.economicOn,
    message: state.message ?? null,
    postedOn: state.postedOn ?? null,
    reason: state.reason,
    status: state.status,
  };
  await tx
    .insert(ledgerSourceState)
    .values({ ...values, id: uuidv7(), ...source })
    .onConflictDoUpdate({
      set: values,
      target: [ledgerSourceState.sourceType, ledgerSourceState.sourceId],
    });
}

async function clearState(tx: LedgerTx, source: IncomeSource) {
  await tx
    .delete(ledgerSourceState)
    .where(
      and(
        eq(ledgerSourceState.sourceType, source.sourceType),
        eq(ledgerSourceState.sourceId, source.sourceId)
      )
    );
}

/** Records that a source couldn't be looked at, after its transaction failed. */
export async function recordIncomeSourceFailure(
  tx: LedgerTx,
  source: IncomeSource,
  now: Date = new Date()
) {
  await saveState(
    tx,
    source,
    {
      economicOn: null,
      message:
        "Something went wrong; it is tried again with the next posting run",
      reason: LEDGER_WAIT_REASONS.error,
      status: "waiting",
    },
    now
  );
}

async function missingHeads(tx: LedgerTx, ids: readonly string[]) {
  if (ids.length === 0) {
    return false;
  }
  const rows = await tx
    .select({ id: accountHead.id })
    .from(accountHead)
    .where(inArray(accountHead.id, [...ids]));
  return rows.length < ids.length;
}

function reversalReason(source: IncomeSource, plan: SourcePlan): string {
  const label = LEDGER_SOURCE_LABELS[source.sourceType].toLowerCase();
  if (plan.kind === "none") {
    return plan.reason === LEDGER_SKIP_REASONS.deleted
      ? `The ${label} was deleted`
      : `The ${label} no longer posts: ${ledgerReasonLabel(plan.reason)}`;
  }
  return `The ${label} changed`;
}

// ── Posting one source ──────────────────────────────────────────────────────

/**
 * Brings the books in line with one income source, in the caller's
 * transaction. Returns what it did; a refusal from the books is recorded as
 * waiting, never thrown.
 */
export async function postIncomeSource(
  tx: LedgerTx,
  source: IncomeSource,
  context: Context
): Promise<IncomePostingResult> {
  const now = context.now ?? new Date();
  await lockSource(tx, source);
  let plan = await planIncomeSource(tx, source);
  if (plan.kind === "post" && (await missingHeads(tx, headsOf(plan)))) {
    plan = {
      economicOn: plan.economicOn,
      kind: "wait",
      reason: LEDGER_WAIT_REASONS.referenceDataMissing,
    };
  }
  const { maxRevision, standing } = await standingPostings(tx, source);

  if (plan.kind === "wait") {
    await saveState(
      tx,
      source,
      { economicOn: plan.economicOn, reason: plan.reason, status: "waiting" },
      now
    );
    return { posted: 0, reason: plan.reason, reversed: 0, status: "waiting" };
  }

  const desired = new Map<string, PlanPart>(
    plan.kind === "post" ? plan.parts.map((p) => [p.action, p]) : []
  );
  const byAction = new Map<string, Standing[]>();
  for (const s of standing) {
    byAction.set(s.posting.action, [
      ...(byAction.get(s.posting.action) ?? []),
      s,
    ]);
  }
  const changed = new Set<string>();
  for (const action of new Set([...desired.keys(), ...byAction.keys()])) {
    const want = desired.get(action);
    const have = byAction.get(action) ?? [];
    if (
      !want ||
      have.length !== 1 ||
      have[0]?.key !== partKey(want.economicOn, want.entries, want.movements)
    ) {
      changed.add(action);
    }
  }
  // Money changed: the whole posting is reversed and reposted, so the
  // recognition and its movements always share a revision.
  const moneyChanged = [...changed].some(
    (action) =>
      (desired.get(action)?.movements.length ?? 0) > 0 ||
      (byAction.get(action) ?? []).some((s) => s.hasMovements)
  );
  const redo = moneyChanged
    ? new Set([...desired.keys(), ...byAction.keys()])
    : changed;
  const economicOn =
    plan.kind === "post"
      ? plan.economicOn
      : (standing[0]?.posting.economicOn ?? null);

  if (redo.size === 0) {
    return await settle(tx, source, plan, standing, now, {
      economicOn,
      posted: 0,
      reversed: 0,
    });
  }

  try {
    const counts = await tx.transaction(async (sp) => {
      let reversed = 0;
      let posted = 0;
      const reason = reversalReason(source, plan);
      for (const s of standing) {
        if (redo.has(s.posting.action)) {
          await reverse(sp, s.posting.id, {
            actorId: context.actorId,
            now,
            reason,
          });
          reversed += 1;
        }
      }
      const revision = maxRevision + 1;
      for (const part of desired.values()) {
        if (!redo.has(part.action)) {
          continue;
        }
        await post(
          sp,
          {
            action: part.action,
            economicOn: part.economicOn,
            entries: part.entries,
            movements: part.movements,
            sourceId: source.sourceId,
            sourceRevision: revision,
            sourceType: source.sourceType,
          },
          { actorId: context.actorId, now }
        );
        posted += 1;
      }
      return { posted, reversed };
    });
    const after = await standingPostings(tx, source);
    return await settle(tx, source, plan, after.standing, now, {
      economicOn,
      ...counts,
    });
  } catch (error) {
    if (!(error instanceof LedgerError)) {
      throw error;
    }
    const reason =
      error.code === "closed_year"
        ? LEDGER_WAIT_REASONS.closedYear
        : LEDGER_WAIT_REASONS.error;
    await saveState(
      tx,
      source,
      {
        economicOn,
        message: error.code === "closed_year" ? null : error.message,
        reason,
        status: "waiting",
      },
      now
    );
    return { posted: 0, reason, reversed: 0, status: "waiting" };
  }
}

/** Records where the source stands once the books match it. */
async function settle(
  tx: LedgerTx,
  source: IncomeSource,
  plan: SourcePlan,
  standing: readonly Standing[],
  now: Date,
  done: { economicOn: string | null; posted: number; reversed: number }
): Promise<IncomePostingResult> {
  if (plan.kind === "none") {
    if (plan.reason === LEDGER_SKIP_REASONS.deleted) {
      await clearState(tx, source);
    } else {
      await saveState(
        tx,
        source,
        { economicOn: null, reason: plan.reason, status: "none" },
        now
      );
    }
    return { ...done, reason: plan.reason, status: "none" };
  }
  const postedOn =
    standing
      .map((s) => s.posting.postedOn)
      .sort()
      .at(-1) ?? todayInKolkata(now);
  await saveState(
    tx,
    source,
    {
      attention: plan.kind === "post" ? plan.attention : 0,
      economicOn: done.economicOn,
      postedOn,
      reason: null,
      status: "posted",
    },
    now
  );
  return {
    posted: done.posted,
    reason: null,
    reversed: done.reversed,
    status: "posted",
  };
}

// ── Related sources ─────────────────────────────────────────────────────────

/**
 * Sources whose books depend on this one, posted after it: a gift's
 * refunds and payouts (their charges carry its programme and fund, and a
 * Razorpay payout posts a line's charges only when the gift has none), and
 * a payout's gifts captured before the cutover (they post on its bank day).
 */
export async function relatedIncomeSources(
  tx: LedgerTx,
  source: IncomeSource
): Promise<IncomeSource[]> {
  if (source.sourceType === LEDGER_SOURCE_TYPES.contribution) {
    const refunds = await tx
      .select({ id: contributionRefund.id })
      .from(contributionRefund)
      .where(eq(contributionRefund.contributionId, source.sourceId));
    const payouts = await tx
      .selectDistinct({ id: gatewaySettlement.id })
      .from(gatewaySettlementItem)
      .innerJoin(
        gatewaySettlement,
        eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
      )
      .where(
        and(
          eq(gatewaySettlementItem.contributionId, source.sourceId),
          eq(gatewaySettlement.status, "processed")
        )
      );
    return [
      ...refunds.map((r) => ({
        sourceId: r.id,
        sourceType: LEDGER_SOURCE_TYPES.contributionRefund,
      })),
      ...payouts.map((p) => ({
        sourceId: p.id,
        sourceType: LEDGER_SOURCE_TYPES.gatewaySettlement,
      })),
    ];
  }
  if (source.sourceType === LEDGER_SOURCE_TYPES.gatewaySettlement) {
    const gifts = await tx
      .selectDistinct({ id: contribution.id })
      .from(gatewaySettlementItem)
      .innerJoin(
        contribution,
        eq(contribution.id, gatewaySettlementItem.contributionId)
      )
      .where(
        and(
          eq(gatewaySettlementItem.settlementId, source.sourceId),
          lt(contribution.receivedOn, LEDGER_CUTOVER_ON)
        )
      );
    return gifts.map((g) => ({
      sourceId: g.id,
      sourceType: LEDGER_SOURCE_TYPES.contribution,
    }));
  }
  return [];
}

// ── The sweep ───────────────────────────────────────────────────────────────

/**
 * Every income source the books may need to look at: everything dated in
 * the posting window (from the cutover), gateway gifts a processed payout
 * settled (the cutover exception), every source with postings (to follow
 * edits and deletions), and everything waiting. Ordered for a stable,
 * resumable run.
 */
export async function listIncomeSources(tx: LedgerTx): Promise<IncomeSource[]> {
  const settledGifts = tx
    .select({ id: gatewaySettlementItem.contributionId })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .where(
      and(
        eq(gatewaySettlement.status, "processed"),
        isNotNull(gatewaySettlementItem.contributionId)
      )
    );
  const gifts = await tx
    .select({ id: contribution.id })
    .from(contribution)
    .where(
      or(
        gte(contribution.receivedOn, LEDGER_CUTOVER_ON),
        inArray(contribution.id, settledGifts)
      )
    );
  const refunds = await tx
    .select({ id: contributionRefund.id })
    .from(contributionRefund)
    .where(gte(contributionRefund.refundedOn, LEDGER_CUTOVER_ON));
  const incomes = await tx
    .select({ id: otherIncome.id })
    .from(otherIncome)
    .where(gte(otherIncome.receivedOn, LEDGER_CUTOVER_ON));
  const payouts = await tx
    .select({ id: gatewaySettlement.id })
    .from(gatewaySettlement)
    .where(eq(gatewaySettlement.status, "processed"));
  const transfers = await tx
    .select({ id: statementLine.id })
    .from(statementLine)
    .where(
      and(
        eq(statementLine.matchKind, "transfer"),
        gte(statementLine.valueOn, LEDGER_CUTOVER_ON)
      )
    );
  const posted = await tx
    .selectDistinct({ id: posting.sourceId, type: posting.sourceType })
    .from(posting)
    .where(inArray(posting.sourceType, [...INCOME_SOURCE_TYPES]));
  const waiting = await tx
    .select({
      id: ledgerSourceState.sourceId,
      type: ledgerSourceState.sourceType,
    })
    .from(ledgerSourceState)
    .where(eq(ledgerSourceState.status, "waiting"));

  const T = LEDGER_SOURCE_TYPES;
  const all: IncomeSource[] = [
    ...gifts.map((r) => ({ sourceId: r.id, sourceType: T.contribution })),
    ...refunds.map((r) => ({
      sourceId: r.id,
      sourceType: T.contributionRefund,
    })),
    ...incomes.map((r) => ({ sourceId: r.id, sourceType: T.otherIncome })),
    ...payouts.map((r) => ({
      sourceId: r.id,
      sourceType: T.gatewaySettlement,
    })),
    ...transfers.map((r) => ({
      sourceId: r.id,
      sourceType: T.statementTransfer,
    })),
    ...[...posted, ...waiting].flatMap((r) =>
      (INCOME_SOURCE_TYPES as readonly string[]).includes(r.type)
        ? [{ sourceId: r.id, sourceType: r.type as IncomeSourceType }]
        : []
    ),
  ];
  const seen = new Set<string>();
  const order = INCOME_SOURCE_TYPES as readonly string[];
  return all
    .filter((s) => {
      const key = sourceKey(s);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        order.indexOf(a.sourceType) - order.indexOf(b.sourceType) ||
        a.sourceId.localeCompare(b.sourceId)
    );
}

export interface SweepResult {
  checked: number;
  failed: number;
  posted: number;
  /** Sources not reached before the deadline. */
  remaining: number;
  reversed: number;
  waiting: number;
}

/** Runs work in its own transaction (a savepoint in tests). */
export type TransactionRunner = <T>(
  work: (tx: LedgerTx) => Promise<T>
) => Promise<T>;

/**
 * Posts every source that isn't up to date, one transaction per source so
 * one failure or one closed year never holds up the rest. Safe to rerun:
 * an up-to-date source writes nothing. Stops at the deadline (epoch ms),
 * leaving the rest for the next run.
 */
export async function sweepIncomeSources(options: {
  actorId: string | null;
  deadline?: number;
  now?: () => Date;
  onFailure?: (source: IncomeSource, error: unknown) => void;
  run: TransactionRunner;
}): Promise<SweepResult> {
  const clock = options.now ?? (() => new Date());
  const sources = await options.run((tx) => listIncomeSources(tx));
  const result: SweepResult = {
    checked: 0,
    failed: 0,
    posted: 0,
    remaining: 0,
    reversed: 0,
    waiting: 0,
  };
  for (const [index, source] of sources.entries()) {
    if (options.deadline !== undefined && Date.now() > options.deadline) {
      result.remaining = sources.length - index;
      break;
    }
    result.checked += 1;
    try {
      const outcome = await options.run((tx) =>
        postIncomeSource(tx, source, {
          actorId: options.actorId,
          now: clock(),
        })
      );
      result.posted += outcome.posted;
      result.reversed += outcome.reversed;
      if (outcome.status === "waiting") {
        result.waiting += 1;
      }
    } catch (error) {
      result.failed += 1;
      options.onFailure?.(source, error);
      try {
        await options.run((tx) => recordIncomeSourceFailure(tx, source));
      } catch {
        // The failure is reported; the next run tries the source again.
      }
    }
  }
  return result;
}

// ── Waiting ─────────────────────────────────────────────────────────────────

/** Sources waiting to post with a date in the range, by reason (for the year close). */
export async function waitingByReason(
  tx: LedgerTx,
  range: { endsOn: string; startsOn: string }
): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      count: sql<number>`count(*)::int`,
      reason: ledgerSourceState.reason,
    })
    .from(ledgerSourceState)
    .where(
      and(
        eq(ledgerSourceState.status, "waiting"),
        or(
          and(
            gte(ledgerSourceState.economicOn, range.startsOn),
            lte(ledgerSourceState.economicOn, range.endsOn)
          ),
          // A failure before its date was known counts against every year.
          sql`${ledgerSourceState.economicOn} is null`
        )
      )
    )
    .groupBy(ledgerSourceState.reason);
  return new Map(rows.map((r) => [r.reason ?? "", Number(r.count)]));
}
