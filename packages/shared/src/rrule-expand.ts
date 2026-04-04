import { rrulestr } from "rrule";

export interface RecurrenceRule {
  exdates?: string[];
  rrule: string;
}

/** A virtual occurrence computed from RRULE expansion (no DB row). */
export interface VirtualOccurrence {
  /** ISO date string (YYYY-MM-DD) identifying this occurrence. */
  date: string;
  /** Epoch ms end time (preserving series duration), or null. */
  endTime: number | null;
  /** Epoch ms start time (series time-of-day applied to this date). */
  startTime: number;
}

/** Narrow an `unknown` JSON column value to `RecurrenceRule | null`. */
export function parseRecurrenceRule(value: unknown): RecurrenceRule | null {
  if (value == null) {
    return null;
  }
  if (
    typeof value === "object" &&
    "rrule" in value &&
    typeof (value as RecurrenceRule).rrule === "string"
  ) {
    return value as RecurrenceRule;
  }
  return null;
}

function toISODateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Expand a series RRULE into virtual occurrences within [rangeStart, rangeEnd].
 *
 * Uses local getters + UTC setter for time-of-day — correct as long as the
 * runtime TZ matches the TZ used when events were created (Asia/Kolkata).
 *
 * @param rule       The recurrence rule from the series parent.
 * @param seriesStart  The series parent's startTime (epoch ms) — used for time-of-day.
 * @param seriesEnd    The series parent's endTime (epoch ms | null) — used for duration.
 * @param rangeStart   Expand from this date (inclusive, epoch ms).
 * @param rangeEnd     Expand until this date (inclusive, epoch ms).
 * @param exceptionDates  Set of ISO date strings that have materialized exception rows.
 */
export function expandSeries(
  rule: RecurrenceRule,
  seriesStart: number,
  seriesEnd: number | null,
  rangeStart: number,
  rangeEnd: number,
  exceptionDates: ReadonlySet<string> = new Set()
): VirtualOccurrence[] {
  const rrule = rrulestr(rule.rrule);
  const exdateSet = new Set(rule.exdates ?? []);

  const dates = rrule.between(new Date(rangeStart), new Date(rangeEnd), true);

  const duration = seriesEnd == null ? null : seriesEnd - seriesStart;
  const seriesDate = new Date(seriesStart);

  const occurrences: VirtualOccurrence[] = [];

  for (const date of dates) {
    const isoDate = toISODateUTC(date);

    if (exdateSet.has(isoDate)) {
      continue;
    }

    if (exceptionDates.has(isoDate)) {
      continue;
    }

    const occStart = new Date(date);
    occStart.setUTCHours(
      seriesDate.getHours(),
      seriesDate.getMinutes(),
      seriesDate.getSeconds(),
      seriesDate.getMilliseconds()
    );

    const startTime = occStart.getTime();
    const endTime = duration == null ? null : startTime + duration;

    occurrences.push({ date: isoDate, startTime, endTime });
  }

  return occurrences;
}
