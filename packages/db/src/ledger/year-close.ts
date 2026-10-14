import { todayInKolkata } from "@pi-dash/shared/income";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";
import {
  and,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { fiscalYear, orgAccount } from "../schema/finance-dimensions";
import {
  accountMovement,
  fiscalYearEvent,
  openingBalance,
} from "../schema/ledger";
import { statementLine } from "../schema/statement-line";
import type { LedgerTx } from "./engine";
import { LedgerError } from "./rules";

/**
 * Year close (the ledger closes at year end only). Closing stamps the year,
 * after which the engine refuses any posting dated in it; reopening needs
 * its own permission and a reason, kept in `fiscal_year_event`.
 *
 * Blocking: the year has ended, the previous year in the books is closed,
 * and (in the cutover year) the opening balances are posted. A later year
 * that is closed blocks reopening an earlier one. The rest of the checklist
 * is for the treasurer to judge: records waiting to post (always none until
 * income and expenses post), bank statements reaching the year end, and the
 * clearing balances at year end (payouts in transit are normal).
 */

export type CloseCheckId =
  | "year_ended"
  | "previous_year_closed"
  | "opening_balances"
  | "unposted_sources"
  | "bank_statements"
  | "clearing_balances";

export interface CloseCheck {
  /** Short facts for the row, such as "HDFC current account: to 31 Mar 2027". */
  details: string[];
  id: CloseCheckId;
  ok: boolean;
  /** A failing required check blocks the close. */
  required: boolean;
}

export interface YearCloseChecklist {
  canClose: boolean;
  checks: CloseCheck[];
  closedAt: Date | null;
  endsOn: string;
  fiscalYearId: string;
  label: string;
}

const BLOCKER_MESSAGES: Partial<Record<CloseCheckId, string>> = {
  opening_balances: "Post the opening balances before closing the year",
  previous_year_closed: "Close the previous year first",
  year_ended: "A year can be closed only after it has ended",
};

/** The year before this one, if the books keep it (it ends on or after the cutover). */
async function previousBooksYear(tx: LedgerTx, startsOn: string) {
  const [previous] = await tx
    .select()
    .from(fiscalYear)
    .where(lt(fiscalYear.startsOn, startsOn))
    .orderBy(desc(fiscalYear.startsOn))
    .limit(1);
  return previous && previous.endsOn >= LEDGER_CUTOVER_ON ? previous : null;
}

export async function yearCloseChecklist(
  tx: LedgerTx,
  fiscalYearId: string,
  now: Date = new Date()
): Promise<YearCloseChecklist> {
  const [year] = await tx
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.id, fiscalYearId))
    .limit(1);
  if (!year) {
    throw new LedgerError("not_found", "That financial year doesn't exist");
  }
  const checks: CloseCheck[] = [
    {
      details: [],
      id: "year_ended",
      ok: todayInKolkata(now) > year.endsOn,
      required: true,
    },
  ];

  const previous = await previousBooksYear(tx, year.startsOn);
  if (previous) {
    checks.push({
      details: [previous.label],
      id: "previous_year_closed",
      ok: previous.closedAt !== null,
      required: true,
    });
  }

  // Only the cutover year opens from entered balances; later years carry on.
  if (year.startsOn === LEDGER_CUTOVER_ON) {
    const [live] = await tx
      .select({ id: openingBalance.id })
      .from(openingBalance)
      .where(
        and(
          eq(openingBalance.fiscalYearId, year.id),
          isNull(openingBalance.reversalPostingId)
        )
      )
      .limit(1);
    checks.push({
      details: [],
      id: "opening_balances",
      ok: live !== undefined,
      required: true,
    });
  }

  // Placeholder until income and expense posting arrive (layers 3-2, 3-3).
  checks.push({
    details: [],
    id: "unposted_sources",
    ok: true,
    required: false,
  });

  const banks = await tx
    .select({
      lastOn: max(statementLine.valueOn),
      name: orgAccount.name,
    })
    .from(orgAccount)
    .leftJoin(statementLine, eq(statementLine.orgAccountId, orgAccount.id))
    .where(and(eq(orgAccount.kind, "bank"), eq(orgAccount.active, true)))
    .groupBy(orgAccount.id, orgAccount.name)
    .orderBy(orgAccount.name);
  checks.push({
    details: banks.map((b) =>
      b.lastOn ? `${b.name}: to ${b.lastOn}` : `${b.name}: no statement`
    ),
    id: "bank_statements",
    ok: banks.every((b) => b.lastOn !== null && b.lastOn >= year.endsOn),
    required: false,
  });

  // Shown for the treasurer to check, never a failure: money a gateway has
  // collected but not yet paid out is normal at year end.
  const clearing = await tx
    .select({
      balance: sql<string>`coalesce(sum(case when ${accountMovement.direction} = 'in' then ${accountMovement.amountPaise} else -${accountMovement.amountPaise} end), 0)`,
      name: orgAccount.name,
    })
    .from(orgAccount)
    .leftJoin(
      accountMovement,
      and(
        eq(accountMovement.orgAccountId, orgAccount.id),
        lte(accountMovement.occurredOn, year.endsOn)
      )
    )
    .where(eq(orgAccount.kind, "gateway_clearing"))
    .groupBy(orgAccount.id, orgAccount.name)
    .orderBy(orgAccount.name);
  checks.push({
    details: clearing.map(
      (c) =>
        `${formatPaise(Number(c.balance))} in ${c.name} at year end; payouts in transit are normal`
    ),
    id: "clearing_balances",
    ok: true,
    required: false,
  });

  return {
    canClose:
      year.closedAt === null && checks.every((c) => c.ok || !c.required),
    checks,
    closedAt: year.closedAt,
    endsOn: year.endsOn,
    fiscalYearId: year.id,
    label: year.label,
  };
}

