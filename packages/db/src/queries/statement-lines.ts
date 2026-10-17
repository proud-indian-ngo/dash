import type {
  ImportRowOutcome,
  StatementLineMatchKind,
} from "@pi-dash/shared/constants";
import { CONTRIBUTION_RECEIVED_STATUSES } from "@pi-dash/shared/income";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "..";
import { shareYearCloseLock } from "../ledger/income-posting";
import { fiscalYear, orgAccount } from "../schema/finance-dimensions";
import { gatewaySettlement } from "../schema/gateway-settlement";
import { importBatch } from "../schema/import-batch";
import { contribution } from "../schema/income";
import { party } from "../schema/party";
import { importRow } from "../schema/private/imports";
import { statementLine } from "../schema/statement-line";

/**
 * Database access for bank statement lines: storing an upload's lines,
 * the candidates matching looks at, and the match, ignore and unmatch
 * writes. Narration never leaves this module except to the server functions
 * that send it to finance.view holders.
 */

export type StatementTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StatementLineRecord = typeof statementLine.$inferSelect;
type Reader = Pick<typeof db, "select">;

const CHUNK = 500;

/**
 * Serialises every write to statement lines (imports, matching and the
 * reviewer's actions), so two of them never pick the same settlement or
 * contribution for different lines. Transaction-scoped.
 */
export const STATEMENT_LINE_LOCK = sql`select pg_advisory_xact_lock(hashtext('statement-line-match'))`;

/**
 * Also shares the year close's lock (`ledger:year_close`, taken exclusively
 * by `closeYear`), first as the ledger does, so a year never closes between
 * a write's closed-year check and its commit.
 */
export async function withStatementTransaction<T>(
  work: (tx: StatementTx) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await shareYearCloseLock(tx);
    await tx.execute(STATEMENT_LINE_LOCK);
    return await work(tx);
  });
}

/** Channels of money deposited straight into a bank account. */
export const DIRECT_DEPOSIT_CHANNELS = [
  "upi",
  "neft",
  "cheque",
  "cash",
] as const;

export async function findBankAccount(
  id: string,
  executor: Reader = db
): Promise<{ active: boolean; kind: string; name: string } | null> {
  const [row] = await executor
    .select({
      active: orgAccount.active,
      kind: orgAccount.kind,
      name: orgAccount.name,
    })
    .from(orgAccount)
    .where(eq(orgAccount.id, id));
  return row ?? null;
}

/** The mapping and date format of the latest reviewed statement for this account. */
export async function latestBankMapping(orgAccountId: string): Promise<{
  dateFormat: string | null;
  mapping: Record<string, string>;
} | null> {
  const [row] = await db
    .select({
      dateFormat: importBatch.dateFormat,
      mapping: importBatch.mapping,
    })
    .from(importBatch)
    .where(
      and(
        eq(importBatch.source, "bank_csv"),
        eq(importBatch.orgAccountId, orgAccountId),
        isNotNull(importBatch.mapping)
      )
    )
    .orderBy(desc(importBatch.updatedAt))
    .limit(1);
  return row?.mapping
    ? {
        dateFormat: row.dateFormat,
        mapping: row.mapping as Record<string, string>,
      }
    : null;
}

/** Which of these line hashes the account already has. */
export async function findExistingLineHashes(
  orgAccountId: string,
  hashes: readonly string[],
  executor: Reader = db
): Promise<Set<string>> {
  const found = new Set<string>();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await executor
      .select({ lineHash: statementLine.lineHash })
      .from(statementLine)
      .where(
        and(
          eq(statementLine.orgAccountId, orgAccountId),
          inArray(statementLine.lineHash, unique.slice(i, i + CHUNK))
        )
      );
    for (const row of rows) {
      found.add(row.lineHash);
    }
  }
  return found;
}

