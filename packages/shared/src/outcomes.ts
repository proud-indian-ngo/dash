import {
  expandSeries,
  parseRecurrenceRule,
  seriesStartDate,
} from "./rrule-expand";

/**
 * Outcomes in Analytics: children reached and volunteer time, derived from
 * events already recorded. Finance sets one org-wide hourly value for
 * volunteer time in Settings → Programmes; it lives in `app_config` under
 * this key as whole paise. It values time for reports only and is never
 * posted to the books.
 */
export const VOLUNTEER_HOUR_VALUE_CONFIG_KEY = "volunteer_hour_value_paise";

/** Largest hourly value finance may set: ₹1,00,000. */
export const MAX_VOLUNTEER_HOUR_VALUE_PAISE = 1_00_000_00;

export const VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE =
  "Enter an hourly value between ₹0.01 and ₹1,00,000";

/** Whether a stored value is an allowed hourly value in whole paise. */
export function isValidVolunteerHourValue(value: string): boolean {
  return (
    /^\d{1,10}$/.test(value) &&
    Number(value) >= 1 &&
    Number(value) <= MAX_VOLUNTEER_HOUR_VALUE_PAISE
  );
}

/** The configured hourly value in paise, or null when not set. */
export function parseVolunteerHourValue(
  value: string | null | undefined
): number | null {
  return value && isValidVolunteerHourValue(value) ? Number(value) : null;
}

/**
 * One programme and team's held events in the range: saved rows as the
 * database aggregates them, or unsaved series sessions as
 * `unsavedSessionRows` counts them. `volunteerSeconds` sums present
 * volunteers × duration over events with an end time.
 */
