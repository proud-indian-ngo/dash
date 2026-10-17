import { auditedDrift } from "@pi-dash/shared/audited-figures";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  LEDGER_CUTOVER_ON,
  LEDGER_WAIT_REASONS,
  ledgerReasonLabel,
} from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { fiscalYear, orgAccount } from "../schema/finance-dimensions";
import {
  accountMovement,
  auditedFigures,
  auditedFiguresLine,
  fiscalYearEvent,
  openingBalance,
} from "../schema/ledger";
import { statementLine } from "../schema/statement-line";
import { loadBalanceSheetLines } from "./audited-figures";
import type { LedgerTx } from "./engine";
import { uncheckedSources, waitingByReason } from "./income-posting";
import { LedgerError } from "./rules";

/**
 * Year close (the ledger closes at year end only). Closing stamps the year,
 * after which the engine refuses any posting dated in it; reopening needs
 * its own permission and a reason, kept in `fiscal_year_event`.
 *
 * Blocking: the year has ended, the previous year in the books is closed,
 * (in the cutover year) the opening balances are posted, no record
 * dated in the year is waiting to post, and no bank line dated in it is
 * open. A later year that is closed blocks
 * reopening an earlier one. The rest of the checklist is for the treasurer
 * to judge: bank statements reaching the year end, the clearing
 * balances at year end (payouts in transit are normal), and the audited
 * figures matched or skipped (a warning only: the CA signs the statements
 * months after the year ends, so the year is usually closed first and
 * reopened to match them).
 */

export type CloseCheckId =
  | "year_ended"
  | "previous_year_closed"
  | "opening_balances"
  | "unposted_sources"
  | "bank_statements"
  | "open_bank_lines"
  | "clearing_balances"
  | "audited_figures";

export interface CloseCheck {
  /**
   * Per bank account, a fact that links to its statement, such as "HDFC: 2
   * money out" (open bank lines).
   */
  accounts?: { detail: string; orgAccountId: string; tab: "out" | "review" }[];
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
  open_bank_lines:
    "Bank lines dated in this year are still open. Under Bank statements, match them, mark money out as bank charges, a tax payment or a transfer, or ignore money in that needs no record; a line waiting for a claim clears once the claim is approved and matched to it",
  opening_balances: "Post the opening balances before closing the year",
  unposted_sources:
    "Records dated in this year are waiting to post. Post them, or resolve why they wait, before closing the year",
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

  // Records waiting to post into this year (income from layer 3-2; the
  // expense side joins in layer 3-3). Blocking: a closed year can't take them.
  const range = { endsOn: year.endsOn, startsOn: year.startsOn };
  const waiting = await waitingByReason(tx, range);
  // A record no posting run has looked at yet counts as waiting too.
  const unchecked = await uncheckedSources(tx, range);
  if (unchecked > 0) {
    waiting.set(LEDGER_WAIT_REASONS.unchecked, unchecked);
  }
  checks.push({
    details: [...waiting.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) =>
        // Kept blocking (the year must be complete), with the way out.
        reason === LEDGER_WAIT_REASONS.matchedYear
          ? `${count} record${count === 1 ? "" : "s"} arrived after the audited figures were matched — reverse the audited figures, post, and match again`
          : `${count} waiting: ${ledgerReasonLabel(reason)}`
      ),
    id: "unposted_sources",
    ok: waiting.size === 0,
    required: true,
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

  // Blocking: once the year is closed, its lines can no longer be matched.
  const openLines = await tx
    .select({
      credits: sql<number>`count(*) filter (where ${statementLine.direction} = 'credit')::int`,
      debits: sql<number>`count(*) filter (where ${statementLine.direction} = 'debit')::int`,
      id: orgAccount.id,
      name: orgAccount.name,
      needsClaim: sql<number>`count(*) filter (where ${statementLine.needsClaimAt} is not null)::int`,
    })
    .from(statementLine)
    .innerJoin(orgAccount, eq(orgAccount.id, statementLine.orgAccountId))
    .where(
      and(
        eq(statementLine.matchStatus, "unmatched"),
        gte(statementLine.valueOn, year.startsOn),
        lte(statementLine.valueOn, year.endsOn)
      )
    )
    .groupBy(orgAccount.id, orgAccount.name)
    .orderBy(orgAccount.name);
  checks.push({
    accounts: openLines.map((l) => {
      const parts = [
        ...(l.credits > 0 ? [`${l.credits} money in`] : []),
        ...(l.debits > 0 ? [`${l.debits} money out`] : []),
        ...(l.needsClaim > 0 ? [`${l.needsClaim} waiting for a claim`] : []),
      ];
      return {
        detail: `${l.name}: ${parts.join(", ")}`,
        orgAccountId: l.id,
        tab: l.credits > 0 ? "review" : "out",
      };
    }),
    details: [],
    id: "open_bank_lines",
    ok: openLines.length === 0,
    required: true,
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

  // A warning, never a blocker: audits finish months after the year end.
  const [audited] = await tx
    .select({
      caName: auditedFigures.caName,
      id: auditedFigures.id,
      signedOn: auditedFigures.signedOn,
      skipReason: auditedFigures.skipReason,
      status: auditedFigures.status,
    })
    .from(auditedFigures)
    .where(
      and(
        eq(auditedFigures.fiscalYearId, year.id),
        isNull(auditedFigures.reversedAt)
      )
    )
    .limit(1);
  let auditedDetail =
    "The CA signs the statements months after the year ends: close now, then reopen the year to match them, or skip them with a reason";
  let auditedOk = audited !== undefined;
  const auditedDetails: string[] = [];
  if (audited?.status === "matched") {
    auditedDetail = `Signed by ${audited.caName} on ${audited.signedOn}`;
    // The books must still equal them (the engine freezes a matched year,
    // so this only catches what got past it, such as a repair).
    const stored = await tx
      .select({
        auditedPaise: auditedFiguresLine.auditedPaise,
        key: auditedFiguresLine.lineKey,
      })
      .from(auditedFiguresLine)
      .where(
        and(
          eq(auditedFiguresLine.auditedFiguresId, audited.id),
          ne(auditedFiguresLine.kind, "fund_transfer")
        )
      );
    const { lines } = await loadBalanceSheetLines(tx, year.endsOn);
    const drift = auditedDrift(stored, lines);
    if (drift.length > 0) {
      auditedOk = false;
      auditedDetails.push(
        `Books changed since the audited figures were matched: ${drift.length} line${drift.length === 1 ? "" : "s"} differ`
      );
    }
  } else if (audited) {
    auditedDetail = `Skipped: ${audited.skipReason}`;
  }
  checks.push({
    details: [auditedDetail, ...auditedDetails],
    id: "audited_figures",
    ok: auditedOk,
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

/**
 * Closes and reopens serialise on one lock across all years: closing a year
 * reads the previous year's state and reopening reads the later years', so
 * without it closing 2027-28 and reopening 2026-27 could both commit.
 */
async function lockYear(tx: LedgerTx, fiscalYearId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('ledger:year_close', 0))`
  );
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