/** Inserts lines the account does not have yet; returns the hashes inserted. */
export async function insertStatementLines(
  tx: StatementTx,
  rows: (typeof statementLine.$inferInsert)[]
): Promise<Set<string>> {
  const inserted = new Set<string>();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const result = await tx
      .insert(statementLine)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing({
        target: [statementLine.orgAccountId, statementLine.lineHash],
      })
      .returning({ lineHash: statementLine.lineHash });
    for (const row of result) {
      inserted.add(row.lineHash);
    }
  }
  return inserted;
}

/** Sets one outcome on many import rows at once. */
export async function setStatementRowOutcomes(
  tx: StatementTx,
  ids: readonly string[],
  patch: {
    decidedAt: Date;
    decidedBy: string | null;
    outcome: ImportRowOutcome;
    outcomeReason: string | null;
  }
): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    await tx
      .update(importRow)
      .set(patch)
      .where(inArray(importRow.id, ids.slice(i, i + CHUNK)));
  }
}

export interface MatchInputs {
  contributions: {
    amountPaise: number;
    id: string;
    receivedOn: string;
    reference: string | null;
  }[];
  lines: StatementLineRecord[];
  settlements: {
    amountPaise: number;
    id: string;
    settledOn: string;
    utr: string | null;
  }[];
}

/** Settlements and contributions no line is matched to. */
const settlementUnmatched = sql`not exists (
  select 1 from ${statementLine} sl where sl.matched_settlement_id = ${gatewaySettlement.id}
)`;
/**
 * Processed payouts that no statement line holds: give.do's live account,
 * plus Razorpay only in the mode configured on this server.
 */
const settlementCandidate = (mode: string | null) =>
  and(
    or(
      and(
        eq(gatewaySettlement.provider, "give_do"),
        eq(gatewaySettlement.providerAccount, "live")
      ),
      ...(mode
        ? [
            and(
              eq(gatewaySettlement.provider, "razorpay"),
              eq(gatewaySettlement.providerAccount, mode)
            ),
          ]
        : [])
    ),
    eq(gatewaySettlement.status, "processed"),
    settlementUnmatched
  );
const contributionUnmatched = sql`not exists (
  select 1 from ${statementLine} sl where sl.matched_contribution_id = ${contribution.id}
)`;

/**
 * The account's unmatched lines and what they could match: processed
 * settlements no line holds (any date: a UTR is evidence on its own), and
 * contributions deposited straight into this account, received, held by no
 * line and dated within `window`.
 */
export async function loadMatchInputs(
  tx: Reader,
  orgAccountId: string,
  /** Razorpay's live or test mode on this server; null when Razorpay is off. */
  mode: string | null,
  window: (lines: StatementLineRecord[]) => { from: string; to: string } | null
): Promise<MatchInputs> {
  const lines = await tx
    .select()
    .from(statementLine)
    .where(
      and(
        eq(statementLine.orgAccountId, orgAccountId),
        eq(statementLine.matchStatus, "unmatched")
      )
    )
    .orderBy(asc(statementLine.valueOn), asc(statementLine.id));
  const credits = lines.filter((line) => line.direction === "credit");
  const range = window(credits);
  if (!range) {
    return { contributions: [], lines, settlements: [] };
  }
  const settlements = await tx
    .select({
      amountPaise: gatewaySettlement.amountPaise,
      id: gatewaySettlement.id,
      settledOn: gatewaySettlement.settledOn,
      utr: gatewaySettlement.utr,
    })
    .from(gatewaySettlement)
    .where(settlementCandidate(mode));
  const contributions = await tx
    .select({
      amountPaise: contribution.amountPaise,
      id: contribution.id,
      receivedOn: contribution.receivedOn,
      reference: contribution.reference,
    })
    .from(contribution)
    .where(
      and(
        eq(contribution.orgAccountId, orgAccountId),
        inArray(contribution.channel, [...DIRECT_DEPOSIT_CHANNELS]),
        inArray(contribution.status, [...CONTRIBUTION_RECEIVED_STATUSES]),
        gte(contribution.receivedOn, range.from),
        lte(contribution.receivedOn, range.to),
        contributionUnmatched
      )
    );
  return { contributions, lines, settlements };
}