export interface OutcomeGroupRow {
  children: number;
  events: number;
  programmeId: string;
  programmeName: string;
  teamId: string;
  teamName: string;
  volunteerSeconds: number;
  withoutAttendance: number;
  withoutEndTime: number;
  withoutRecap: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UNTIL_RE = /UNTIL=(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/;
const FREQ_RE = /FREQ=(DAILY|WEEKLY)(?:;|$)/;
const INTERVAL_RE = /INTERVAL=(\d+)/;

/** The rule's UNTIL as epoch ms, or null when it runs on. */
function ruleUntil(rrule: string): number | null {
  const m = UNTIL_RE.exec(rrule);
  if (!m) {
    return null;
  }
  const [, y, mo, d, h = "23", mi = "59", sec = "59"] = m;
  return Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(sec)
  );
}

/**
 * A series start moved forward by whole periods to just before `from`, so
 * expanding a series that began years ago doesn't walk every week since.
 * Only for daily and weekly rules without COUNT or exclude rules, where a
 * shift of whole periods keeps the same dates and times from `from` on.
 */
function sessionStartNear(
  rule: { excludeRules?: string[]; rrule: string },
  start: number,
  from: number
): number {
  const freq = FREQ_RE.exec(rule.rrule)?.[1];
  if (!freq || rule.rrule.includes("COUNT=") || rule.excludeRules?.length) {
    return start;
  }
  const interval = Number(INTERVAL_RE.exec(rule.rrule)?.[1] ?? 1);
  const period = (freq === "DAILY" ? 1 : 7) * interval * DAY_MS;
  // One period short of `from`, so the week holding `from` is whole.
  const periods = Math.floor((from - start) / period) - 1;
  return periods > 0 ? start + periods * period : start;
}

/** A series parent considered for its unsaved past sessions. */
export interface OutcomeSeriesParent {
  endTime: number | null;
  /** Dates of every saved row of the series, cancelled ones included. */
  savedDates: readonly string[];
  programmeId: string;
  programmeName: string;
  recurrenceRule: unknown;
  startTime: number;
  teamId: string;
  teamName: string;
}

/**
 * Sessions of a series nobody saved that are over by `now` and start in the
 * range: held as far as the dashboard knows, but with no recap or attendance.
 * The parent's own date is its first session, counted as a saved row, and
 * saved dates (cancelled ones too) are excluded, as are exdates and
 * exclude rules.
 */
export function unsavedSessionRows(
  parents: readonly OutcomeSeriesParent[],
  range: { from: number | null; to: number | null },
  now: number
): OutcomeGroupRow[] {
  const rows = new Map<string, OutcomeGroupRow>();
  for (const parent of parents) {
    const rule = parseRecurrenceRule(parent.recurrenceRule);
    if (!rule) {
      continue;
    }
    const firstDate = seriesStartDate(parent.startTime);
    const excluded = new Set([...parent.savedDates, firstDate]);
    const from = Math.max(range.from ?? parent.startTime, parent.startTime);
    const to = Math.min(range.to ?? now, now);
    if (from > to) {
      continue;
    }
    const until = ruleUntil(rule.rrule);
    if (until !== null && until < from) {
      continue;
    }
    const start = sessionStartNear(rule, parent.startTime, from);
    const held = expandSeries(
      rule,
      start,
      parent.endTime === null
        ? null
        : start + (parent.endTime - parent.startTime),
      from,
      to,
      excluded
    ).filter((occ) => (occ.endTime ?? occ.startTime) <= now);
    if (held.length === 0) {
      continue;
    }
    const key = `${parent.programmeId}:${parent.teamId}`;
    const row = rows.get(key) ?? {
      children: 0,
      events: 0,
      programmeId: parent.programmeId,
      programmeName: parent.programmeName,
      teamId: parent.teamId,
      teamName: parent.teamName,
      volunteerSeconds: 0,
      withoutAttendance: 0,
      withoutEndTime: 0,
      withoutRecap: 0,
    };
    row.events += held.length;
    row.withoutAttendance += held.length;
    row.withoutRecap += held.length;
    if (parent.endTime === null) {
      row.withoutEndTime += held.length;
    }
    rows.set(key, row);
  }
  return [...rows.values()];
}

export interface OutcomeLine {
  children: number;
  events: number;
  /** Programme or team id; "total" for the totals line. */
  key: string;
  name: string;
  /** Volunteer hours × the hourly value, or null when no value is set. */
  valuePaise: number | null;
  volunteerHours: number;
  withoutAttendance: number;
  withoutEndTime: number;
  withoutRecap: number;
}

export interface OutcomesSummary {
  byProgramme: OutcomeLine[];
  byTeam: OutcomeLine[];
  hourValuePaise: number | null;
  totals: OutcomeLine;
}

interface Tally {
  children: number;
  events: number;
  name: string;
  volunteerSeconds: number;
  withoutAttendance: number;
  withoutEndTime: number;
  withoutRecap: number;
}

const emptyTally = (name: string): Tally => ({
  children: 0,
  events: 0,
  name,
  volunteerSeconds: 0,
  withoutAttendance: 0,
  withoutEndTime: 0,
  withoutRecap: 0,
});

function addTo(
  map: Map<string, Tally>,
  key: string,
  row: OutcomeGroupRow,
  name: string
) {
  const tally = map.get(key) ?? emptyTally(name);
  tally.children += row.children;
  tally.events += row.events;
  tally.volunteerSeconds += row.volunteerSeconds;
  tally.withoutAttendance += row.withoutAttendance;
  tally.withoutEndTime += row.withoutEndTime;
  tally.withoutRecap += row.withoutRecap;
  map.set(key, tally);
}

function toLine(
  key: string,
  tally: Tally,
  hourValuePaise: number | null
): OutcomeLine {
  return {
    children: tally.children,
    events: tally.events,
    key,
    name: tally.name,
    valuePaise:
      hourValuePaise === null
        ? null
        : Math.round((tally.volunteerSeconds * hourValuePaise) / 3600),
    volunteerHours: Math.round(tally.volunteerSeconds / 360) / 10,
    withoutAttendance: tally.withoutAttendance,
    withoutEndTime: tally.withoutEndTime,
    withoutRecap: tally.withoutRecap,
  };
}

/**
 * Totals, and lines by programme and by team (most events first), from the
 * per programme-and-team rows. Value is worked out from unrounded seconds so
 * lines and totals agree to the paisa.
 */
export function summarizeOutcomes(
  rows: readonly OutcomeGroupRow[],
  hourValuePaise: number | null
): OutcomesSummary {
  const programmes = new Map<string, Tally>();
  const teams = new Map<string, Tally>();
  const total = new Map<string, Tally>();
  for (const row of rows) {
    addTo(programmes, row.programmeId, row, row.programmeName);
    addTo(teams, row.teamId, row, row.teamName);
    addTo(total, "total", row, "Total");
  }
  const lines = (map: Map<string, Tally>) =>
    [...map]
      .map(([key, tally]) => toLine(key, tally, hourValuePaise))
      .sort((a, b) => b.events - a.events || a.name.localeCompare(b.name));
  return {
    byProgramme: lines(programmes),
    byTeam: lines(teams),
    hourValuePaise,
    totals: toLine(
      "total",
      total.get("total") ?? emptyTally("Total"),
      hourValuePaise
    ),
  };
}
