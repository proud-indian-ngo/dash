import { assertSafePaise } from "@pi-dash/shared/money";
import { and, eq, gte, lte, sql } from "drizzle-orm";

import type { db } from "..";
import { accountHead, fiscalYear } from "../schema/finance-dimensions";
import { ledgerEntry } from "../schema/ledger";

/** Recognised expense for one programme, project and head in a year. */
export interface BudgetActual {
  accountHeadId: string;
  paise: number;
  programmeId: string | null;
  projectId: string | null;
}

/**
 * Server only. The year's expense as the books recognise it, by economic
 * date, summed per programme, project and expense head, with reversals
 * netted in: the same entries as Books → Income & expenditure. Groups that
 * net to nothing are left out.
 */
export async function loadBudgetActuals(
  reader: Pick<typeof db, "select">,
  fiscalYearId: string
): Promise<BudgetActual[]> {
  const signed = sql<string>`sum(case when ${ledgerEntry.effect} = 'increase' then ${ledgerEntry.amountPaise} else -${ledgerEntry.amountPaise} end)`;
  const rows = await reader
    .select({
      accountHeadId: ledgerEntry.accountHeadId,
      paise: signed,
      programmeId: ledgerEntry.programmeId,
      projectId: ledgerEntry.projectId,
    })
    .from(ledgerEntry)
    .innerJoin(
      accountHead,
      and(
        eq(accountHead.id, ledgerEntry.accountHeadId),
        eq(accountHead.type, "expense")
      )
    )
    .innerJoin(
      fiscalYear,
      and(
        eq(fiscalYear.id, fiscalYearId),
        gte(ledgerEntry.economicOn, fiscalYear.startsOn),
        lte(ledgerEntry.economicOn, fiscalYear.endsOn)
      )
    )
    .groupBy(
      ledgerEntry.programmeId,
      ledgerEntry.projectId,
      ledgerEntry.accountHeadId
    )
    .having(sql`${signed} <> 0`);
  return rows.map((row) => ({
    accountHeadId: row.accountHeadId,
    paise: assertSafePaise(Number(row.paise)),
    programmeId: row.programmeId,
    projectId: row.projectId,
  }));
}