/** Active bank accounts with an unmatched credit that could equal this payout. */
export async function unmatchedCreditAccountIdsForAmount(
  executor: Reader,
  amountPaise: number
): Promise<string[]> {
  const rows = await executor
    .select({ orgAccountId: statementLine.orgAccountId })
    .from(statementLine)
    .innerJoin(orgAccount, eq(orgAccount.id, statementLine.orgAccountId))
    .where(
      and(
        eq(statementLine.amountPaise, amountPaise),
        eq(statementLine.direction, "credit"),
        eq(statementLine.matchStatus, "unmatched"),
        eq(orgAccount.active, true),
        eq(orgAccount.kind, "bank")
      )
    )
    .groupBy(statementLine.orgAccountId)
    .orderBy(statementLine.orgAccountId);
  return rows.map((row) => row.orgAccountId);
}

export interface LineMatchWrite {
  kind: Extract<
    StatementLineMatchKind,
    "contribution" | "giveindia_payout" | "settlement"
  >;
  reason: string;
  targetId: string | null;
}

const matchColumns = (target: LineMatchWrite) => ({
  matchedContributionId:
    target.kind === "contribution" ? target.targetId : null,
  matchedSettlementId: target.kind === "settlement" ? target.targetId : null,
  matchKind: target.kind,
  matchReason: target.reason,
});

const clearedSuggestion = {
  suggestedContributionId: null,
  suggestedKind: null,
  suggestedSettlementId: null,
  suggestionReason: null,
};

/** Matches an unmatched line; false when it was no longer unmatched. */
export async function matchLine(
  tx: StatementTx,
  lineId: string,
  target: LineMatchWrite,
  actorId: string | null,
  now: Date
): Promise<boolean> {
  const updated = await tx
    .update(statementLine)
    .set({
      ...matchColumns(target),
      ...clearedSuggestion,
      ignoredReason: null,
      matchedAt: now,
      matchedBy: actorId,
      matchStatus: "matched",
      updatedAt: now,
    })
    .where(
      and(
        eq(statementLine.id, lineId),
        eq(statementLine.matchStatus, "unmatched")
      )
    )
    .returning({ id: statementLine.id });
  if (updated.length > 0 && target.kind === "settlement" && target.targetId) {
    await touchSettlement(tx, target.targetId, now);
  }
  return updated.length > 0;
}

/**
 * A payout's bank line was matched or unmatched: its own row is touched so
 * the books' incremental posting sees it (its bank day and account follow
 * the line).
 */
async function touchSettlement(tx: StatementTx, id: string, now: Date) {
  await tx
    .update(gatewaySettlement)
    .set({ updatedAt: now })
    .where(eq(gatewaySettlement.id, id));
}

/** Stores a line's suggestion, or clears it. */
export async function setLineSuggestion(
  tx: StatementTx,
  lineId: string,
  target: LineMatchWrite | null,
  now: Date
): Promise<void> {
  await tx
    .update(statementLine)
    .set(
      target
        ? {
            suggestedContributionId:
              target.kind === "contribution" ? target.targetId : null,
            suggestedKind: target.kind,
            suggestedSettlementId:
              target.kind === "settlement" ? target.targetId : null,
            suggestionReason: target.reason,
            updatedAt: now,
          }
        : { ...clearedSuggestion, updatedAt: now }
    )
    .where(
      and(
        eq(statementLine.id, lineId),
        eq(statementLine.matchStatus, "unmatched")
      )
    );
}

/** The line, locked for the rest of the transaction. */
export async function lockStatementLine(
  tx: StatementTx,
  id: string
): Promise<StatementLineRecord | null> {
  const [row] = await tx
    .select()
    .from(statementLine)
    .where(eq(statementLine.id, id))
    .for("update");
  return row ?? null;
}

export async function updateStatementLine(
  tx: StatementTx,
  id: string,
  patch: Partial<typeof statementLine.$inferInsert>
): Promise<void> {
  await tx.update(statementLine).set(patch).where(eq(statementLine.id, id));
}