async function lockYear(tx: LedgerTx, fiscalYearId: string) {
  const [year] = await tx
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.id, fiscalYearId))
    .for("update")
    .limit(1);
  if (!year) {
    throw new LedgerError("not_found", "That financial year doesn't exist");
  }
  return year;
}

export async function closeYear(
  tx: LedgerTx,
  fiscalYearId: string,
  context: { actorId: string; now?: Date }
) {
  const year = await lockYear(tx, fiscalYearId);
  if (year.closedAt) {
    throw new LedgerError("closed_year", `${year.label} is already closed`);
  }
  const now = context.now ?? new Date();
  const checklist = await yearCloseChecklist(tx, fiscalYearId, now);
  const blocker = checklist.checks.find((c) => c.required && !c.ok);
  if (blocker) {
    throw new LedgerError(
      "invalid",
      BLOCKER_MESSAGES[blocker.id] ?? `${year.label} can't be closed yet`
    );
  }
  await tx
    .update(fiscalYear)
    .set({ closedAt: now, closedBy: context.actorId })
    .where(eq(fiscalYear.id, year.id));
  await tx.insert(fiscalYearEvent).values({
    action: "close",
    actorId: context.actorId,
    fiscalYearId: year.id,
    id: uuidv7(),
    occurredAt: now,
  });
  return { label: year.label };
}

export const MIN_REOPEN_REASON_LENGTH = 5;

export async function reopenYear(
  tx: LedgerTx,
  input: { fiscalYearId: string; reason: string },
  context: { actorId: string; now?: Date }
) {
  const reason = input.reason.trim();
  if (reason.length < MIN_REOPEN_REASON_LENGTH) {
    throw new LedgerError("invalid", "Say why the year is being reopened");
  }
  const year = await lockYear(tx, input.fiscalYearId);
  if (!year.closedAt) {
    throw new LedgerError("invalid", `${year.label} is not closed`);
  }
  const [laterClosed] = await tx
    .select({ label: fiscalYear.label })
    .from(fiscalYear)
    .where(
      and(
        gt(fiscalYear.startsOn, year.startsOn),
        isNotNull(fiscalYear.closedAt)
      )
    )
    .orderBy(fiscalYear.startsOn)
    .limit(1);
  if (laterClosed) {
    throw new LedgerError(
      "invalid",
      `Reopen ${laterClosed.label} first: a later year is closed`
    );
  }
  const now = context.now ?? new Date();
  await tx
    .update(fiscalYear)
    .set({ closedAt: null, closedBy: null })
    .where(eq(fiscalYear.id, year.id));
  await tx.insert(fiscalYearEvent).values({
    action: "reopen",
    actorId: context.actorId,
    fiscalYearId: year.id,
    id: uuidv7(),
    occurredAt: now,
    reason,
  });
  return { label: year.label };
}
