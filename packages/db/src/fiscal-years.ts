import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "./index";
import { fiscalPeriod, fiscalYear } from "./schema/finance-dimensions";

const IST = "Asia/Kolkata";

/** Calendar year and month of `date` in India, where the trust keeps its books. */
function istYearMonth(date: Date): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "numeric",
    timeZone: IST,
    year: "numeric",
  }).formatToParts(date);
  const pick = (type: "year" | "month") =>
    Number(parts.find((p) => p.type === type)?.value);
  return { month: pick("month"), year: pick("year") };
}

/** April-to-March year that contains `date` (in IST), named by its starting calendar year. */
export function fiscalYearStartFor(date: Date): number {
  const { month, year } = istYearMonth(date);
  return month >= 4 ? year : year - 1;
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
 * not exist, in one transaction. The year is resolved by label after an
 * insert-or-ignore, so a concurrent run or a seeded row with a different ID
 * never leaves periods pointing at a year that was not written. Returns true
 * only when this call created the year.
 */
export async function ensureFiscalYear(startYear: number): Promise<boolean> {
  const label = fiscalYearLabel(startYear);
  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(fiscalYear)
      .values({
        endsOn: `${startYear + 1}-03-31`,
        id: uuidv7(),
        label,
        startsOn: `${startYear}-04-01`,
      })
      .onConflictDoNothing({ target: fiscalYear.label })
      .returning({ id: fiscalYear.id });
    const id =
      inserted[0]?.id ??
      (
        await tx
          .select({ id: fiscalYear.id })
          .from(fiscalYear)
          .where(eq(fiscalYear.label, label))
          .limit(1)
      )[0]?.id;
    if (!id) {
      throw new Error(`Fiscal year ${label} could not be resolved`);
    }
    await tx
      .insert(fiscalPeriod)
      .values(buildFiscalPeriods(startYear, id, () => uuidv7()))
      .onConflictDoNothing();
    return inserted.length > 0;
  });
}

/**
 * Make sure the current fiscal year and the next one exist, so postings
 * always have a period and the year-end close can be prepared early. Each
 * run ensures current and next, so a year exists from the April a year
 * before it starts.
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