/** Puts a line back to unmatched, with no suggestion. */
export async function resetStatementLine(
  tx: StatementTx,
  id: string,
  now: Date
): Promise<void> {
  const [before] = await tx
    .select({
      matchedSettlementId: statementLine.matchedSettlementId,
      transferPairLineId: statementLine.transferPairLineId,
    })
    .from(statementLine)
    .where(eq(statementLine.id, id))
    .limit(1);
  // A transfer's pair comes apart on both sides.
  if (before?.transferPairLineId) {
    await updateStatementLine(tx, before.transferPairLineId, {
      transferPairLineId: null,
      updatedAt: now,
    });
  }
  if (before?.matchedSettlementId) {
    await touchSettlement(tx, before.matchedSettlementId, now);
  }
  await updateStatementLine(tx, id, {
    ...clearedSuggestion,
    ignoredReason: null,
    matchedAt: null,
    matchedBy: null,
    matchedContributionId: null,
    matchedSettlementId: null,
    matchKind: null,
    matchReason: null,
    matchStatus: "unmatched",
    // The check allows the other account only on a transfer match.
    transferOrgAccountId: null,
    transferPairLineId: null,
    updatedAt: now,
  });
}

/** Days either side within which two lines can be one transfer's two sides. */
export const TRANSFER_PAIR_DAYS = 5;

/**
 * After a line is marked as a transfer to another account: pairs it with
 * that account's own line for the same transfer, if one is marked and not
 * yet paired (opposite direction, same amount, value date within a few
 * days, marked as a transfer back to this line's account), the nearest in
 * date, then the first marked. Each line is in one pair at most, so two
 * equal transfers never share a counterpart. Callers hold the statement
 * line lock. Returns the paired line, if any.
 */
export async function pairTransferLine(
  tx: StatementTx,
  lineId: string,
  now: Date
): Promise<string | null> {
  const [line] = await tx
    .select()
    .from(statementLine)
    .where(eq(statementLine.id, lineId))
    .limit(1);
  if (
    !line?.transferOrgAccountId ||
    line.matchKind !== "transfer" ||
    line.transferPairLineId
  ) {
    return line?.transferPairLineId ?? null;
  }
  const distance = sql`abs(${statementLine.valueOn} - ${line.valueOn}::date)`;
  const [counterpart] = await tx
    .select({ id: statementLine.id })
    .from(statementLine)
    .where(
      and(
        eq(statementLine.orgAccountId, line.transferOrgAccountId),
        eq(statementLine.transferOrgAccountId, line.orgAccountId),
        eq(statementLine.matchStatus, "matched"),
        eq(statementLine.matchKind, "transfer"),
        isNull(statementLine.transferPairLineId),
        eq(
          statementLine.direction,
          line.direction === "debit" ? "credit" : "debit"
        ),
        eq(statementLine.amountPaise, line.amountPaise),
        sql`${distance} <= ${TRANSFER_PAIR_DAYS}`,
        // A line in a closed year is never paired again.
        sql`not exists (select 1 from ${fiscalYear}
          where ${fiscalYear.closedAt} is not null
            and ${statementLine.valueOn} between ${fiscalYear.startsOn} and ${fiscalYear.endsOn})`
      )
    )
    .orderBy(distance, asc(statementLine.matchedAt), asc(statementLine.id))
    .limit(1);
  if (!counterpart) {
    return null;
  }
  await updateStatementLine(tx, line.id, {
    transferPairLineId: counterpart.id,
    updatedAt: now,
  });
  await updateStatementLine(tx, counterpart.id, {
    transferPairLineId: line.id,
    updatedAt: now,
  });
  return counterpart.id;
}

/** Another line already holds this settlement or contribution. */
export async function isTargetMatched(
  executor: Reader,
  kind: "contribution" | "settlement",
  targetId: string
): Promise<boolean> {
  const column =
    kind === "settlement"
      ? statementLine.matchedSettlementId
      : statementLine.matchedContributionId;
  const [row] = await executor
    .select({ id: statementLine.id })
    .from(statementLine)
    .where(eq(column, targetId))
    .limit(1);
  return row !== undefined;
}

