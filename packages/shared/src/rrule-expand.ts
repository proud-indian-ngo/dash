import { RRule, RRuleSet, rrulestr } from "rrule";

export const MAX_RECURRENCE_RULE_LENGTH = 1000;
export const MAX_EXCLUDE_RULE_LENGTH = 100;
export const MAX_EXCLUDE_RULES = 10;
export const MAX_EXDATES = 1000;

const MAX_EXPANSION_OCCURRENCES = 10_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_FREQUENCIES = new Set([
  RRule.YEARLY,
  RRule.MONTHLY,
  RRule.WEEKLY,
  RRule.DAILY,
]);

export interface RecurrenceRule {
  /** RRULE strings defining recurring dates to exclude (e.g. FREQ=MONTHLY;BYDAY=SA;BYSETPOS=3 skips every 3rd Saturday). */
  excludeRules?: string[];
  /** Specific ISO date strings (YYYY-MM-DD) to exclude from expansion. */
  exdates?: string[];
  /** iCal RRULE string defining the recurrence pattern. */
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

function isISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toISODateUTC(parsed) === value;
}

function parseSupportedRRule(
  value: string,
  dtstart: Date,
  label: string
): RRule {
  // RRule's constructor eagerly builds the cartesian product of BYHOUR,
  // BYMINUTE and BYSECOND. Inspect each input line with its structured parser
  // before constructing the rule so an unsupported multiplier cannot allocate
  // that timeset first.
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let lineOptions: ReturnType<typeof RRule.parseString>;
    try {
      lineOptions = RRule.parseString(line);
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`Invalid ${label}${detail}`);
    }
    const { byhour, byminute, bysecond } = lineOptions;
    if (
      [byhour, byminute, bysecond].some(
        (part) => Array.isArray(part) && part.length > 1
      )
    ) {
      throw new Error(`${label} must produce at most one time per date`);
    }
  }

  let parsed: RRule | RRuleSet;
  try {
    parsed = rrulestr(value, { dtstart });
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Invalid ${label}${detail}`);
  }

  if (parsed instanceof RRuleSet) {
    throw new Error(`${label} must contain exactly one RRULE`);
  }

  const { freq, interval, count } = parsed.origOptions;
  if (freq === undefined || !SUPPORTED_FREQUENCIES.has(freq)) {
    throw new Error(`${label} frequency must be daily or less frequent`);
  }

  const normalizedInterval = interval ?? 1;
  if (
    typeof normalizedInterval !== "number" ||
    !Number.isFinite(normalizedInterval) ||
    !Number.isInteger(normalizedInterval) ||
    normalizedInterval < 1
  ) {
    throw new Error(`${label} interval must be a positive integer`);
  }

  if (
    count !== null &&
    count !== undefined &&
    (typeof count !== "number" ||
      !Number.isFinite(count) ||
      !Number.isInteger(count) ||
      count < 1)
  ) {
    throw new Error(`${label} count must be a positive integer`);
  }

  return parsed;
}

interface ParsedRecurrenceRule {
  excludeRules: RRule[];
  rrule: RRule;
}

function parseValidatedRecurrenceRule(
  rule: RecurrenceRule,
  dtstart: Date
): ParsedRecurrenceRule {
  if (!Number.isFinite(dtstart.getTime())) {
    throw new Error("Recurrence start time must be a valid date");
  }
  if (!rule.rrule || rule.rrule.length > MAX_RECURRENCE_RULE_LENGTH) {
    throw new Error(
      `Recurrence rule must be at most ${MAX_RECURRENCE_RULE_LENGTH} characters`
    );
  }
  if ((rule.excludeRules?.length ?? 0) > MAX_EXCLUDE_RULES) {
    throw new Error(
      `Recurrence rule may have at most ${MAX_EXCLUDE_RULES} exclusion rules`
    );
  }
  if ((rule.exdates?.length ?? 0) > MAX_EXDATES) {
    throw new Error(
      `Recurrence rule may have at most ${MAX_EXDATES} excluded dates`
    );
  }
  if (rule.exdates?.some((date) => !isISODate(date))) {
    throw new Error("Excluded dates must use valid YYYY-MM-DD dates");
  }

  const rrule = parseSupportedRRule(rule.rrule, dtstart, "recurrence rule");
  const excludeRules = (rule.excludeRules ?? []).map((excludeRule) => {
    if (!excludeRule || excludeRule.length > MAX_EXCLUDE_RULE_LENGTH) {
      throw new Error(
        `Exclusion rule must be at most ${MAX_EXCLUDE_RULE_LENGTH} characters`
      );
    }
    return parseSupportedRRule(excludeRule, dtstart, "exclusion rule");
  });

  return { excludeRules, rrule };
}

/**
 * Reject recurrence shapes the dashboard cannot safely represent or expand.
 * Occurrence identity is date-based, so a rule may produce only one time on
 * any date.
 */
export function validateRecurrenceRule(
  rule: RecurrenceRule,
  dtstart = new Date(0)
): void {
  parseValidatedRecurrenceRule(rule, dtstart);
}

/** Narrow an `unknown` JSON column value to `RecurrenceRule | null`. */
export function parseRecurrenceRule(value: unknown): RecurrenceRule | null {
  // Rows written through Drizzle on bun-sql can hold the rule as a JSON
  // string rather than an object; accept both.
  if (typeof value === "string") {
    try {
      return parseRecurrenceRule(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (value === null || value === undefined) {
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

function boundedBetween(
  rule: RRule,
  rangeStart: Date,
  rangeEnd: Date,
  label: string
): Date[] {
  let exceededLimit = false;
  const dates = rule.between(rangeStart, rangeEnd, true, (_date, index) => {
    if (index >= MAX_EXPANSION_OCCURRENCES) {
      exceededLimit = true;
      return false;
    }
    return true;
  });
  if (exceededLimit) {
    throw new Error(
      `${label} produces more than ${MAX_EXPANSION_OCCURRENCES} dates in the requested range`
    );
  }
  return dates;
}

/**
 * Expand a series RRULE into virtual occurrences within [rangeStart, rangeEnd].
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
  const dtstart = new Date(seriesStart);
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  if (
    !Number.isFinite(seriesStart) ||
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeStart > rangeEnd
  ) {
    throw new Error("Recurrence expansion requires a valid date range");
  }
  const parsedRule = parseValidatedRecurrenceRule(rule, dtstart);
  const exdateSet = new Set(rule.exdates ?? []);

  for (const exRule of parsedRule.excludeRules) {
    for (const d of boundedBetween(exRule, start, end, "Exclusion rule")) {
      exdateSet.add(toISODateUTC(d));
    }
  }

  const dates = boundedBetween(parsedRule.rrule, start, end, "Recurrence rule");

  const duration = seriesEnd === null ? null : seriesEnd - seriesStart;
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
      seriesDate.getUTCHours(),
      seriesDate.getUTCMinutes(),
      seriesDate.getUTCSeconds(),
      seriesDate.getUTCMilliseconds()
    );

    const startTime = occStart.getTime();
    const endTime = duration === null ? null : startTime + duration;

    occurrences.push({ date: isoDate, endTime, startTime });
  }

  return occurrences;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The date key of a series' first session: the parent row's own start, as a
 * UTC calendar date like every occurrence date. A session on this date is the
 * series parent itself, never an exception row.
 */
export function seriesStartDate(seriesStart: number): string {
  return toISODateUTC(new Date(seriesStart));
}

/**
 * The occurrence of a series on `occDate` (YYYY-MM-DD, the series' date key),
 * or null when the rule (with its exdates and exclude rules) has no session
 * that day. Exception rows are not consulted.
 */
export function findOccurrence(
  rule: RecurrenceRule,
  seriesStart: number,
  seriesEnd: number | null,
  occDate: string
): VirtualOccurrence | null {
  const day = Date.parse(`${occDate}T00:00:00Z`);
  if (Number.isNaN(day)) {
    return null;
  }
  return (
    expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      day - DAY_MS,
      day + 2 * DAY_MS
    ).find((occ) => occ.date === occDate) ?? null
  );
}
