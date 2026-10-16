import { todayInKolkata } from "@pi-dash/shared/income";
import { POSTING_ACTIONS } from "@pi-dash/shared/ledger";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { db } from "..";
import { fiscalPeriod, fiscalYear } from "../schema/finance-dimensions";
import {
  accountMovement,
  ledgerEntry,
  movementAllocation,
  posting,
} from "../schema/ledger";
import {
  isIsoDay,
  LedgerError,
  type PostingInput,
  postingDates,
  validatePostingInput,
} from "./rules";

/**
 * The posting engine (server only). `post` turns one source action into
 * recognition entries and cash-book movements in the caller's transaction;
 * `reverse` appends the mirror image of a posting. Nothing here updates or
 * deletes a posted row, and a database trigger refuses it anyway.
 *
 * - Idempotent: the (source type, source id, revision, action) key is
 *   unique, and a repeat returns the posting already written.
 * - Serialised per source with a transaction-scoped advisory lock.
 * - Dates resolve to fiscal periods; a closed year refuses the posting
 *   (the year row is read FOR SHARE, so a concurrent close waits).
 * - posted_on is today in India.
 */

export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `movement_allocation.document_type` of a movement reconciled to a bank line. */
export const MOVEMENT_ALLOCATION_STATEMENT_LINE = "statement_line";
export type PostingRow = typeof posting.$inferSelect;

export interface PostContext {
  /** The user posting; null for system postings. */
  actorId: string | null;
  now?: Date;
}

export interface PostResult {
  created: boolean;
  posting: PostingRow;
}

async function lockSource(tx: LedgerTx, sourceType: string, sourceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ledger:${sourceType}:${sourceId}`}, 0))`
  );
}

interface ResolvedPeriod {
  fiscalYearId: string;
  periodId: string;
}

/**
 * Each date's fiscal period, refusing dates with no period and dates in a
 * closed year. Years are read FOR SHARE so a close waits for this posting.
 */
export async function resolvePeriods(
  tx: LedgerTx,
  dates: readonly string[]
): Promise<Map<string, ResolvedPeriod>> {
  const resolved = new Map<string, ResolvedPeriod>();
  for (const day of dates) {
    const [row] = await tx
      .select({
        closedAt: fiscalYear.closedAt,
        fiscalYearId: fiscalYear.id,
        label: fiscalYear.label,
        periodId: fiscalPeriod.id,
      })
      .from(fiscalPeriod)
      .innerJoin(fiscalYear, eq(fiscalYear.id, fiscalPeriod.fiscalYearId))
      .where(
        and(lte(fiscalPeriod.startsOn, day), gte(fiscalPeriod.endsOn, day))
      )
      .limit(1)
      .for("share", { of: fiscalYear });
    if (!row) {
      throw new LedgerError(
        "no_period",
        `There is no financial year set up for ${day}`
      );
    }
    if (row.closedAt) {
      throw new LedgerError(
        "closed_year",
        `${row.label} is closed. Reopen the year to post into it.`
      );
    }
    resolved.set(day, {
      fiscalYearId: row.fiscalYearId,
      periodId: row.periodId,
    });
  }
  return resolved;
}

function periodOf(periods: Map<string, ResolvedPeriod>, day: string) {
  const period = periods.get(day);
  if (!period) {
    throw new LedgerError("no_period", `No fiscal period for ${day}`);
  }
  return period;
}

async function findByKey(
  tx: LedgerTx,
  key: {
    action: string;
    sourceId: string;
    sourceRevision: number;
    sourceType: string;
  }
) {
  const [existing] = await tx
    .select()
    .from(posting)
    .where(
      and(
        eq(posting.sourceType, key.sourceType),
        eq(posting.sourceId, key.sourceId),
        eq(posting.sourceRevision, key.sourceRevision),
        eq(posting.action, key.action)
      )
    )
    .limit(1);
  return existing;
}

/** Posts one source action; a repeat of the same key returns the first posting. */
export async function post(
  tx: LedgerTx,
  input: PostingInput,
  context: PostContext
): Promise<PostResult> {
  validatePostingInput(input);
  const sourceRevision = input.sourceRevision ?? 1;
  await lockSource(tx, input.sourceType, input.sourceId);
  const existing = await findByKey(tx, {
    action: input.action,
    sourceId: input.sourceId,
    sourceRevision,
    sourceType: input.sourceType,
  });
  if (existing) {
    return { created: false, posting: existing };
  }

  const periods = await resolvePeriods(tx, postingDates(input));
  const now = context.now ?? new Date();
  const postedOn = todayInKolkata(now);
  const [created] = await tx
    .insert(posting)
    .values({
      action: input.action,
      createdAt: now,
      createdBy: context.actorId,
      economicOn: input.economicOn,
      fiscalYearId: periodOf(periods, input.economicOn).fiscalYearId,
      id: uuidv7(),
      postedOn,
      sourceId: input.sourceId,
      sourceRevision,
      sourceType: input.sourceType,
    })
    .returning();
  if (!created) {
    throw new Error("Posting was not written");
  }

  if (input.entries.length > 0) {
    await tx.insert(ledgerEntry).values(
      input.entries.map((e) => {
        const economicOn = e.economicOn ?? input.economicOn;
        return {
          accountHeadId: e.accountHeadId,
          amountPaise: e.amountPaise,
          costCentreId: e.costCentreId ?? null,
          economicOn,
          effect: e.effect,
          eventId: e.eventId ?? null,
          fiscalPeriodId: periodOf(periods, economicOn).periodId,
          fundId: e.fundId,
          id: uuidv7(),
          medium: e.medium ?? "monetary",
          memo: e.memo ?? null,
          partyId: e.partyId ?? null,
          postedOn,
          postingId: created.id,
          programmeId: e.programmeId ?? null,
          projectId: e.projectId ?? null,
          sourceLineId: e.sourceLineId ?? null,
        };
      })
    );
  }
  if (input.movements.length > 0) {
    const rows = input.movements.map((m) => {
      const occurredOn = m.occurredOn ?? input.economicOn;
      return {
        amountPaise: m.amountPaise,
        bankValueOn: m.bankValueOn ?? null,
        direction: m.direction,
        fiscalPeriodId: periodOf(periods, occurredOn).periodId,
        id: uuidv7(),
        kind: m.kind,
        memo: m.memo ?? null,
        occurredOn,
        orgAccountId: m.orgAccountId,
        paymentReference: m.paymentReference ?? null,
        postedOn,
        postingId: created.id,
        transferId: m.transferId ?? null,
      };
    });
    await tx.insert(accountMovement).values(rows);
    // The bank line each movement is reconciled to (layer 3-3b).
    const allocations = input.movements.flatMap((m, index) => {
      const row = rows[index];
      return m.statementLineId && row
        ? [
            {
              accountMovementId: row.id,
              amountPaise: m.amountPaise,
              createdAt: now,
              documentId: m.statementLineId,
              documentType: MOVEMENT_ALLOCATION_STATEMENT_LINE,
              id: uuidv7(),
            },
          ]
        : [];
    });
    if (allocations.length > 0) {
      await tx.insert(movementAllocation).values(allocations);
    }
  }
  return { created: true, posting: created };
}