/** A processed give.do payout or settlement of the server's Razorpay mode. */
export async function findSettlementForMatch(
  executor: Reader,
  id: string,
  mode: string | null
): Promise<{ amountPaise: number } | null> {
  const [row] = await executor
    .select({ amountPaise: gatewaySettlement.amountPaise })
    .from(gatewaySettlement)
    .where(
      and(
        eq(gatewaySettlement.id, id),
        or(
          and(
            eq(gatewaySettlement.provider, "give_do"),
            eq(gatewaySettlement.providerAccount, "live")
          ),
          ...(mode
            ? [
                and(
                  eq(gatewaySettlement.provider, "razorpay"),
                  eq(gatewaySettlement.providerAccount, mode)
                ),
              ]
            : [])
        ),
        eq(gatewaySettlement.status, "processed")
      )
    );
  return row ?? null;
}

export async function findContributionForMatch(
  executor: Reader,
  id: string
): Promise<{
  amountPaise: number;
  channel: string;
  orgAccountId: string | null;
  status: string;
} | null> {
  const [row] = await executor
    .select({
      amountPaise: contribution.amountPaise,
      channel: contribution.channel,
      orgAccountId: contribution.orgAccountId,
      status: contribution.status,
    })
    .from(contribution)
    .where(eq(contribution.id, id));
  return row ?? null;
}

export interface LinkCandidates {
  contributions: {
    amountPaise: number;
    donorName: string;
    id: string;
    receivedOn: string;
    reference: string | null;
  }[];
  settlements: {
    amountPaise: number;
    externalId: string;
    id: string;
    provider: string;
    settledOn: string;
    utr: string | null;
  }[];
}

const LINK_CANDIDATE_LIMIT = 500;

/**
 * What a credit line of this account could be linked to by hand: the
 * account's direct-deposit contributions and eligible processed settlements
 * of the line's amount that no line holds, nearest the line's date first.
 */
export async function findLinkCandidates(
  line: { amountPaise: number; orgAccountId: string; valueOn: string },
  mode: string | null
): Promise<LinkCandidates> {
  const { amountPaise, orgAccountId, valueOn } = line;
  const nearest = (column: typeof contribution.receivedOn) =>
    sql`abs(${column} - ${valueOn}::date)`;
  const contributions = await db
    .select({
      amountPaise: contribution.amountPaise,
      donorName: party.displayName,
      id: contribution.id,
      receivedOn: contribution.receivedOn,
      reference: contribution.reference,
    })
    .from(contribution)
    .innerJoin(party, eq(party.id, contribution.partyId))
    .where(
      and(
        eq(contribution.orgAccountId, orgAccountId),
        eq(contribution.amountPaise, amountPaise),
        inArray(contribution.channel, [...DIRECT_DEPOSIT_CHANNELS]),
        inArray(contribution.status, [...CONTRIBUTION_RECEIVED_STATUSES]),
        contributionUnmatched
      )
    )
    .orderBy(nearest(contribution.receivedOn), asc(contribution.id))
    .limit(LINK_CANDIDATE_LIMIT);
  const settlements = await db
    .select({
      amountPaise: gatewaySettlement.amountPaise,
      externalId: gatewaySettlement.externalId,
      id: gatewaySettlement.id,
      provider: gatewaySettlement.provider,
      settledOn: gatewaySettlement.settledOn,
      utr: gatewaySettlement.utr,
    })
    .from(gatewaySettlement)
    .where(
      and(
        settlementCandidate(mode),
        eq(gatewaySettlement.amountPaise, amountPaise)
      )
    )
    .orderBy(
      sql`abs(${gatewaySettlement.settledOn} - ${valueOn}::date)`,
      asc(gatewaySettlement.id)
    )
    .limit(LINK_CANDIDATE_LIMIT);
  return { contributions, settlements };
}

