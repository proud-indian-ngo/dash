import { eq } from "drizzle-orm";

import { db } from "./index";
import { fiscalPeriod, fiscalYear } from "./schema/finance-dimensions";

/** April-to-March year that contains `date`, named by its starting calendar year. */
export function fiscalYearStartFor(date: Date): number {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

export function fiscalYearLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** The twelve monthly periods of a fiscal year, month 1 = April. */
export function buildFiscalPeriods(
  startYear: number,
  fiscalYearId: string,
  makeId: (month: number) => string
) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const calendarMonth = ((3 + i) % 12) + 1;
    const calendarYear = startYear + (calendarMonth < 4 ? 1 : 0);
    const start = new Date(Date.UTC(calendarYear, calendarMonth - 1, 1));
    const end = new Date(Date.UTC(calendarYear, calendarMonth, 0));
    return {
      endsOn: end.toISOString().slice(0, 10),
      fiscalYearId,
      id: makeId(month),
      month,
      startsOn: start.toISOString().slice(0, 10),
    };
  });
}

/**
 * Create the fiscal year starting in `startYear` and its periods if they do
 * not exist. Returns true when a year was created. Safe to call repeatedly.
 */
export async function ensureFiscalYear(startYear: number): Promise<boolean> {
  const label = fiscalYearLabel(startYear);
  const existing = await db
    .select({ id: fiscalYear.id })
    .from(fiscalYear)
    .where(eq(fiscalYear.label, label))
    .limit(1);
  const id = existing[0]?.id ?? crypto.randomUUID();
  if (existing.length === 0) {
    await db
      .insert(fiscalYear)
      .values({
        endsOn: `${startYear + 1}-03-31`,
        id,
        label,
        startsOn: `${startYear}-04-01`,
      })
      .onConflictDoNothing();
  }
  await db
    .insert(fiscalPeriod)
    .values(buildFiscalPeriods(startYear, id, () => crypto.randomUUID()))
    .onConflictDoNothing();
  return existing.length === 0;
}

/**
 * Make sure the current fiscal year and the next one exist, so postings
 * always have a period and the year-end close can be prepared early.
 */
export async function ensureUpcomingFiscalYears(
  now: Date = new Date()
): Promise<string[]> {
  const current = fiscalYearStartFor(now);
  const created: string[] = [];
  for (const startYear of [current, current + 1]) {
    if (await ensureFiscalYear(startYear)) {
      created.push(fiscalYearLabel(startYear));
    }
  }
  return created;
}