/**
 * Appends the mirror image of a posting: every entry with the opposite
 * effect and every movement in the opposite direction, on the original
 * dates, linked through `reverses_*`. The original stays as it was. A
 * posting is reversed at most once; a repeat returns the first reversal.
 * Reversing into a closed year is refused like any other posting.
 *
 * With `on`, the reversal is dated that day instead (a void: the request
 * was right when it posted and is undone from the void day), so only that
 * day's year must be open.
 */
export async function reverse(
  tx: LedgerTx,
  postingId: string,
  options: PostContext & { on?: string; reason: string }
): Promise<PostResult> {
  const reason = options.reason.trim();
  if (!reason) {
    throw new LedgerError("invalid", "A reversal needs a reason");
  }
  const [original] = await tx
    .select()
    .from(posting)
    .where(eq(posting.id, postingId))
    .limit(1);
  if (!original) {
    throw new LedgerError("not_found", "That posting doesn't exist");
  }
  if (original.reversesPostingId) {
    throw new LedgerError(
      "invalid",
      "A reversal can't itself be reversed; post the replacement instead"
    );
  }
  await lockSource(tx, original.sourceType, original.sourceId);
  const [already] = await tx
    .select()
    .from(posting)
    .where(eq(posting.reversesPostingId, original.id))
    .limit(1);
  if (already) {
    return { created: false, posting: already };
  }

  const entries = await tx
    .select()
    .from(ledgerEntry)
    .where(eq(ledgerEntry.postingId, original.id));
  const movements = await tx
    .select()
    .from(accountMovement)
    .where(eq(accountMovement.postingId, original.id));
  if (options.on !== undefined && !isIsoDay(options.on)) {
    throw new LedgerError("invalid", "A reversal date must be YYYY-MM-DD");
  }
  // Never before the posting itself (a payment dated ahead of its void).
  const on =
    options.on !== undefined && options.on < original.economicOn
      ? original.economicOn
      : options.on;
  // The dates it lands on must be in an open year: the original dates, or
  // the reversal's own day.
  const periods = await resolvePeriods(
    tx,
    on === undefined
      ? [
          ...new Set([
            original.economicOn,
            ...entries.map((e) => e.economicOn),
            ...movements.map((m) => m.occurredOn),
          ]),
        ].sort()
      : [on]
  );
  const dated = on === undefined ? null : { day: on, ...periodOf(periods, on) };

  const now = options.now ?? new Date();
  const postedOn = todayInKolkata(now);
  const [created] = await tx
    .insert(posting)
    .values({
      action: `${POSTING_ACTIONS.reverse}:${original.action}`,
      createdAt: now,
      createdBy: options.actorId,
      economicOn: dated?.day ?? original.economicOn,
      fiscalYearId: dated?.fiscalYearId ?? original.fiscalYearId,
      id: uuidv7(),
      postedOn,
      reason,
      reversesPostingId: original.id,
      sourceId: original.sourceId,
      sourceRevision: original.sourceRevision,
      sourceType: original.sourceType,
    })
    .returning();
  if (!created) {
    throw new Error("Reversal was not written");
  }
  if (entries.length > 0) {
    await tx.insert(ledgerEntry).values(
      entries.map((e) => ({
        ...e,
        effect:
          e.effect === "increase"
            ? ("decrease" as const)
            : ("increase" as const),
        id: uuidv7(),
        postedOn,
        postingId: created.id,
        reversesEntryId: e.id,
        ...(dated && {
          economicOn: dated.day,
          fiscalPeriodId: dated.periodId,
        }),
      }))
    );
  }
  if (movements.length > 0) {
    await tx.insert(accountMovement).values(
      movements.map((m) => ({
        ...m,
        direction: m.direction === "in" ? ("out" as const) : ("in" as const),
        id: uuidv7(),
        postedOn,
        postingId: created.id,
        reversesMovementId: m.id,
        ...(dated && {
          bankValueOn: null,
          fiscalPeriodId: dated.periodId,
          occurredOn: dated.day,
        }),
      }))
    );
  }
  return { created: true, posting: created };
}