export interface StatementSummary {
  /** Balance printed on the latest line that has one, and its date. */
  closing: { balancePaise: number; valueOn: string } | null;
  /** Credits from the cutover, as are the matched and unmatched counts. */
  creditCount: number;
  creditsMatchedCount: number;
  /** give.do gifts received less give.do payouts matched to bank lines. */
  giveDoClearingPaise: number;
  lineCount: number;
  suggestionCount: number;
  /** Unmatched credits: what is left to review. */
  unmatchedCount: number;
}

/** The figures above an account's lines. */
export async function statementSummary(
  orgAccountId: string,
  reader: Reader = db
): Promise<StatementSummary> {
  const fromCutover = sql`${statementLine.valueOn} >= ${LEDGER_CUTOVER_ON}::date`;
  const [counts] = await reader
    .select({
      credits: sql<number>`count(*) filter (where ${statementLine.direction} = 'credit' and ${fromCutover})::int`,
      creditsMatched: sql<number>`count(*) filter (where ${statementLine.direction} = 'credit' and ${statementLine.matchStatus} = 'matched' and ${fromCutover})::int`,
      lines: sql<number>`count(*)::int`,
      suggestions: sql<number>`count(*) filter (where ${statementLine.matchStatus} = 'unmatched' and ${statementLine.suggestedKind} is not null)::int`,
      unmatched: sql<number>`count(*) filter (where ${statementLine.matchStatus} = 'unmatched' and ${statementLine.direction} = 'credit' and ${fromCutover})::int`,
    })
    .from(statementLine)
    .where(eq(statementLine.orgAccountId, orgAccountId));
  const [closing] = await reader
    .select({
      balancePaise: statementLine.balancePaise,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .leftJoin(importBatch, eq(importBatch.id, statementLine.importBatchId))
    .where(
      and(
        eq(statementLine.orgAccountId, orgAccountId),
        isNotNull(statementLine.balancePaise)
      )
    )
    .orderBy(
      desc(statementLine.valueOn),
      sql`${importBatch.createdAt} desc nulls last`,
      desc(statementLine.position)
    )
    .limit(1);
  return {
    closing:
      closing && closing.balancePaise !== null
        ? { balancePaise: closing.balancePaise, valueOn: closing.valueOn }
        : null,
    creditCount: Number(counts?.credits ?? 0),
    creditsMatchedCount: Number(counts?.creditsMatched ?? 0),
    giveDoClearingPaise: await giveDoClearingPaise(reader),
    lineCount: Number(counts?.lines ?? 0),
    suggestionCount: Number(counts?.suggestions ?? 0),
    unmatchedCount: Number(counts?.unmatched ?? 0),
  };
}

/** give.do gifts less imported settlements and legacy payouts matched to bank lines. */
export async function giveDoClearingPaise(
  executor: Reader = db
): Promise<number> {
  const [gifts] = await executor
    .select({
      total: sql<string>`coalesce(sum(${contribution.amountPaise}), 0)`,
    })
    .from(contribution)
    .where(
      and(
        eq(contribution.channel, "give_do"),
        inArray(contribution.status, [...CONTRIBUTION_RECEIVED_STATUSES])
      )
    );
  const [payouts] = await executor
    .select({
      total: sql<string>`coalesce(sum(${statementLine.amountPaise}), 0)`,
    })
    .from(statementLine)
    .leftJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, statementLine.matchedSettlementId)
    )
    .where(
      and(
        eq(statementLine.matchStatus, "matched"),
        or(
          eq(statementLine.matchKind, "giveindia_payout"),
          and(
            eq(statementLine.matchKind, "settlement"),
            eq(gatewaySettlement.provider, "give_do"),
            eq(gatewaySettlement.providerAccount, "live")
          )
        )
      )
    );
  return Number(gifts?.total ?? 0) - Number(payouts?.total ?? 0);
}

export async function getStatementLine(
  id: string
): Promise<StatementLineRecord | null> {
  const [row] = await db
    .select()
    .from(statementLine)
    .where(eq(statementLine.id, id));
  return row ?? null;
}
